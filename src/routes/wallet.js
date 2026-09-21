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
            .select(`
                user_id,
                deposit_balance,
                bonus_balance,
                winning_balance,
                created_at,
                updated_at
            `)
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
GET ALL WALLET TRANSACTIONS
GET /api/wallet/:userId/transactions
======================================================

Reads ALL wallet activity from wallet_transactions.

Examples:
- Add Money
- Deposit
- Withdrawal
- Tournament Entry
- Tournament Refund
- Winning / Prize
- Referral Reward
- Signup Bonus
- Spin Reward
- Other wallet activities
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

            /*
            ------------------------------------------
            Get ALL wallet transactions
            ------------------------------------------
            */
            const {
                data,
                error
            } = await supabase
                .from("wallet_transactions")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", {
                    ascending: false
                });

            if (error) {
                console.error(
                    "WALLET TRANSACTIONS SUPABASE ERROR:",
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

            /*
            ------------------------------------------
            Normalize transactions
            ------------------------------------------
            */
            const transactions =
                (data || []).map((item) => {

                    const amount = Number(
                        item.amount || 0
                    );

                    const bonusAmount = Number(
                        item.bonus_amount || 0
                    );

                    const bonusPercent = Number(
                        item.bonus_percent || 0
                    );

                    /*
                    Find transaction type
                    */
                    const type = String(
                        item.type ||
                        item.transaction_type ||
                        "WALLET"
                    ).toUpperCase();

                    /*
                    Find title
                    */
                    const title =
                        item.title ||
                        item.description ||
                        item.transaction_type ||
                        item.type ||
                        "Wallet Transaction";

                    /*
                    Find status
                    */
                    const status = String(
                        item.status ||
                        "COMPLETED"
                    ).toUpperCase();

                    /*
                    Find reference ID
                    */
                    const referenceId =
                        item.reference_id ||
                        item.order_id ||
                        item.orderId ||
                        null;

                    return {
                        id:
                            item.id ||
                            referenceId ||
                            `${userId}-${item.created_at}`,

                        type: type,

                        title: title,

                        amount: amount,

                        status: status,

                        order_id:
                            item.order_id ||
                            null,

                        utr:
                            item.utr ||
                            null,

                        bonus_percent:
                            bonusPercent,

                        bonus_amount:
                            bonusAmount,

                        created_at:
                            item.created_at ||
                            null,

                        paid_at:
                            item.paid_at ||
                            null,

                        processed_at:
                            item.processed_at ||
                            null,

                        reference_id:
                            referenceId
                    };
                });

            /*
            ------------------------------------------
            Response
            ------------------------------------------
            */
            return res.status(200).json({
                success: true,

                count:
                    transactions.length,

                transactions:
                    transactions
            });

        } catch (error) {
            console.error(
                "WALLET TRANSACTIONS API ERROR:",
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