const supabase = require("../config/supabase");

async function getUserRestriction(userId, feature) {
    try {
        if (!userId || !feature) return null;

        const { data, error } = await supabase
            .from("user_restrictions")
            .select(`
                id,
                user_id,
                feature,
                expires_at,
                is_permanent,
                is_active,
                reason
            `)
            .eq("user_id", userId)
            .eq("feature", feature)
            .eq("is_active", true)
            .maybeSingle();

        if (error) {
            console.error("USER RESTRICTION CHECK ERROR:", error);
            throw error;
        }

        if (!data) return null;

        // Permanent restriction
        if (data.is_permanent === true) {
            return data;
        }

        // No expiry means active restriction
        if (!data.expires_at) {
            return data;
        }

        const expiresAt = new Date(data.expires_at);

        // Expired restriction -> automatically deactivate
        if (expiresAt <= new Date()) {
            const { error: deactivateError } = await supabase
                .from("user_restrictions")
                .update({
                    is_active: false,
                    updated_at: new Date().toISOString()
                })
                .eq("id", data.id);

            if (deactivateError) {
                console.error(
                    "USER RESTRICTION DEACTIVATE ERROR:",
                    deactivateError
                );
            }

            return null;
        }

        return data;
    } catch (error) {
        console.error("GET USER RESTRICTION ERROR:", error);
        throw error;
    }
}

async function checkUserRestriction(userId, feature) {
    // Full app restriction always has highest priority
    const fullAppRestriction = await getUserRestriction(
        userId,
        "full_app"
    );

    if (fullAppRestriction) {
        return {
            restricted: true,
            feature: "full_app",
            restriction: fullAppRestriction
        };
    }

    // If only checking full app
    if (!feature) {
        return {
            restricted: false,
            feature: null,
            restriction: null
        };
    }

    // Check requested feature
    const featureRestriction = await getUserRestriction(
        userId,
        feature
    );

    if (featureRestriction) {
        return {
            restricted: true,
            feature,
            restriction: featureRestriction
        };
    }

    return {
        restricted: false,
        feature,
        restriction: null
    };
}

function restrictionResponse(res, feature, restriction) {
    const featureNames = {
        full_app: "App",

        support: "Support",

        freefire: "Free Fire",
        freefiremax: "Free Fire MAX",
        clashsquad: "Clash Squad",
        lonewolf: "Lone Wolf",

        spin: "Spin",
        scratch_card: "Scratch Card",

        withdrawal: "Withdrawal",

        // Add Money / Deposit
        deposit: "Add Money"
    };

    const featureName =
        featureNames[feature] || "This feature";

    let message =
        `${featureName} is temporarily restricted for your account.`;

    // Permanent restriction message
    if (restriction?.is_permanent === true) {
        message =
            `${featureName} is restricted for your account.`;
    }

    return res.status(403).json({
        success: false,
        code: "FEATURE_RESTRICTED",
        feature,
        error: message,
        reason: restriction?.reason || null,
        expires_at: restriction?.expires_at || null,
        is_permanent: restriction?.is_permanent === true
    });
}

async function getUserGameLimit(userId, game) {
    try {
        if (!userId || !game) return null;

        const { data, error } = await supabase
            .from("user_game_limits")
            .select(`
                id,
                user_id,
                game,
                daily_limit,
                expires_at,
                is_permanent,
                is_active,
                reason
            `)
            .eq("user_id", userId)
            .eq("game", game)
            .eq("is_active", true)
            .maybeSingle();

        if (error) {
            console.error(
                "USER GAME LIMIT CHECK ERROR:",
                error
            );
            throw error;
        }

        if (!data) return null;

        // Permanent game limit
        if (data.is_permanent === true) {
            return data;
        }

        // No expiry means active limit
        if (!data.expires_at) {
            return data;
        }

        const expiresAt = new Date(data.expires_at);

        // Expired limit -> automatically deactivate
        if (expiresAt <= new Date()) {
            const { error: deactivateError } = await supabase
                .from("user_game_limits")
                .update({
                    is_active: false,
                    updated_at: new Date().toISOString()
                })
                .eq("id", data.id);

            if (deactivateError) {
                console.error(
                    "USER GAME LIMIT DEACTIVATE ERROR:",
                    deactivateError
                );
            }

            return null;
        }

        return data;
    } catch (error) {
        console.error(
            "GET USER GAME LIMIT ERROR:",
            error
        );
        throw error;
    }
}

function gameRestrictionKey(game) {
    const value = String(game || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    if (
        value === "free fire" ||
        value === "freefire"
    ) {
        return "freefire";
    }

    if (
        value === "free fire max" ||
        value === "freefire max" ||
        value === "freefiremax"
    ) {
        return "freefiremax";
    }

    if (
        value === "clash squad" ||
        value === "clashsquad"
    ) {
        return "clashsquad";
    }

    if (
        value === "lone wolf" ||
        value === "lonewolf"
    ) {
        return "lonewolf";
    }

    return null;
}

module.exports = {
    getUserRestriction,
    checkUserRestriction,
    restrictionResponse,
    getUserGameLimit,
    gameRestrictionKey
};