const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");

/*
|--------------------------------------------------------------------------
| GET REFERRAL DATA
|--------------------------------------------------------------------------
| GET /api/referrals/:userId
|
| Uses:
|   users.referral_code  -> user's own referral code
|   users.referred_by    -> users who joined using this user's code
|
|--------------------------------------------------------------------------
*/

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // ---------------------------------------------------------
    // 1. Get current user
    // ---------------------------------------------------------

    const {
      data: user,
      error: userError,
    } = await supabase
      .from("users")
      .select(`
        id,
        full_name,
        referral_code,
        referred_by,
        status
      `)
      .eq("id", userId)
      .maybeSingle();

    if (userError) {
      console.error("REFERRAL USER ERROR:", userError);

      return res.status(500).json({
        success: false,
        message: userError.message || "Failed to get user",
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ---------------------------------------------------------
    // 2. Check account status
    // ---------------------------------------------------------

    if (
      user.status &&
      String(user.status).toLowerCase() !== "active"
    ) {
      return res.status(403).json({
        success: false,
        message: "Your account is currently disabled.",
      });
    }

    // ---------------------------------------------------------
    // 3. Get users referred by this user
    // ---------------------------------------------------------

    const {
      data: referredUsers,
      error: referredError,
    } = await supabase
      .from("users")
      .select(`
        id,
        full_name,
        referral_code,
        created_at,
        status
      `)
      .eq("referred_by", userId)
      .order("created_at", {
        ascending: false,
      });

    if (referredError) {
      console.error(
        "REFERRED USERS ERROR:",
        referredError
      );

      return res.status(500).json({
        success: false,
        message:
          referredError.message ||
          "Failed to get referred users",
      });
    }

    // ---------------------------------------------------------
    // 4. Format referral history
    // ---------------------------------------------------------

    const referrals = (referredUsers || []).map((refUser) => {
      return {
        id: refUser.id,

        name:
          refUser.full_name &&
          String(refUser.full_name).trim()
            ? String(refUser.full_name).trim()
            : "Gamer",

        referralCode: refUser.referral_code || "",

        createdAt: refUser.created_at || null,

        status:
          refUser.status &&
          String(refUser.status).toLowerCase() === "active"
            ? "Joined"
            : "Inactive",

        // Reward system is NOT present
        // in the supplied backend yet.
        earned: 0,

        rewards: [],
      };
    });

    // ---------------------------------------------------------
    // 5. Current referral code
    // ---------------------------------------------------------

    const referralCode = user.referral_code || "";

    // ---------------------------------------------------------
    // 6. Response
    // ---------------------------------------------------------

    return res.status(200).json({
      success: true,

      referralCode,

      totalReferrals: referrals.length,

      // Reward values remain 0 because
      // the supplied auth backend does not
      // currently create referral reward records.
      totalEarnings: 0,
      signupRewards: 0,
      tournamentRewards: 0,
      depositRewards: 0,

      referrals,
    });
  } catch (error) {
    console.error(
      "REFERRAL API ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Internal server error",
    });
  }
});

module.exports = router;