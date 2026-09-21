const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// GET /api/wallet/:userId
router.get("/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required."
      });
    }

    const { data, error } = await supabase
      .from("wallet_balances")
      .select("user_id, deposit_balance, bonus_balance, winning_balance, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("WALLET FETCH ERROR:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Unable to load wallet."
      });
    }

    const deposit = cleanNumber(data?.deposit_balance);
    const bonus = cleanNumber(data?.bonus_balance);
    const winning = cleanNumber(data?.winning_balance);
    const total = Number((deposit + bonus + winning).toFixed(2));

    return res.status(200).json({
      success: true,
      wallet: {
        user_id: userId,
        deposit_balance: deposit,
        bonus_balance: bonus,
        winning_balance: winning,
        total_balance: total,
        created_at: data?.created_at || null
      }
    });
  } catch (error) {
    console.error("WALLET EXCEPTION:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error."
    });
  }
});

// GET /api/wallet/:userId/transactions
router.get("/:userId/transactions", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required."
      });
    }

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("WALLET TRANSACTIONS ERROR:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Unable to load transactions."
      });
    }

    const transactions = (data || []).map((item) => {
      const type = String(
        item.type || item.transaction_type || "WALLET"
      ).trim();

      const title = String(
        item.title ||
        item.description ||
        item.transaction_type ||
        item.type ||
        "Wallet Transaction"
      ).trim();

      const amount = cleanNumber(item.amount);
      const status = String(item.status || "COMPLETED").trim().toUpperCase();
      const referenceId =
        item.reference_id || item.order_id || item.orderId || null;

      return {
        id: String(item.id || referenceId || `${userId}-${item.created_at || Date.now()}`),
        user_id: userId,
        type,
        title,
        description: item.description || title,
        amount,
        status,
        reference_id: referenceId,
        orderId: item.order_id || item.orderId || referenceId,
        utr: item.utr || null,
        bonusPercent: cleanNumber(item.bonus_percent),
        bonusAmount: cleanNumber(item.bonus_amount),
        createdAt: item.created_at || null,
        paidAt: item.paid_at || null,
        processedAt: item.processed_at || null,
        created_at: item.created_at || null
      };
    });

    return res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error("WALLET TRANSACTIONS EXCEPTION:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error."
    });
  }
});

module.exports = router;
