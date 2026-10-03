const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

// ============================================================
// GET WALLET BALANCE
// GET /api/wallet/:userId
// ============================================================
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const { data, error } = await supabase
      .from("wallet_balances")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("WALLET FETCH ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch wallet",
      });
    }

    return res.status(200).json({
      success: true,
      wallet: data || {
        user_id: userId,
        bonus_balance: 0,
        deposit_balance: 0,
        winning_balance: 0,
      },
    });
  } catch (error) {
    console.error("WALLET FETCH EXCEPTION:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ============================================================
// GET WALLET TRANSACTIONS
// GET /api/wallet/:userId/transactions
// ============================================================
router.get("/:userId/transactions", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("TRANSACTIONS FETCH ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
      });
    }

    return res.status(200).json({
      success: true,
      transactions: data || [],
    });
  } catch (error) {
    console.error("TRANSACTIONS FETCH EXCEPTION:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ============================================================
// CREATE WITHDRAWAL REQUEST
// POST /api/wallet/withdraw
//
// Request body:
//
// {
//   "userId": "USER_UUID",
//   "accountHolderName": "Rahul Kumar",
//   "amount": 100,
//   "upiId": "rahul@upi"
// }
//
// ============================================================
router.post("/withdraw", async (req, res) => {
  try {
    const {
      userId,
      accountHolderName,
      amount,
      upiId,
    } = req.body || {};

    console.log("========================================");
    console.log("WITHDRAWAL REQUEST RECEIVED");
    console.log("User ID:", userId);
    console.log("Account Holder:", accountHolderName);
    console.log("Amount:", amount);
    console.log("UPI ID:", upiId);
    console.log("========================================");

    // ----------------------------------------------------------
    // USER ID VALIDATION
    // ----------------------------------------------------------

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // ----------------------------------------------------------
    // ACCOUNT HOLDER NAME VALIDATION
    // ----------------------------------------------------------

    const cleanName =
      typeof accountHolderName === "string"
        ? accountHolderName.trim()
        : "";

    if (!cleanName) {
      return res.status(400).json({
        success: false,
        message: "Account holder name is required",
      });
    }

    if (cleanName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid account holder name",
      });
    }

    if (cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Account holder name is too long",
      });
    }

    // ----------------------------------------------------------
    // UPI VALIDATION
    // ----------------------------------------------------------

    const cleanUpi =
      typeof upiId === "string"
        ? upiId.trim()
        : "";

    if (!cleanUpi) {
      return res.status(400).json({
        success: false,
        message: "UPI ID is required",
      });
    }

    const upiRegex =
      /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;

    if (!upiRegex.test(cleanUpi)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid UPI ID",
      });
    }

    // ----------------------------------------------------------
    // AMOUNT VALIDATION
    // ----------------------------------------------------------

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid withdrawal amount",
      });
    }

    if (numericAmount < 50) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal amount is ₹50",
      });
    }

    // Maximum 2 decimal places
    const amountString = String(amount);

    if (!/^\d+(\.\d{1,2})?$/.test(amountString)) {
      return res.status(400).json({
        success: false,
        message: "Amount can have maximum 2 decimal places",
      });
    }

    // ----------------------------------------------------------
    // CALL SUPABASE WITHDRAWAL RPC
    // ----------------------------------------------------------

    const { data, error } = await supabase.rpc(
      "create_withdrawal_request",
      {
        p_user_id: userId,
        p_amount: numericAmount,
        p_upi_id: cleanUpi,
        p_account_holder_name: cleanName,
      }
    );

    if (error) {
      console.error("WITHDRAW RPC ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create withdrawal request",
      });
    }

    console.log("WITHDRAW RPC RESULT:", data);

    // Supabase RPC can return an array
    const result = Array.isArray(data)
      ? data[0]
      : data;

    if (!result) {
      return res.status(500).json({
        success: false,
        message: "Withdrawal request failed",
      });
    }

    // ----------------------------------------------------------
    // RPC FAILURE
    // ----------------------------------------------------------

    if (result.success === false) {
      return res.status(400).json({
        success: false,
        message:
          result.message ||
          "Withdrawal request failed",
      });
    }

    // ----------------------------------------------------------
    // SUCCESS RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        result.message ||
        "Withdrawal request submitted successfully",

      withdrawal_id:
        result.withdrawal_id || null,

      account_holder_name:
        result.account_holder_name ||
        cleanName,

      amount:
        result.amount !== undefined
          ? Number(result.amount)
          : numericAmount,

      service_charge:
        result.service_charge !== undefined
          ? Number(result.service_charge)
          : 0,

      net_amount:
        result.net_amount !== undefined
          ? Number(result.net_amount)
          : numericAmount,
    });
  } catch (error) {
    console.error("WITHDRAWAL EXCEPTION:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;