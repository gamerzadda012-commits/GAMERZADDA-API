const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");

router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        const { data: user, error: userError } =
            await supabase
                .from("users")
                .select(
                    "id, full_name, referral_code, referred_by, status"
                )
                .eq("id", userId)
                .maybeSingle();

        if (userError) {
            console.error(
                "REFERRAL USER ERROR:",
                userError
            );

            return res.status(500).json({
                success: false,
                message: userError.message
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (
            user.status &&
            String(user.status).toLowerCase() !== "active"
        ) {
            return res.status(403).json({
                success: false,
                message: "Your account is currently disabled."
            });
        }

        const {
            data: referredUsers,
            error: referredError
        } = await supabase
            .from("users")
            .select(
                "id, full_name, referral_code, created_at, status"
            )
            .eq("referred_by", userId)
            .order("created_at", {
                ascending: false
            });

        if (referredError) {
            console.error(
                "REFERRED USERS ERROR:",
                referredError
            );

            return res.status(500).json({
                success: false,
                message: referredError.message
            });
        }

        const referrals =
            (referredUsers || []).map((refUser) => ({
                id: refUser.id,

                name:
                    refUser.full_name &&
                    String(refUser.full_name).trim()
                        ? String(refUser.full_name).trim()
                        : "Gamer",

                referralCode:
                    refUser.referral_code || "",

                createdAt:
                    refUser.created_at || null,

                status:
                    refUser.status &&
                    String(refUser.status).toLowerCase() ===
                        "active"
                        ? "Joined"
                        : "Inactive",

                earned: 0,

                rewards: []
            }));

        return res.status(200).json({
            success: true,

            referralCode:
                user.referral_code || "",

            totalReferrals:
                referrals.length,

            totalEarnings: 0,

            signupRewards: 0,

            tournamentRewards: 0,

            depositRewards: 0,

            referrals
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
                "Internal server error"
        });
    }
});

module.exports = router;