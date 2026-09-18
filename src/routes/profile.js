const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_SIZE = 1024 * 1024; // 1 MB

const ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
};

/*
======================================================
GET PROFILE
GET /api/profile/:userId
======================================================
*/

router.get("/:userId", async (req, res) => {
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
            .select(`
                id,
                full_name,
                email,
                phone,
                referral_code,
                referred_by,
                status,
                avatar_url
            `)
            .eq("id", userId)
            .maybeSingle();

        if (error) {
            console.error("PROFILE SUPABASE ERROR:", error);

            return res.status(500).json({
                success: false,
                message: error.message,
                code: error.code
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
                avatarUrl: user.avatar_url || ""
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


/*
======================================================
UPLOAD PROFILE AVATAR
POST /api/profile/:userId/avatar
======================================================
*/

router.post("/:userId/avatar", async (req, res) => {
    try {
        const { userId } = req.params;
        const { image, mimeType } = req.body || {};

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        if (!image || !mimeType) {
            return res.status(400).json({
                success: false,
                message: "Image and mimeType are required"
            });
        }

        const normalizedMime = String(mimeType)
            .toLowerCase()
            .trim();

        const extension = ALLOWED_TYPES[normalizedMime];

        if (!extension) {
            return res.status(400).json({
                success: false,
                message: "Only JPG, PNG or WEBP images are allowed."
            });
        }

        let imageBuffer;

        try {
            imageBuffer = Buffer.from(image, "base64");
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: "Invalid image data."
            });
        }

        if (!imageBuffer || imageBuffer.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Image data is empty."
            });
        }

        /*
        1 MB LIMIT
        */

        if (imageBuffer.length > MAX_AVATAR_SIZE) {
            return res.status(400).json({
                success: false,
                message: "Image must be 1 MB or smaller."
            });
        }

        /*
        CHECK USER
        */

        const { data: user, error: userError } = await supabase
            .from("users")
            .select(`
                id,
                full_name,
                email,
                phone,
                referral_code,
                avatar_url
            `)
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            console.error(
                "AVATAR USER CHECK ERROR:",
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

        /*
        FILE PATH
        */

        const filePath = `${userId}.${extension}`;

        /*
        UPLOAD TO SUPABASE STORAGE
        */

        const { error: uploadError } = await supabase.storage
            .from(AVATAR_BUCKET)
            .upload(
                filePath,
                imageBuffer,
                {
                    contentType: normalizedMime,
                    upsert: true,
                    cacheControl: "3600"
                }
            );

        if (uploadError) {
            console.error(
                "AVATAR STORAGE ERROR:",
                uploadError
            );

            return res.status(500).json({
                success: false,
                message: uploadError.message
            });
        }

        /*
        GET PUBLIC URL
        */

        const { data: publicUrlData } =
            supabase.storage
                .from(AVATAR_BUCKET)
                .getPublicUrl(filePath);

        const avatarUrl =
            publicUrlData?.publicUrl
                ? `${publicUrlData.publicUrl}?v=${Date.now()}`
                : "";

        if (!avatarUrl) {
            return res.status(500).json({
                success: false,
                message: "Unable to generate avatar URL."
            });
        }

        /*
        SAVE URL IN USERS TABLE
        */

        const { error: updateError } = await supabase
            .from("users")
            .update({
                avatar_url: avatarUrl
            })
            .eq("id", userId);

        if (updateError) {
            console.error(
                "AVATAR DB UPDATE ERROR:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message: updateError.message
            });
        }

        /*
        SUCCESS
        */

        return res.status(200).json({
            success: true,
            message: "Profile photo updated successfully.",
            profile: {
                id: user.id,
                name: user.full_name || "",
                email: user.email || "",
                phone: user.phone || "",
                referralCode: user.referral_code || "",
                bio: "",
                avatarUrl: avatarUrl
            }
        });

    } catch (error) {
        console.error(
            "AVATAR API ERROR:",
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


/*
======================================================
UPDATE PROFILE
PATCH /api/profile/:userId
======================================================
*/

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
            console.error(
                "PROFILE USER CHECK ERROR:",
                error
            );

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
        console.error(
            "PROFILE UPDATE ERROR:",
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