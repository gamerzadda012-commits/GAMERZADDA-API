const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

const MAX_NOTIFICATIONS = 300;
const MAX_WALLET_TRANSACTIONS = 200;

function cleanText(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function cleanNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function buildWalletNotification(transaction) {
    const amount = cleanNumber(transaction?.amount);
    const type = cleanText(
        transaction?.type || transaction?.transaction_type,
        "wallet"
    ).toLowerCase();

    const description = cleanText(
        transaction?.description || transaction?.title,
        "Wallet activity recorded."
    );

    let title = "Wallet Activity";

    if (type === "entry_fee") {
        title = "Tournament Entry Fee";
    } else if (
        type.includes("deposit") ||
        type.includes("add_money") ||
        type.includes("credit")
    ) {
        title = "Money Added";
    } else if (
        type.includes("withdraw") ||
        type.includes("payout")
    ) {
        title = "Withdrawal Update";
    } else if (
        type.includes("spin") ||
        type.includes("scratch")
    ) {
        title = "Reward Activity";
    } else if (
        type.includes("winning") ||
        type.includes("win")
    ) {
        title = "Tournament Winning";
    }

    const direction = amount >= 0 ? "credited" : "debited";
    const amountText = `₹${Math.abs(amount).toFixed(2)}`;

    return {
        id: `wallet_${String(transaction?.id || transaction?.reference_id || transaction?.created_at || Math.random())}`,
        user_id: transaction?.user_id,
        title,
        message: `${description} ${amountText} ${direction}.`.trim(),
        type: "wallet",
        is_read: true,
        created_at: transaction?.created_at || new Date().toISOString(),
        redirect_url: transaction?.id
            ? `/wallet?transaction_id=${encodeURIComponent(String(transaction.id))}`
            : null,
    };
}

async function loadUser(userId) {
    const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

    return { data, error };
}

async function materializeWalletNotifications(userId) {
    const { data: transactions, error: transactionError } = await supabase
        .from("wallet_transactions")
        .select("id,user_id,amount,type,transaction_type,title,description,reference_id,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(MAX_WALLET_TRANSACTIONS);

    if (transactionError) {
        console.error("NOTIFICATION WALLET TRANSACTION ERROR:", transactionError);
        return;
    }

    const rows = (transactions || [])
        .map(buildWalletNotification)
        .filter((row) => row.id && row.redirect_url);

    if (rows.length === 0) return;

    const redirectUrls = rows
        .map((row) => row.redirect_url)
        .filter(Boolean);

    const { data: existing, error: existingError } = await supabase
        .from("notifications")
        .select("id,redirect_url")
        .eq("user_id", userId)
        .eq("type", "wallet")
        .in("redirect_url", redirectUrls);

    if (existingError) {
        console.error("NOTIFICATION WALLET EXISTING ERROR:", existingError);
        return;
    }

    const existingRedirects = new Set(
        (existing || [])
            .map((item) => cleanText(item.redirect_url))
            .filter(Boolean)
    );

    const missingRows = rows.filter(
        (row) => !existingRedirects.has(row.redirect_url)
    );

    if (missingRows.length === 0) return;

    // Wallet transactions are already the source of truth. This materializes
    // the same activity into the existing notifications table so the inbox
    // has persistent notification records without changing wallet writers.
    const { error: insertError } = await supabase
        .from("notifications")
        .insert(
            missingRows.map((row) => ({
                user_id: userId,
                title: row.title,
                message: row.message,
                type: row.type,
                is_read: false,
                created_at: row.created_at,
                redirect_url: row.redirect_url,
            }))
        );

    if (insertError) {
        console.error("NOTIFICATION WALLET MATERIALIZE ERROR:", insertError);
    }
}


// GET /api/notifications/:userId
router.get("/:userId", async (req, res) => {
    try {
        const userId = cleanText(req.params.userId);

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required.",
            });
        }

        const { data: user, error: userError } = await loadUser(userId);

        if (userError) {
            console.error("NOTIFICATION USER CHECK ERROR:", userError);
            return res.status(500).json({
                success: false,
                error: userError.message,
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found.",
            });
        }

        await materializeWalletNotifications(userId);

        const { data, error } = await supabase
            .from("notifications")
            .select(
                "id,user_id,title,message,is_read,created_at,redirect_url,type"
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(MAX_NOTIFICATIONS);

        if (error) {
            console.error("NOTIFICATION FETCH ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Unable to load notifications.",
            });
        }

        const notifications = data || [];
        const unreadCount = notifications.filter(
            (notification) => !notification.is_read
        ).length;

        return res.status(200).json({
            success: true,
            notifications,
            unread_count: unreadCount,
        });
    } catch (error) {
        console.error("NOTIFICATION GET EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error.",
        });
    }
});


// PATCH /api/notifications/:userId/read-all
router.patch("/:userId/read-all", async (req, res) => {
    try {
        const userId = cleanText(req.params.userId);

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required.",
            });
        }

        const { error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", userId)
            .eq("is_read", false);

        if (error) {
            console.error("NOTIFICATION READ ALL ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read.",
        });
    } catch (error) {
        console.error("NOTIFICATION READ ALL EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error.",
        });
    }
});


// PATCH /api/notifications/:userId/:notificationId/read
router.patch("/:userId/:notificationId/read", async (req, res) => {
    try {
        const userId = cleanText(req.params.userId);
        const notificationId = cleanText(req.params.notificationId);

        if (!userId || !notificationId) {
            return res.status(400).json({
                success: false,
                error: "User ID and notification ID are required.",
            });
        }

        const { data, error } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", notificationId)
            .eq("user_id", userId)
            .select("id")
            .maybeSingle();

        if (error) {
            console.error("NOTIFICATION READ ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Notification not found.",
            });
        }

        return res.status(200).json({
            success: true,
        });
    } catch (error) {
        console.error("NOTIFICATION READ EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error.",
        });
    }
});


// DELETE /api/notifications/:userId/:notificationId
router.delete("/:userId/:notificationId", async (req, res) => {
    try {
        const userId = cleanText(req.params.userId);
        const notificationId = cleanText(req.params.notificationId);

        if (!userId || !notificationId) {
            return res.status(400).json({
                success: false,
                error: "User ID and notification ID are required.",
            });
        }

        const { data, error } = await supabase
            .from("notifications")
            .delete()
            .eq("id", notificationId)
            .eq("user_id", userId)
            .select("id")
            .maybeSingle();

        if (error) {
            console.error("NOTIFICATION DELETE ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Notification not found or already deleted.",
            });
        }

        return res.status(200).json({
            success: true,
        });
    } catch (error) {
        console.error("NOTIFICATION DELETE EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error.",
        });
    }
});


// POST /api/notifications/fcm-token
router.post("/fcm-token", async (req, res) => {
    try {
        const userId = cleanText(req.body?.userId);
        const token = cleanText(req.body?.token);

        if (!userId || !token) {
            return res.status(400).json({
                success: false,
                error: "User ID and FCM token are required.",
            });
        }

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            return res.status(500).json({
                success: false,
                error: userError.message,
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found.",
            });
        }

        const { error } = await supabase
            .from("users")
            .update({ fcm_token: token })
            .eq("id", userId);

        if (error) {
            console.error("FCM TOKEN UPDATE ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: "FCM token saved.",
        });
    } catch (error) {
        console.error("FCM TOKEN ROUTE ERROR:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error.",
        });
    }
});


module.exports = router;
