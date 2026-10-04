const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const supabase = require("../config/supabase");

const {
    checkUserRestriction,
    restrictionResponse
} = require("../utils/userRestrictions");

const PAY0_CREATE_ORDER_URL =
    "https://pay0.shop/api/create-order";

const PAY0_STATUS_URL =
    "https://pay0.shop/api/check-order-status";

const ADD_MONEY_RESTRICTION_HOURS = 24;
const MAX_FAILED_GATEWAY_INITIATIONS = 10;


// ======================================================
// ORDER ID
// ======================================================

function generateOrderId() {
    return (
        "GA" +
        Date.now() +
        crypto.randomBytes(4).toString("hex").toUpperCase()
    );
}


// ======================================================
// GET LAST SUCCESSFUL DEPOSIT
// ======================================================

async function getLatestSuccessfulDeposit(userId) {
    const {
        data,
        error
    } = await supabase
        .from("deposit_orders")
        .select("created_at")
        .eq("user_id", userId)
        .eq("status", "SUCCESS")
        .order("created_at", {
            ascending: false
        })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error(
            "LATEST SUCCESSFUL DEPOSIT ERROR:",
            error
        );

        throw error;
    }

    return data || null;
}


// ======================================================
// COUNT UNSUCCESSFUL GATEWAY INITIATIONS
//
// Rolling 24 hour window.
//
// Latest successful deposit acts as a reset/checkpoint.
// ======================================================

async function getFailedGatewayInitiationCount(userId) {
    const now = new Date();

    const last24Hours = new Date(
        now.getTime() -
        24 * 60 * 60 * 1000
    );

    const latestSuccessfulDeposit =
        await getLatestSuccessfulDeposit(userId);

    let windowStart = last24Hours;

    if (
        latestSuccessfulDeposit?.created_at
    ) {
        const successTime =
            new Date(
                latestSuccessfulDeposit.created_at
            );

        if (
            successTime > windowStart
        ) {
            windowStart = successTime;
        }
    }

    const {
        count,
        error
    } = await supabase
        .from("deposit_orders")
        .select("id", {
            count: "exact",
            head: true
        })
        .eq("user_id", userId)
        .gte(
            "gateway_initiated_at",
            windowStart.toISOString()
        )
        .lt(
            "gateway_initiated_at",
            now.toISOString()
        )
        .neq(
            "status",
            "SUCCESS"
        );

    if (error) {
        console.error(
            "FAILED GATEWAY INITIATION COUNT ERROR:",
            error
        );

        throw error;
    }

    return Number(count || 0);
}


// ======================================================
// ACTIVATE AUTOMATIC ADD MONEY RESTRICTION
// ======================================================

async function activateAutomaticDepositRestriction(
    userId
) {
    const expiresAt = new Date(
        Date.now() +
        ADD_MONEY_RESTRICTION_HOURS *
            60 *
            60 *
            1000
    ).toISOString();

    const reason =
        "Automatic Add Money restriction after 10 unsuccessful gateway initiation attempts";

    // Check existing active deposit restriction
    const {
        data: existingRestriction,
        error: existingError
    } = await supabase
        .from("user_restrictions")
        .select("id")
        .eq("user_id", userId)
        .eq("feature", "deposit")
        .eq("is_active", true)
        .maybeSingle();

    if (existingError) {
        console.error(
            "CHECK EXISTING DEPOSIT RESTRICTION ERROR:",
            existingError
        );

        throw existingError;
    }

    if (existingRestriction) {
        const {
            error: updateError
        } = await supabase
            .from("user_restrictions")
            .update({
                expires_at: expiresAt,
                is_permanent: false,
                is_active: true,
                reason,
                updated_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                existingRestriction.id
            );

        if (updateError) {
            console.error(
                "UPDATE DEPOSIT RESTRICTION ERROR:",
                updateError
            );

            throw updateError;
        }

        return;
    }

    const {
        error: insertError
    } = await supabase
        .from("user_restrictions")
        .insert({
            user_id: userId,
            feature: "deposit",
            expires_at: expiresAt,
            is_permanent: false,
            is_active: true,
            reason
        });

    if (insertError) {
        console.error(
            "CREATE DEPOSIT RESTRICTION ERROR:",
            insertError
        );

        throw insertError;
    }

    console.log(
        "AUTOMATIC ADD MONEY RESTRICTION ACTIVATED:",
        {
            userId,
            expiresAt
        }
    );
}


// ======================================================
// CREATE DEPOSIT ORDER
// POST /api/deposit/create
// ======================================================

router.post("/create", async (req, res) => {
    try {
        const {
            userId,
            amount
        } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required"
            });
        }

        // ==================================================
        // FULL APP / ADD MONEY RESTRICTION CHECK
        // ==================================================

        const restrictionCheck =
            await checkUserRestriction(
                userId,
                "deposit"
            );

        if (restrictionCheck.restricted) {
            return restrictionResponse(
                res,
                restrictionCheck.feature,
                restrictionCheck.restriction
            );
        }

        // ==================================================
        // AMOUNT VALIDATION
        // ==================================================

        const depositAmount =
            Number(amount);

        if (
            !Number.isFinite(depositAmount) ||
            depositAmount < 10
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Minimum deposit amount is ₹10"
            });
        }

        if (
            depositAmount > 100000
        ) {
            return res.status(400).json({
                success: false,
                error:
                    "Maximum deposit amount is ₹1,00,000"
            });
        }

        // ==================================================
        // USER
        // ==================================================

        const {
            data: user,
            error: userError
        } = await supabase
            .from("users")
            .select(
                "id, full_name, phone"
            )
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            console.error(
                "DEPOSIT USER ERROR:",
                userError
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to fetch user"
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error:
                    "User not found"
            });
        }

        // ==================================================
        // PAY0 CONFIG
        // ==================================================

        const pay0ApiKey =
            process.env.PAY0_API_KEY;

        if (!pay0ApiKey) {
            console.error(
                "PAY0_API_KEY missing"
            );

            return res.status(500).json({
                success: false,
                error:
                    "Payment gateway is not configured"
            });
        }

        const appUrl =
            process.env.APP_URL ||
            "https://api.gamerzadda.in";

        // ==================================================
        // ORDER
        // ==================================================

        const orderId =
            generateOrderId();

        // ==================================================
        // SAVE PENDING ORDER
        // ==================================================

        const {
            error: insertError
        } = await supabase
            .from("deposit_orders")
            .insert({
                order_id: orderId,
                user_id: userId,
                amount: depositAmount,
                status: "PENDING",
                gateway_initiated_at: null
            });

        if (insertError) {
            console.error(
                "DEPOSIT INSERT ERROR:",
                insertError
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to create deposit order"
            });
        }

        // ==================================================
        // SAVE PENDING WALLET TRANSACTION
        // ==================================================

        const {
            error: pendingTransactionError
        } = await supabase
            .from("wallet_transactions")
            .insert({
                user_id: userId,
                amount: depositAmount,
                type: "deposit",
                description: "Add Money",
                status: "PENDING",
                reference_id: orderId
            });

        if (pendingTransactionError) {
            console.error(
                "PENDING TRANSACTION INSERT ERROR:",
                pendingTransactionError
            );

            await supabase
                .from("deposit_orders")
                .delete()
                .eq(
                    "order_id",
                    orderId
                );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to create wallet transaction"
            });
        }

        // ==================================================
        // PAY0 CREATE ORDER
        // ==================================================

        const form =
            new URLSearchParams();

        form.append(
            "customer_mobile",
            String(
                user.phone || ""
            )
        );

        form.append(
            "customer_name",
            String(
                user.full_name ||
                "Gamerzadda User"
            )
        );

        form.append(
            "user_token",
            pay0ApiKey
        );

        form.append(
            "amount",
            depositAmount.toFixed(2)
        );

        form.append(
            "order_id",
            orderId
        );

        form.append(
            "redirect_url",
            `${appUrl}/api/deposit/return`
        );

        form.append(
            "remark1",
            String(userId)
        );

        form.append(
            "remark2",
            "Gamerzadda Deposit"
        );

        console.log(
            "PAY0 CREATE:",
            orderId,
            depositAmount
        );

        const pay0Response =
            await fetch(
                PAY0_CREATE_ORDER_URL,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },
                    body:
                        form.toString()
                }
            );

        const responseText =
            await pay0Response.text();

        console.log(
            "PAY0 RESPONSE:",
            pay0Response.status,
            responseText
        );

        let pay0Data;

        try {
            pay0Data =
                JSON.parse(
                    responseText
                );
        } catch (error) {
            await supabase
                .from("deposit_orders")
                .update({
                    status: "FAILED"
                })
                .eq(
                    "order_id",
                    orderId
                );

            await supabase
                .from("wallet_transactions")
                .update({
                    status: "FAILED",
                    description:
                        "Add Money - Payment setup failed"
                })
                .eq(
                    "reference_id",
                    orderId
                )
                .eq(
                    "status",
                    "PENDING"
                );

            return res.status(502).json({
                success: false,
                error:
                    "Invalid response from payment gateway"
            });
        }

        // ==================================================
        // PAY0 ERROR
        // ==================================================

        if (
            !pay0Response.ok ||
            pay0Data.status !== true
        ) {
            await supabase
                .from("deposit_orders")
                .update({
                    status: "FAILED"
                })
                .eq(
                    "order_id",
                    orderId
                );

            await supabase
                .from("wallet_transactions")
                .update({
                    status: "FAILED",
                    description:
                        "Add Money - Payment setup failed"
                })
                .eq(
                    "reference_id",
                    orderId
                )
                .eq(
                    "status",
                    "PENDING"
                );

            return res.status(502).json({
                success: false,
                error:
                    pay0Data.message ||
                    "Payment gateway rejected the order"
            });
        }

        // ==================================================
        // PAYMENT URL
        // ==================================================

        const paymentUrl =
            pay0Data?.result?.payment_url ||
            pay0Data?.payment_url ||
            pay0Data?.result?.paymentUrl ||
            pay0Data?.paymentUrl ||
            pay0Data?.url;

        if (!paymentUrl) {
            await supabase
                .from("deposit_orders")
                .update({
                    status: "FAILED"
                })
                .eq(
                    "order_id",
                    orderId
                );

            await supabase
                .from("wallet_transactions")
                .update({
                    status: "FAILED",
                    description:
                        "Add Money - Payment setup failed"
                })
                .eq(
                    "reference_id",
                    orderId
                )
                .eq(
                    "status",
                    "PENDING"
                );

            return res.status(502).json({
                success: false,
                error:
                    "Payment URL not received"
            });
        }

        // ==================================================
        // GATEWAY INITIATED
        //
        // IMPORTANT:
        // Count only when Pay0 actually returned a valid
        // payment URL.
        // ==================================================

        const gatewayInitiatedAt =
            new Date().toISOString();

        const {
            error: gatewayTimestampError
        } = await supabase
            .from("deposit_orders")
            .update({
                gateway_initiated_at:
                    gatewayInitiatedAt
            })
            .eq(
                "order_id",
                orderId
            );

        if (gatewayTimestampError) {
            console.error(
                "GATEWAY INITIATED TIMESTAMP ERROR:",
                gatewayTimestampError
            );

            // Security/anti-abuse tracking must not silently fail.
            await supabase
                .from("deposit_orders")
                .update({
                    status: "FAILED"
                })
                .eq(
                    "order_id",
                    orderId
                );

            await supabase
                .from("wallet_transactions")
                .update({
                    status: "FAILED",
                    description:
                        "Add Money - Tracking error"
                })
                .eq(
                    "reference_id",
                    orderId
                )
                .eq(
                    "status",
                    "PENDING"
                );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to initialize payment securely"
            });
        }

        // ==================================================
        // CHECK 10 UNSUCCESSFUL INITIATIONS
        // ==================================================

        try {
            const attemptCount =
                await getFailedGatewayInitiationCount(
                    userId
                );

            console.log(
                "ADD MONEY GATEWAY ATTEMPTS:",
                {
                    userId,
                    attemptCount
                }
            );

            if (
                attemptCount >=
                MAX_FAILED_GATEWAY_INITIATIONS
            ) {
                await activateAutomaticDepositRestriction(
                    userId
                );
            }
        } catch (antiAbuseError) {
            // Do not break a valid payment flow because
            // monitoring failed. Log it for admin/server review.
            console.error(
                "ADD MONEY ANTI-ABUSE CHECK ERROR:",
                antiAbuseError
            );
        }

        // ==================================================
        // RESPONSE
        // ==================================================

        return res.status(200).json({
            success: true,
            orderId,
            amount: depositAmount,
            paymentUrl
        });

    } catch (error) {
        console.error(
            "DEPOSIT CREATE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Internal server error"
        });
    }
});


// ======================================================
// CHECK PAYMENT + CREDIT WALLET
// POST /api/deposit/status
// ======================================================

router.post("/status", async (req, res) => {
    try {
        const {
            orderId
        } = req.body;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                error:
                    "Order ID is required"
            });
        }

        const pay0ApiKey =
            process.env.PAY0_API_KEY;

        if (!pay0ApiKey) {
            return res.status(500).json({
                success: false,
                error:
                    "Payment gateway is not configured"
            });
        }

        // ==================================================
        // GET LOCAL ORDER
        // ==================================================

        const {
            data: order,
            error: orderError
        } = await supabase
            .from("deposit_orders")
            .select(
                "id, order_id, user_id, amount, status"
            )
            .eq(
                "order_id",
                orderId
            )
            .maybeSingle();

        if (orderError) {
            console.error(
                "ORDER FETCH ERROR:",
                orderError
            );

            return res.status(500).json({
                success: false,
                error:
                    orderError.message
            });
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                error:
                    "Deposit order not found"
            });
        }

        // ==================================================
        // ALREADY SUCCESS
        // ==================================================

        if (
            String(order.status)
                .toUpperCase() ===
            "SUCCESS"
        ) {
            const {
                data: successHistoryRows,
                error:
                    successHistoryFetchError
            } = await supabase
                .from("wallet_transactions")
                .select(
                    "id, status, created_at"
                )
                .eq(
                    "reference_id",
                    orderId
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

            if (
                successHistoryFetchError
            ) {
                console.error(
                    "ALREADY SUCCESS HISTORY FETCH ERROR:",
                    successHistoryFetchError
                );
            } else if (
                successHistoryRows?.length
            ) {
                const successfulRow =
                    successHistoryRows.find(
                        row =>
                            String(
                                row.status
                            ).toUpperCase() ===
                            "SUCCESS"
                    );

                if (!successfulRow) {
                    await supabase
                        .from(
                            "wallet_transactions"
                        )
                        .update({
                            status:
                                "SUCCESS",
                            type:
                                "deposit",
                            description:
                                "Add Money",
                            amount:
                                Number(
                                    order.amount
                                )
                        })
                        .eq(
                            "id",
                            successHistoryRows[0]
                                .id
                        );
                }

                await supabase
                    .from(
                        "wallet_transactions"
                    )
                    .delete()
                    .eq(
                        "reference_id",
                        orderId
                    )
                    .in(
                        "status",
                        [
                            "PENDING",
                            "CANCELLED"
                        ]
                    );
            } else {
                await supabase
                    .from(
                        "wallet_transactions"
                    )
                    .insert({
                        user_id:
                            order.user_id,
                        amount:
                            Number(
                                order.amount
                            ),
                        type:
                            "deposit",
                        description:
                            "Add Money",
                        status:
                            "SUCCESS",
                        reference_id:
                            orderId
                    });
            }

            return res.json({
                success: true,
                paid: true,
                alreadyProcessed:
                    true,
                orderId:
                    order.order_id,
                amount:
                    Number(
                        order.amount
                    ),
                status:
                    "SUCCESS"
            });
        }

        // ==================================================
        // PAY0 STATUS REQUEST
        // ==================================================

        const form =
            new URLSearchParams();

        form.append(
            "user_token",
            pay0ApiKey
        );

        form.append(
            "order_id",
            orderId
        );

        const pay0Response =
            await fetch(
                PAY0_STATUS_URL,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },
                    body:
                        form.toString()
                }
            );

        const responseText =
            await pay0Response.text();

        console.log(
            "PAY0 STATUS:",
            orderId,
            responseText
        );

        let pay0Data;

        try {
            pay0Data =
                JSON.parse(
                    responseText
                );
        } catch {
            return res.status(502).json({
                success: false,
                error:
                    "Invalid payment status response"
            });
        }

        if (
            !pay0Response.ok ||
            pay0Data.status !== true
        ) {
            return res.status(502).json({
                success: false,
                error:
                    pay0Data.message ||
                    "Unable to check payment status"
            });
        }

        const result =
            pay0Data.result || {};

        const txnStatus =
            String(
                result.txnStatus ||
                ""
            ).toUpperCase();

        const paidAmount =
            Number(
                result.amount || 0
            );

        const utr =
            result.utr || null;

        // ==================================================
        // PAYMENT NOT SUCCESS
        // ==================================================

        if (
            txnStatus !== "SUCCESS"
        ) {
            const historyStatus =
                txnStatus === "CANCELLED" ||
                txnStatus === "CANCELED"
                    ? "CANCELLED"
                    : txnStatus === "FAILED" ||
                      txnStatus === "FAILURE" ||
                      txnStatus === "DECLINED" ||
                      txnStatus === "REJECTED"
                        ? "FAILED"
                        : "PENDING";

            const historyDescription =
                historyStatus ===
                "CANCELLED"
                    ? "Add Money - Payment cancelled"
                    : historyStatus ===
                      "FAILED"
                        ? "Add Money - Payment failed"
                        : "Add Money - Payment pending";

            await supabase
                .from("deposit_orders")
                .update({
                    status:
                        txnStatus ||
                        "PENDING"
                })
                .eq(
                    "order_id",
                    orderId
                )
                .neq(
                    "status",
                    "SUCCESS"
                );

            await supabase
                .from(
                    "wallet_transactions"
                )
                .update({
                    status:
                        historyStatus,
                    description:
                        historyDescription
                })
                .eq(
                    "reference_id",
                    orderId
                )
                .eq(
                    "status",
                    "PENDING"
                );

            return res.json({
                success: true,
                paid: false,
                orderId:
                    order.order_id,
                status:
                    txnStatus ||
                    "PENDING"
            });
        }

        // ==================================================
        // AMOUNT CHECK
        // ==================================================

        const expectedAmount =
            Number(order.amount);

        if (
            paidAmount !==
            expectedAmount
        ) {
            console.error(
                "PAYMENT AMOUNT MISMATCH:",
                {
                    orderId,
                    expectedAmount,
                    paidAmount
                }
            );

            await supabase
                .from("deposit_orders")
                .update({
                    status:
                        "AMOUNT_MISMATCH"
                })
                .eq(
                    "order_id",
                    orderId
                );

            await supabase
                .from(
                    "wallet_transactions"
                )
                .update({
                    status:
                        "FAILED",
                    description:
                        "Add Money - Amount mismatch"
                })
                .eq(
                    "reference_id",
                    orderId
                )
                .eq(
                    "status",
                    "PENDING"
                );

            return res.status(400).json({
                success: false,
                error:
                    "Payment amount mismatch"
            });
        }

        // ==================================================
        // ATOMIC WALLET CREDIT
        // ==================================================

        const {
            data: rpcResult,
            error: rpcError
        } = await supabase.rpc(
            "process_successful_deposit",
            {
                p_order_id:
                    orderId,
                p_utr:
                    utr
            }
        );

        if (rpcError) {
            console.error(
                "DEPOSIT RPC ERROR:",
                rpcError
            );

            return res.status(500).json({
                success: false,
                error:
                    "Unable to credit wallet",
                details:
                    rpcError.message
            });
        }

        if (
            !rpcResult ||
            rpcResult.success !== true
        ) {
            console.error(
                "DEPOSIT RPC FAILED:",
                rpcResult
            );

            return res.status(500).json({
                success: false,
                error:
                    rpcResult?.error ||
                    "Wallet credit failed"
            });
        }

        // ==================================================
        // SUCCESSFUL TRANSACTION HISTORY
        // ==================================================

        const {
            data: existingTransactions,
            error:
                transactionFetchError
        } = await supabase
            .from(
                "wallet_transactions"
            )
            .select(
                "id, status, created_at"
            )
            .eq(
                "reference_id",
                orderId
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

        if (
            transactionFetchError
        ) {
            console.error(
                "SUCCESS HISTORY FETCH ERROR:",
                transactionFetchError
            );
        } else {
            const existingTransaction =
                existingTransactions?.[0] ||
                null;

            if (
                existingTransaction
            ) {
                const {
                    error:
                        transactionUpdateError
                } = await supabase
                    .from(
                        "wallet_transactions"
                    )
                    .update({
                        status:
                            "SUCCESS",
                        type:
                            "deposit",
                        description:
                            "Add Money",
                        amount:
                            expectedAmount
                    })
                    .eq(
                        "id",
                        existingTransaction.id
                    );

                if (
                    transactionUpdateError
                ) {
                    console.error(
                        "SUCCESS HISTORY UPDATE ERROR:",
                        transactionUpdateError
                    );
                }
            } else {
                const {
                    error:
                        transactionInsertError
                } = await supabase
                    .from(
                        "wallet_transactions"
                    )
                    .insert({
                        user_id:
                            order.user_id,
                        amount:
                            expectedAmount,
                        type:
                            "deposit",
                        description:
                            "Add Money",
                        status:
                            "SUCCESS",
                        reference_id:
                            orderId
                    });

                if (
                    transactionInsertError
                ) {
                    console.error(
                        "SUCCESS HISTORY INSERT ERROR:",
                        transactionInsertError
                    );
                }
            }

            const {
                error:
                    duplicateCleanupError
            } = await supabase
                .from(
                    "wallet_transactions"
                )
                .delete()
                .eq(
                    "reference_id",
                    orderId
                )
                .in(
                    "status",
                    [
                        "PENDING",
                        "CANCELLED"
                    ]
                );

            if (
                duplicateCleanupError
            ) {
                console.error(
                    "DUPLICATE HISTORY CLEANUP ERROR:",
                    duplicateCleanupError
                );
            }
        }

        // ==================================================
        // FINAL SUCCESS RESPONSE
        // ==================================================

        return res.json({
            success: true,
            paid: true,
            alreadyProcessed:
                rpcResult.already_processed ||
                false,
            orderId,
            amount:
                expectedAmount,
            status:
                "SUCCESS",
            utr,
            depositBalance:
                rpcResult.deposit_balance
        });

    } catch (error) {
        console.error(
            "DEPOSIT STATUS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Internal server error"
        });
    }
});


// ======================================================
// CANCEL DEPOSIT
// POST /api/deposit/cancel
// ======================================================

router.post("/cancel", async (req, res) => {
    try {
        const orderId =
            String(
                req.body?.orderId || ""
            ).trim();

        if (!orderId) {
            return res.status(400).json({
                success: false,
                error:
                    "Order ID is required"
            });
        }

        const {
            data: order,
            error: orderError
        } = await supabase
            .from("deposit_orders")
            .select(
                "id, order_id, user_id, amount, status"
            )
            .eq(
                "order_id",
                orderId
            )
            .maybeSingle();

        if (orderError) {
            return res.status(500).json({
                success: false,
                error:
                    orderError.message
            });
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                error:
                    "Deposit order not found"
            });
        }

        if (
            String(order.status)
                .toUpperCase() ===
            "SUCCESS"
        ) {
            return res.json({
                success: true,
                cancelled: false,
                orderId,
                status:
                    "SUCCESS"
            });
        }

        const {
            error: transactionError
        } = await supabase
            .from(
                "wallet_transactions"
            )
            .update({
                status:
                    "CANCELLED",
                description:
                    "Add Money - Payment cancelled"
            })
            .eq(
                "reference_id",
                orderId
            )
            .eq(
                "status",
                "PENDING"
            );

        if (transactionError) {
            console.error(
                "CANCEL TRANSACTION UPDATE ERROR:",
                transactionError
            );
        }

        return res.json({
            success: true,
            cancelled: true,
            orderId,
            amount:
                Number(
                    order.amount
                ),
            status:
                "CANCELLED"
        });

    } catch (error) {
        console.error(
            "DEPOSIT CANCEL ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Unable to cancel deposit"
        });
    }
});


// ======================================================
// PAYMENT RETURN
// GET /api/deposit/return
// ======================================================

router.all("/return", async (req, res) => {
    try {
        const orderId =
            req.body?.order_id ||
            req.query?.order_id ||
            req.body?.orderId ||
            req.query?.orderId;

        return res.status(200).send(`
<!DOCTYPE html>
<html>
<head>
<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
/>
<title>Gamerzadda Payment</title>
</head>

<body
style="
font-family:Arial;
text-align:center;
padding:50px;
background:#ffffff;
"
>

<h2 style="color:#16a34a;">
Payment Submitted
</h2>

<p>
Your payment is being verified.
</p>

${
    orderId
        ? `
<p>
Order ID:
<strong>${String(orderId)}</strong>
</p>
`
        : ""
}

<p>
You can return to Gamerzadda.
</p>

</body>
</html>
`);

    } catch (error) {
        console.error(
            "PAYMENT RETURN ERROR:",
            error
        );

        return res.status(500).send(
            "Payment return error"
        );
    }
});


module.exports = router;