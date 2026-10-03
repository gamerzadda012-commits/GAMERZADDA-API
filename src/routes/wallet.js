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
      console.error("WALLET ROW NOT FOUND FOR USER:", userId);

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
//
// First 30:
// GET /api/wallet/:userId/transactions
//
// Next 30:
// GET /api/wallet/:userId/transactions?page=2
//
// Or explicitly:
// GET /api/wallet/:userId/transactions?page=1&pageSize=30
//
// MAX PAGE SIZE = 30
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

    // ----------------------------------------------------------
    // Pagination
    // ----------------------------------------------------------

    let page = Number.parseInt(
      String(req.query.page || "1"),
      10
    );

    let pageSize = Number.parseInt(
      String(req.query.pageSize || "30"),
      10
    );

    if (!Number.isFinite(page) || page < 1) {
      page = 1;
    }

    if (!Number.isFinite(pageSize) || pageSize < 1) {
      pageSize = 30;
    }

    // Never allow more than 30 transactions per request
    pageSize = Math.min(pageSize, 30);

    const offset = (page - 1) * pageSize;

    console.log("WALLET TRANSACTIONS REQUEST:", {
      userId,
      page,
      pageSize,
      offset
    });

    // ----------------------------------------------------------
    // Fetch ONE EXTRA transaction
    // ----------------------------------------------------------

    const fetchLimit = pageSize + 1;

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false
      })
      .range(
        offset,
        offset + fetchLimit - 1
      );

    if (error) {
      console.error("WALLET TRANSACTIONS ERROR:", {
        userId,
        page,
        pageSize,
        offset,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Unable to load transactions."
      });
    }

    const rows = Array.isArray(data)
      ? data
      : [];

    // ----------------------------------------------------------
    // Check whether another page exists
    // ----------------------------------------------------------

    const hasMore = rows.length > pageSize;

    const pageRows = rows.slice(
      0,
      pageSize
    );

    // ----------------------------------------------------------
    // Convert database rows to Android response format
    // ----------------------------------------------------------

    const transactions = pageRows.map((item) => {
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

      const amount = cleanNumber(
        item.amount
      );

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
          cleanNumber(
            item.bonus_percent
          ),

        bonusAmount:
          cleanNumber(
            item.bonus_amount
          ),

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
        page,
        pageSize,
        offset,
        count: transactions.length,
        hasMore
      }
    );

    // ----------------------------------------------------------
    // Final response
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      transactions,

      pagination: {
        page,
        pageSize,
        count: transactions.length,
        hasMore,
        nextPage: hasMore
          ? page + 1
          : null
      }
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


// ============================================================
// CREATE WITHDRAWAL REQUEST
//
// POST /api/wallet/withdraw
//
// Body:
// {
//   "userId": "USER_UUID",
//   "amount": 100,
//   "upiId": "user@upi"
// }
//
// Uses existing Supabase RPC:
// create_withdrawal_request
//
// The existing RPC handles:
// - Minimum ₹50
// - Winning balance check
// - Pending withdrawal check
// - ₹5 / ₹10 service charge
// - Winning balance deduction
// - withdraw_requests insertion
// - wallet_transactions insertion
// ============================================================
router.post("/withdraw", async (req, res) => {
  try {
    const userId = String(
      req.body?.userId || ""
    ).trim();

    const upiId = String(
      req.body?.upiId || ""
    ).trim();

    const amount = Number(
      req.body?.amount
    );

    // ----------------------------------------------------------
    // USER ID VALIDATION
    // ----------------------------------------------------------

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required."
      });
    }

    // ----------------------------------------------------------
    // AMOUNT VALIDATION
    // ----------------------------------------------------------

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Valid withdrawal amount is required."
      });
    }

    // ----------------------------------------------------------
    // UPI VALIDATION
    // ----------------------------------------------------------

    if (!upiId) {
      return res.status(400).json({
        success: false,
        error: "UPI ID is required."
      });
    }

    console.log(
      "WITHDRAWAL REQUEST:",
      {
        userId,
        amount,
        upiId
      }
    );

    // ----------------------------------------------------------
    // CALL EXISTING SUPABASE RPC
    // ----------------------------------------------------------

    const { data, error } =
      await supabase.rpc(
        "create_withdrawal_request",
        {
          p_user_id: userId,
          p_amount: amount,
          p_upi_id: upiId
        }
      );

    // ----------------------------------------------------------
    // SUPABASE RPC ERROR
    // ----------------------------------------------------------

    if (error) {
      console.error(
        "WITHDRAWAL RPC ERROR:",
        {
          userId,
          amount,
          upiId,

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
          "Unable to process withdrawal."
      });
    }

    console.log(
      "WITHDRAWAL RPC RESULT:",
      data
    );

    // ----------------------------------------------------------
    // RPC RETURNED FAILURE
    // ----------------------------------------------------------

    if (
      !data ||
      data.success !== true
    ) {
      return res.status(400).json({
        success: false,
        error:
          data?.error ||
          data?.message ||
          "Unable to create withdrawal request."
      });
    }

    // ----------------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        data.message ||
        "Withdrawal request submitted successfully.",

      withdrawal_id:
        data.withdrawal_id ||
        null,

      amount:
        cleanNumber(
          data.amount,
          amount
        ),

      service_charge:
        cleanNumber(
          data.service_charge
        ),

      net_amount:
        cleanNumber(
          data.net_amount
        )
    });

  } catch (error) {
    console.error(
      "WITHDRAWAL EXCEPTION:",
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


// ============================================================
// EXPORT ROUTER
// ============================================================
module.exports = router;