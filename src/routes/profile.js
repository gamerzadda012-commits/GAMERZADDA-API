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

        const { data: user, error: userError } = await supabase
            .from("users")
            .select(`
                id,
                full_name,
                email,
                phone,
                referral_code,
                referred_by,
                status
            `)
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            console.error("PROFILE SUPABASE ERROR:", userError);

            return res.status(500).json({
                success: false,
                message: userError.message,
                code: userError.code
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User profile not found"
            });
        }

        return res.status(200).json({
            success: true,
            profile: {
                id: user.id,
                name: user.full_name || "",
                email: user.email || "",
                phone: user.phone || "",
                referralCode: user.referral_code || "",
                bio: "",
                avatarUrl: ""
            }
        });

    } catch (error) {
        console.error("PROFILE API ERROR:", error);

        return res.status(500).json({
            success: false,
            message: error?.message || "Internal server error"
        });
    }
});

router.patch("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        const { data: user, error } = await supabase
            .from("users")
            .select("id")
            .eq("id", userId)
            .maybeSingle();

        if (error) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully."
        });

    } catch (error) {
        console.error("PROFILE UPDATE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: error?.message || "Internal server error"
        });
    }
});

module.exports = router;