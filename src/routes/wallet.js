const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");

/*
======================================================
GET WALLET BALANCE
GET /api/wallet/:userId
======================================================
*/
router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required"
            });
        }

        const {
            data,
            error
        } = await supabase
            .from("wallet_balances")
            .select(
                `
                user_id,
                deposit_balance,
                bonus_balance,
                winning_balance,
                created_at,
                updated_at
                `
            )
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            console.error(
                "WALLET SUPABASE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Wallet not found",
                user_id: userId
            });
        }

        const deposit = Number(
            data.deposit_balance || 0
        );

        const bonus = Number(
            data.bonus_balance || 0
        );

        const winning = Number(
            data.winning_balance || 0
        );

        return res.status(200).json({
            success: true,

            wallet: {
                user_id: data.user_id,

                deposit_balance: deposit,

                bonus_balance: bonus,

                winning_balance: winning,

                total_balance:
                    deposit +
                    bonus +
                    winning,

                created_at:
                    data.created_at,

                updated_at:
                    data.updated_at
            }
        });

    } catch (error) {
        console.error(
            "WALLET API ERROR:",
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


/*
======================================================
GET TRANSACTION HISTORY
GET /api/wallet/:userId/transactions
======================================================

Uses deposit_orders as the transaction history.
No separate transactions table is required.
======================================================
*/
router.get(
    "/:userId/transactions",
    async (req, res) => {
        try {
            const { userId } = req.params;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: "User ID is required"
                });
            }

            const {
                data,
                error
            } = await supabase
                .from("deposit_orders")
                .select(
                    `
                    id,
                    user_id,
                    order_id,
                    amount,
                    status,
                    utr,
                    created_at,
                    paid_at,
                    processed_at,
                    bonus_percent,
                    bonus_amount
                    `
                )
                .eq("user_id", userId)
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );

            if (error) {
                console.error(
                    "TRANSACTION HISTORY SUPABASE ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                });
            }

            const transactions =
                (data || []).map((item) => {

                    const amount =
                        Number(
                            item.amount || 0
                        );

                    const bonusAmount =
                        Number(
                            item.bonus_amount || 0
                        );

                    return {
                        id: item.id,

                        type: "DEPOSIT",

                        title: "Add Money",

                        amount: amount,

                        status:
                            String(
                                item.status ||
                                "PENDING"
                            ).toUpperCase(),

                        order_id:
                            item.order_id,

                        utr:
                            item.utr || null,

                        bonus_percent:
                            Number(
                                item.bonus_percent ||
                                0
                            ),

                        bonus_amount:
                            bonusAmount,

                        created_at:
                            item.created_at,

                        paid_at:
                            item.paid_at,

                        processed_at:
                            item.processed_at
                    };
                });

            return res.status(200).json({
                success: true,

                count:
                    transactions.length,

                transactions:
                    transactions
            });

        } catch (error) {
            console.error(
                "TRANSACTION HISTORY API ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Internal server error"
            });
        }
    }
);


module.exports = router;