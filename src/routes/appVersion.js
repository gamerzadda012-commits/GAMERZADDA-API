const express = require("express");
const router = express.Router();

const { supabase } = require("../../gamerzadda-admin/lib/supabase");

// ==========================================
// GET CURRENT APP VERSION
// GET /api/app-version
// ==========================================

router.get("/", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("app_version_control")
            .select(`
                platform,
                latest_version,
                minimum_version,
                version_code,
                apk_url,
                force_update,
                update_title,
                update_message,
                is_active
            `)
            .eq("platform", "android")
            .eq("is_active", true)
            .maybeSingle();

        if (error) {
            console.error(
                "APP VERSION FETCH ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Unable to check app version"
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "App version configuration not found"
            });
        }

        return res.status(200).json({
            success: true,
            platform: data.platform,
            latest_version: data.latest_version,
            minimum_version: data.minimum_version,
            version_code: data.version_code,
            apk_url: data.apk_url,
            force_update: data.force_update,
            update_title: data.update_title,
            update_message: data.update_message
        });

    } catch (error) {
        console.error(
            "APP VERSION ROUTE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Internal server error"
        });
    }
});

module.exports = router;