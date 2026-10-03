const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const supabase = require("../config/supabase");

const PAY0_CREATE_ORDER_URL =
    "https://pay0.shop/api/create-order";

const PAY0_STATUS_URL =
    "https://pay0.shop/api/check-order-status";


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
// CREATE DEPOSIT ORDER
// POST /api/deposit/create
// ======================================================

router.post("/create", async (req, res) => {
    try {
        const { userId, amount } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required"
            });
        }

        const depositAmount = Number(amount);

        if (
            !Number.isFinite(depositAmount) ||
            depositAmount < 10
        ) {
            return res.status(400).json({
                success: false,
                error: "Minimum deposit amount is ₹10"
            });
        }

        if (depositAmount > 100000) {
            return res.status(400).json({
                success: false,
                error: "Maximum deposit amount is ₹1,00,000"
            });
        }

        // ==============================================
        // USER
        // ==============================================

        const {
            data: user,
            error: userError
        } = await supabase
            .from("users")
            .select("id, full_name, phone")
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            console.error(
                "DEPOSIT USER ERROR:",
                userError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to fetch user"
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found"
            });
        }

        // ==============================================
        // PAY0 CONFIG
        // ==============================================

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

        // ==============================================
        // ORDER
        // ==============================================

        const orderId =
            generateOrderId();

        // ==============================================
        // SAVE PENDING ORDER
        // ==============================================

        const {
            error: insertError
        } = await supabase
            .from("deposit_orders")
            .insert({
                order_id: orderId,
                user_id: userId,
                amount: depositAmount,
                status: "PENDING"
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

        // ==============================================
        // SAVE PENDING WALLET TRANSACTION
        // ==============================================
        // This creates the history entry immediately.
        // It will be updated on payment result.
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

            // Do not leave a deposit order without its history row.
            await supabase
                .from("deposit_orders")
                .delete()
                .eq("order_id", orderId);

            return res.status(500).json({
                success: false,
                error:
                    "Unable to create wallet transaction"
            });
        }

        // ==============================================
        // PAY0 CREATE ORDER
        // ==============================================

        const form =
            new URLSearchParams();

        form.append(
            "customer_mobile",
            String(user.phone || "")
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
                JSON.parse(responseText);
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
                    description: "Add Money - Payment setup failed"
                })
                .eq("reference_id", orderId)
                .eq("status", "PENDING");

            return res.status(502).json({
                success: false,
                error:
                    "Invalid response from payment gateway"
            });
        }

        // ==============================================
        // PAY0 ERROR
        // ==============================================

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
                    description: "Add Money - Payment setup failed"
                })
                .eq("reference_id", orderId)
                .eq("status", "PENDING");

            return res.status(502).json({
                success: false,
                error:
                    pay0Data.message ||
                    "Payment gateway rejected the order"
            });
        }

        // ==============================================
        // PAYMENT URL
        // ==============================================

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
                    description: "Add Money - Payment setup failed"
                })
                .eq("reference_id", orderId)
                .eq("status", "PENDING");

            return res.status(502).json({
                success: false,
                error:
                    "Payment URL not received"
            });
        }

        // ==============================================
        // RESPONSE
        // ==============================================

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
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: "Order ID is required"
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

        // ==============================================
        // GET LOCAL ORDER
        // ==============================================

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

        // ==============================================
        // ALREADY SUCCESS
        // ==============================================

        if (
            String(order.status)
                .toUpperCase() ===
            "SUCCESS"
        ) {
            // Repair/restore history if an older successful payment
            // was credited but its history row is missing.
            const { data: existingHistory } = await supabase
                .from("wallet_transactions")
                .select("id, status")
                .eq("reference_id", orderId)
                .order("created_at", { ascending: false });

            const historyRow = (existingHistory || [])[0];

            if (historyRow) {
                await supabase
                    .from("wallet_transactions")
                    .update({
                        amount: Number(order.amount),
                        type: "deposit",
                        description: "Add Money",
                        status: "SUCCESS"
                    })
                    .eq("id", historyRow.id);
            } else {
                await supabase
                    .from("wallet_transactions")
                    .insert({
                        user_id: order.user_id,
                        amount: Number(order.amount),
                        type: "deposit",
                        description: "Add Money",
                        status: "SUCCESS",
                        reference_id: orderId
                    });
            }

            // Remove any stale temporary history rows for this
            // already-successful order. Never touch the SUCCESS row.
            const { error: staleHistoryCleanupError } = await supabase
                .from("wallet_transactions")
                .delete()
                .eq("reference_id", orderId)
                .in("status", ["PENDING", "CANCELLED"]);

            if (staleHistoryCleanupError) {
                console.error(
                    "STALE HISTORY CLEANUP ERROR:",
                    staleHistoryCleanupError
                );
            }

            return res.json({
                success: true,
                paid: true,
                alreadyProcessed: true,
                orderId:
                    order.order_id,
                amount:
                    Number(order.amount),
                status: "SUCCESS"
            });
        }

        // ==============================================
        // PAY0 STATUS REQUEST
        // ==============================================

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
                JSON.parse(responseText);
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
            result.utr ||
            null;

        // ==============================================
        // PAYMENT NOT SUCCESS
        // ==============================================

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
                historyStatus === "CANCELLED"
                    ? "Add Money - Payment cancelled"
                    : historyStatus === "FAILED"
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
                .from("wallet_transactions")
                .update({
                    status: historyStatus,
                    description: historyDescription
                })
                .eq("reference_id", orderId)
                .eq("status", "PENDING");

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

        // ==============================================
        // AMOUNT CHECK
        // ==============================================

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
                .from("wallet_transactions")
                .update({
                    status: "FAILED",
                    description: "Add Money - Amount mismatch"
                })
                .eq("reference_id", orderId)
                .eq("status", "PENDING");

            return res.status(400).json({
                success: false,
                error:
                    "Payment amount mismatch"
            });
        }

        // ==============================================
        // ATOMIC WALLET CREDIT
        // ==============================================

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

        // ==============================================
        // RPC RESULT
        // ==============================================

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

        // ======================================================
        // SAVE SUCCESSFUL TRANSACTION HISTORY
        // ======================================================
        // Keep the original PENDING history row and convert it to
        // SUCCESS. This makes history independent of whether the
        // wallet-credit RPC also writes a ledger row.
        // If a SUCCESS row already exists, update/reuse it instead
        // of creating a duplicate.
        const {
            data: existingHistoryRows,
            error: historyFindError
        } = await supabase
            .from("wallet_transactions")
            .select("id, status")
            .eq("reference_id", orderId)
            .order("created_at", { ascending: false });

        if (historyFindError) {
            console.error(
                "SUCCESS HISTORY FIND ERROR:",
                historyFindError
            );
        } else {
            const successRow = (existingHistoryRows || []).find(
                row => String(row.status || "").toUpperCase() === "SUCCESS"
            );

            const rowToUpdate = successRow || (existingHistoryRows || [])[0];

            if (rowToUpdate) {
                const { error: historyUpdateError } = await supabase
                    .from("wallet_transactions")
                    .update({
                        amount: expectedAmount,
                        type: "deposit",
                        description: "Add Money",
                        status: "SUCCESS",
                        ...(utr ? { utr } : {})
                    })
                    .eq("id", rowToUpdate.id);

                if (historyUpdateError) {
                    console.error(
                        "SUCCESS HISTORY UPDATE ERROR:",
                        historyUpdateError
                    );
                }
            } else {
                const { error: historyInsertError } = await supabase
                    .from("wallet_transactions")
                    .insert({
                        user_id: order.user_id,
                        amount: expectedAmount,
                        type: "deposit",
                        description: "Add Money",
                        status: "SUCCESS",
                        reference_id: orderId,
                        ...(utr ? { utr } : {})
                    });

                if (historyInsertError) {
                    console.error(
                        "SUCCESS HISTORY INSERT ERROR:",
                        historyInsertError
                    );
                }
            }
        }

        // Remove stale temporary rows after the SUCCESS row is
        // confirmed/created. This prevents SUCCESS + PENDING
        // duplicates from appearing in wallet history.
        const { error: staleHistoryCleanupError } = await supabase
            .from("wallet_transactions")
            .delete()
            .eq("reference_id", orderId)
            .in("status", ["PENDING", "CANCELLED"]);

        if (staleHistoryCleanupError) {
            console.error(
                "STALE HISTORY CLEANUP ERROR:",
                staleHistoryCleanupError
            );
        }

        // ==============================================
        // FINAL RESPONSE
        // ==============================================

        return res.json({
            success: true,
            paid: true,
            alreadyProcessed:
                rpcResult.already_processed ||
                false,
            orderId:
                orderId,
            amount:
                expectedAmount,
            status:
                "SUCCESS",
            utr:
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
        const orderId = String(req.body?.orderId || "").trim();

        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: "Order ID is required"
            });
        }

        const {
            data: order,
            error: orderError
        } = await supabase
            .from("deposit_orders")
            .select("id, order_id, user_id, amount, status")
            .eq("order_id", orderId)
            .maybeSingle();

        if (orderError) {
            return res.status(500).json({
                success: false,
                error: orderError.message
            });
        }

        if (!order) {
            return res.status(404).json({
                success: false,
                error: "Deposit order not found"
            });
        }

        // Never cancel a deposit that is already successful.
        if (String(order.status).toUpperCase() === "SUCCESS") {
            return res.json({
                success: true,
                cancelled: false,
                orderId,
                status: "SUCCESS"
            });
        }

        // Keep the local order available for final gateway verification.
        // A user cancelling the screen does not prove that the gateway
        // cancelled the payment; the gateway may still complete it.
        const {
            error: transactionError
        } = await supabase
            .from("wallet_transactions")
            .update({
                status: "CANCELLED",
                description: "Add Money - Payment cancelled"
            })
            .eq("reference_id", orderId)
            .eq("status", "PENDING");

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
            amount: Number(order.amount),
            status: "CANCELLED"
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