const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// ============================================================
// GET WALLET
// GET /api/wallet/:userId
// ============================================================
router.get("/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required."
      });
    }

    console.log("WALLET REQUEST:", userId);

    const { data, error } = await supabase
      .from("wallet_balances")
      .select(
        "user_id, deposit_balance, bonus_balance, winning_balance, created_at, updated_at"
      )
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("WALLET SUPABASE ERROR:", {
        userId,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      return res.status(500).json({
        success: false,
        error: error.message || "Unable to load wallet."
      });
    }

    if (!data) {
      console.error(
        "WALLET ROW NOT FOUND FOR USER:",
        userId
      );

      return res.status(404).json({
        success: false,
        error: "Wallet not found for this user.",
        user_id: userId
      });
    }

    const deposit = cleanNumber(data.deposit_balance);
    const bonus = cleanNumber(data.bonus_balance);
    const winning = cleanNumber(data.winning_balance);

    const total = Number(
      (deposit + bonus + winning).toFixed(2)
    );

    console.log("WALLET RESULT:", {
      userId,
      deposit,
      bonus,
      winning,
      total
    });

    return res.status(200).json({
      success: true,
      wallet: {
        user_id: data.user_id || userId,

        deposit_balance: deposit,
        bonus_balance: bonus,
        winning_balance: winning,

        total_balance: total,

        created_at: data.created_at || null,
        updated_at: data.updated_at || null
      }
    });

  } catch (error) {
    console.error("WALLET EXCEPTION:", {
      message: error?.message,
      stack: error?.stack
    });

    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error."
    });
  }
});


// ============================================================
// GET WALLET TRANSACTIONS
// GET /api/wallet/:userId/transactions
// ============================================================
router.get("/:userId/transactions", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required."
      });
    }

    console.log(
      "WALLET TRANSACTIONS REQUEST:",
      userId
    );

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error(
        "WALLET TRANSACTIONS ERROR:",
        {
          userId,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        }
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Unable to load transactions."
      });
    }

    const transactions = (data || []).map((item) => {
      const type = String(
        item.type ||
        item.transaction_type ||
        "WALLET"
      ).trim();

      const title = String(
        item.title ||
        item.description ||
        item.transaction_type ||
        item.type ||
        "Wallet Transaction"
      ).trim();

      const description = String(
        item.description ||
        title ||
        "Wallet Transaction"
      ).trim();

      const amount = cleanNumber(item.amount);

      const status = String(
        item.status ||
        "COMPLETED"
      )
        .trim()
        .toUpperCase();

      const referenceId =
        item.reference_id ||
        item.order_id ||
        item.orderId ||
        null;

      const transactionId =
        item.id ||
        referenceId ||
        `${userId}-${item.created_at || Date.now()}`;

      return {
        id: String(transactionId),

        user_id: userId,

        type,

        title,

        description,

        amount,

        status,

        reference_id: referenceId,

        orderId:
          item.order_id ||
          item.orderId ||
          referenceId ||
          null,

        utr:
          item.utr ||
          null,

        bonusPercent:
          cleanNumber(item.bonus_percent),

        bonusAmount:
          cleanNumber(item.bonus_amount),

        createdAt:
          item.created_at ||
          null,

        paidAt:
          item.paid_at ||
          null,

        processedAt:
          item.processed_at ||
          null,

        created_at:
          item.created_at ||
          null
      };
    });

    console.log(
      "WALLET TRANSACTIONS RESULT:",
      {
        userId,
        count: transactions.length
      }
    );

    return res.status(200).json({
      success: true,
      transactions
    });

  } catch (error) {
    console.error(
      "WALLET TRANSACTIONS EXCEPTION:",
      {
        message: error?.message,
        stack: error?.stack
      }
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Internal server error."
    });
  }
});


module.exports = router;