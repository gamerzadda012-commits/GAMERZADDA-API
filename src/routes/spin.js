const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function walletJson(wallet) {
  return {
    bonus_balance: Number(wallet?.bonus_balance || 0),
    deposit_balance: Number(wallet?.deposit_balance || 0),
    winning_balance: Number(wallet?.winning_balance || 0)
  };
}

router.get("/spin/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!isUuid(userId)) return res.status(400).json({ success: false, error: "Invalid user ID." });

    const { data, error } = await supabase
      .from("wallet_balances")
      .select("bonus_balance,deposit_balance,winning_balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: "Wallet not found." });

    return res.json({ success: true, wallet: walletJson(data) });
  } catch (error) {
    console.error("SPIN STATE ERROR:", error);
    return res.status(500).json({ success: false, error: "Unable to load Spin data." });
  }
});

router.post("/spin/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!isUuid(userId)) return res.status(400).json({ success: false, error: "Invalid user ID." });

    // Server-authoritative transaction: fee + reward + wallet updates happen in one DB RPC.
    const { data, error } = await supabase.rpc("spin_wheel_claim", {
      p_user_id: userId
    });

    if (error) {
      console.error("SPIN RPC ERROR:", error);
      const msg = String(error.message || "").toLowerCase();

      if (msg.includes("insufficient")) {
        return res.status(409).json({
          success: false,
          error: "Insufficient Bonus + Deposit Balance. ₹10 is required to spin."
        });
      }
      if (msg.includes("wallet not found")) {
        return res.status(404).json({ success: false, error: "Wallet not found." });
      }

      return res.status(500).json({ success: false, error: "Unable to process Spin. Wallet was not changed." });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return res.json({
      success: true,
      reward: Number(row?.reward_amount || 0),
      wallet: {
        bonus_balance: Number(row?.bonus_balance || 0),
        deposit_balance: Number(row?.deposit_balance || 0),
        winning_balance: Number(row?.winning_balance || 0)
      }
    });
  } catch (error) {
    console.error("SPIN ERROR:", error);
    return res.status(500).json({ success: false, error: "Internal server error." });
  }
});

module.exports = router;
