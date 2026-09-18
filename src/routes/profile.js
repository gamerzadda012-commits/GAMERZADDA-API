const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");

const AVATAR_BUCKET = "profile-pictures";
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

        const {
            data: user,
            error: userError
        } = await supabase
            .from("users")
            .select(`
                id,
                full_name,
                email,
                phone,
                referral_code,
                referred_by,
                status,
                bio,
                avatar_url
            `)
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            console.error(
                "PROFILE SUPABASE ERROR:",
                userError
            );

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
                bio: user.bio || "",
                avatarUrl: user.avatar_url || ""
            }
        });

    } catch (error) {
        console.error(
            "PROFILE API ERROR:",
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
UPLOAD PROFILE AVATAR
POST /api/profile/:userId/avatar
======================================================
*/

router.post("/:userId/avatar", async (req, res) => {
    try {
        const { userId } = req.params;
        const { image, mimeType } = req.body || {};

        /*
        USER ID CHECK
        */

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        /*
        IMAGE CHECK
        */

        if (!image || !mimeType) {
            return res.status(400).json({
                success: false,
                message: "Image and mimeType are required"
            });
        }

        /*
        MIME TYPE CHECK
        */

        const normalizedMime = String(mimeType)
            .toLowerCase()
            .trim();

        const extension =
            ALLOWED_TYPES[normalizedMime];

        if (!extension) {
            return res.status(400).json({
                success: false,
                message:
                    "Only JPG, PNG or WEBP images are allowed."
            });
        }

        /*
        BASE64 -> BUFFER
        */

        let imageBuffer;

        try {
            imageBuffer = Buffer.from(
                image,
                "base64"
            );
        } catch (error) {
            console.error(
                "IMAGE BASE64 ERROR:",
                error
            );

            return res.status(400).json({
                success: false,
                message: "Invalid image data."
            });
        }

        /*
        EMPTY IMAGE CHECK
        */

        if (
            !imageBuffer ||
            imageBuffer.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Image data is empty."
            });
        }

        /*
        1 MB LIMIT
        */

        if (
            imageBuffer.length >
            MAX_AVATAR_SIZE
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Image must be 1 MB or smaller."
            });
        }

        /*
        CHECK USER
        */

        const {
            data: user,
            error: userError
        } = await supabase
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
                message: userError.message,
                code: userError.code
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        /*
        EXISTING AVATAR CLEANUP
        */

        if (user.avatar_url) {
            try {
                const oldUrl =
                    String(user.avatar_url);

                const marker =
                    `/storage/v1/object/public/${AVATAR_BUCKET}/`;

                const index =
                    oldUrl.indexOf(marker);

                if (index !== -1) {
                    let oldPath =
                        oldUrl.substring(
                            index + marker.length
                        );

                    oldPath =
                        oldPath.split("?")[0];

                    if (oldPath) {
                        await supabase.storage
                            .from(AVATAR_BUCKET)
                            .remove([oldPath]);
                    }
                }
            } catch (cleanupError) {
                console.warn(
                    "OLD AVATAR CLEANUP FAILED:",
                    cleanupError
                );
            }
        }

        /*
        FILE PATH

        profile-pictures/
        USER_ID/
        profile.extension
        */

        const filePath =
            `${userId}/profile.${extension}`;

        /*
        UPLOAD TO SUPABASE STORAGE
        */

        const {
            error: uploadError
        } = await supabase.storage
            .from(AVATAR_BUCKET)
            .upload(
                filePath,
                imageBuffer,
                {
                    contentType:
                        normalizedMime,

                    upsert: true,

                    cacheControl:
                        "3600"
                }
            );

        if (uploadError) {
            console.error(
                "AVATAR STORAGE ERROR:",
                uploadError
            );

            return res.status(500).json({
                success: false,
                message:
                    uploadError.message
            });
        }

        /*
        GET PUBLIC URL
        */

        const {
            data: publicUrlData
        } = supabase.storage
            .from(AVATAR_BUCKET)
            .getPublicUrl(filePath);

        let avatarUrl =
            publicUrlData?.publicUrl || "";

        if (!avatarUrl) {
            return res.status(500).json({
                success: false,
                message:
                    "Unable to generate avatar URL."
            });
        }

        /*
        CACHE BUSTER
        */

        avatarUrl =
            `${avatarUrl}?v=${Date.now()}`;

        /*
        SAVE AVATAR URL
        */

        const {
            data: updatedUser,
            error: updateError
        } = await supabase
            .from("users")
            .update({
                avatar_url: avatarUrl
            })
            .eq("id", userId)
            .select(`
                id,
                full_name,
                email,
                phone,
                referral_code,
                bio,
                avatar_url
            `)
            .single();

        if (updateError) {
            console.error(
                "AVATAR DB UPDATE ERROR:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message:
                    updateError.message,
                code:
                    updateError.code
            });
        }

        /*
        SUCCESS
        */

        return res.status(200).json({
            success: true,

            message:
                "Profile photo updated successfully.",

            profile: {
                id: updatedUser.id,

                name:
                    updatedUser.full_name ||
                    "",

                email:
                    updatedUser.email ||
                    "",

                phone:
                    updatedUser.phone ||
                    "",

                referralCode:
                    updatedUser.referral_code ||
                    "",

                bio:
                    updatedUser.bio ||
                    "",

                avatarUrl:
                    updatedUser.avatar_url ||
                    ""
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
UPDATE PROFILE BIO
PATCH /api/profile/:userId
======================================================
*/

router.patch("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const { bio } = req.body || {};

        /*
        USER ID CHECK
        */

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        /*
        BIO CLEAN
        */

        const cleanBio =
            String(bio || "").trim();

        /*
        BIO LENGTH
        */

        if (cleanBio.length > 30) {
            return res.status(400).json({
                success: false,
                message:
                    "Bio cannot be longer than 30 characters."
            });
        }

        /*
        CHECK USER
        */

        const {
            data: user,
            error: userError
        } = await supabase
            .from("users")
            .select("id")
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            console.error(
                "PROFILE USER CHECK ERROR:",
                userError
            );

            return res.status(500).json({
                success: false,
                message:
                    userError.message,
                code:
                    userError.code
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message:
                    "User not found"
            });
        }

        /*
        SAVE BIO TO DATABASE
        */

        const {
            data: updatedUser,
            error: updateError
        } = await supabase
            .from("users")
            .update({
                bio: cleanBio
            })
            .eq("id", userId)
            .select(`
                id,
                full_name,
                email,
                phone,
                referral_code,
                bio,
                avatar_url
            `)
            .single();

        if (updateError) {
            console.error(
                "BIO UPDATE ERROR:",
                updateError
            );

            return res.status(500).json({
                success: false,
                message:
                    updateError.message,
                code:
                    updateError.code
            });
        }

        /*
        SUCCESS
        */

        return res.status(200).json({
            success: true,

            message:
                "Bio updated successfully.",

            profile: {
                id: updatedUser.id,

                name:
                    updatedUser.full_name ||
                    "",

                email:
                    updatedUser.email ||
                    "",

                phone:
                    updatedUser.phone ||
                    "",

                referralCode:
                    updatedUser.referral_code ||
                    "",

                bio:
                    updatedUser.bio ||
                    "",

                avatarUrl:
                    updatedUser.avatar_url ||
                    ""
            }
        });

    } catch (error) {
        console.error(
            "PROFILE BIO UPDATE ERROR:",
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
EXPORT
======================================================
*/

module.exports = router;