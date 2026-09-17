const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");

// GET /api/wallet/:userId
router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required"
            });
        }

        const { data, error } = await supabase
            .from("wallet_balances")
            .select(
                "user_id, deposit_balance, bonus_balance, winning_balance, created_at"
            )
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            console.error("WALLET SUPABASE ERROR:", error);

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

        const deposit = Number(data.deposit_balance || 0);
        const bonus = Number(data.bonus_balance || 0);
        const winning = Number(data.winning_balance || 0);

        return res.json({
            success: true,
            wallet: {
                user_id: data.user_id,
                deposit_balance: deposit,
                bonus_balance: bonus,
                winning_balance: winning,
                total_balance: deposit + bonus + winning,
                created_at: data.created_at
            }
        });

    } catch (error) {
        console.error("WALLET API ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Internal server error"
        });
    }
});

module.exports = router;