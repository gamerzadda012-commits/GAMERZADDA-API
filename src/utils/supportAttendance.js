const supabase = require("../config/supabase");

const ATTEND_PREFIX = "🎧 Support Agent Connected";

function getTicketId(conversationId) {
    const clean = String(conversationId || "")
        .replace(/[^a-fA-F0-9]/g, "")
        .toUpperCase();

    const seed = clean || "0";
    const value = parseInt(seed.slice(0, 5), 16) % 100000;

    return `#GZ-${String(value).padStart(5, "0")}`;
}

let firebaseApp = null;
let firebaseMessaging = null;

function getFirebaseMessaging() {
    if (firebaseMessaging) return firebaseMessaging;

    try {
        const {
            initializeApp,
            getApps,
            cert,
        } = require("firebase-admin/app");
        const { getMessaging } = require("firebase-admin/messaging");
        const path = require("path");
        const fs = require("fs");

        const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        if (!configured) {
            console.warn("SUPPORT ATTEND FCM: FIREBASE_SERVICE_ACCOUNT_PATH missing.");
            return null;
        }

        const absolutePath = path.isAbsolute(configured)
            ? configured
            : path.resolve(process.cwd(), configured);

        if (!fs.existsSync(absolutePath)) {
            console.warn("SUPPORT ATTEND FCM: service account not found:", absolutePath);
            return null;
        }

        const serviceAccount = require(absolutePath);

        firebaseApp =
            getApps().length > 0
                ? getApps()[0]
                : initializeApp({
                      credential: cert(serviceAccount),
                  });

        firebaseMessaging = getMessaging(firebaseApp);
        return firebaseMessaging;
    } catch (error) {
        console.error("SUPPORT ATTEND FCM INIT ERROR:", error);
        return null;
    }
}

async function sendSupportAttendNotification(userId, ticketId) {
    try {
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id,fcm_token")
            .eq("id", userId)
            .maybeSingle();

        if (userError) throw userError;

        const title = "🎧 Support Agent Connected";
        const message =
            "A support agent has joined your conversation. You can continue chatting with us now.";

        // Save notification history even if the device currently has no token.
        const { error: historyError } = await supabase
            .from("notifications")
            .insert({
                user_id: userId,
                title,
                message,
                type: "support",
                redirect_url: "/support",
            });

        if (historyError) {
            console.error("SUPPORT ATTEND NOTIFICATION HISTORY ERROR:", historyError);
        }

        const token = String(user?.fcm_token || "").trim();
        if (!token) {
            return {
                success: true,
                sent: 0,
                reason: "User has no FCM token.",
            };
        }

        const messaging = getFirebaseMessaging();
        if (!messaging) {
            return {
                success: false,
                sent: 0,
                reason: "Firebase messaging is not configured.",
            };
        }

        try {
            await messaging.send({
                token,
                notification: {
                    title,
                    body: message,
                },
                data: {
                    type: "support",
                    redirect_url: "/support",
                    ticket_id: String(ticketId || ""),
                    title,
                    body: message,
                },
                android: {
                    priority: "high",
                    notification: {
                        channelId: "gamerzadda_notifications",
                        sound: "default",
                    },
                },
            });

            console.log("SUPPORT ATTEND FCM SENT:", userId, ticketId);

            return {
                success: true,
                sent: 1,
            };
        } catch (fcmError) {
            const code = fcmError?.code || "";

            if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token"
            ) {
                await supabase
                    .from("users")
                    .update({ fcm_token: null })
                    .eq("id", userId);
            }

            console.error("SUPPORT ATTEND FCM SEND ERROR:", fcmError);

            return {
                success: false,
                sent: 0,
                reason: fcmError?.message || "FCM notification failed.",
            };
        }
    } catch (error) {
        console.error("SUPPORT ATTEND NOTIFICATION ERROR:", error);
        return {
            success: false,
            sent: 0,
            reason: error?.message || "Support notification failed.",
        };
    }
}

/**
 * Shared attendance logic used by both Admin Panel and Telegram.
 * No database schema change is required.
 *
 * The attendance message itself is the persistent attendance marker.
 * Therefore bot restarts cannot make an already-attended ticket notify again.
 */
async function attendSupportTicket(conversationId) {
    const id = String(conversationId || "").trim();

    if (!id) {
        throw new Error("Conversation ID is required.");
    }

    const { data: conversation, error: conversationError } = await supabase
        .from("support_conversations")
        .select("id,user_id,status")
        .eq("id", id)
        .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) throw new Error("Support ticket not found.");
    if (conversation.status !== "open") {
        throw new Error("This support ticket is already closed.");
    }

    const ticketId = getTicketId(id);

    const { data: existing, error: existingError } = await supabase
        .from("support_messages")
        .select("id,created_at,message")
        .eq("conversation_id", id)
        .eq("sender_type", "admin")
        .ilike("message", `${ATTEND_PREFIX}%`)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
        return {
            alreadyAttended: true,
            conversation,
            ticketId,
            message: existing,
            notification: { success: true, sent: 0, reason: "Already attended." },
        };
    }

    const attendanceMessage =
        `${ATTEND_PREFIX}\n\n` +
        `Hello! A support agent has joined your conversation.\n\n` +
        `You can continue explaining your issue here, and our team will assist you shortly.\n\n` +
        `GAMERZADDA Support Team`;

    const { data: message, error: messageError } = await supabase
        .from("support_messages")
        .insert({
            conversation_id: id,
            sender_id: conversation.user_id,
            sender_type: "admin",
            message: attendanceMessage,
            attachment_url: null,
            attachment_name: null,
            attachment_type: null,
            attachment_size: null,
        })
        .select("*")
        .single();

    if (messageError) throw messageError;

    await supabase
        .from("support_conversations")
        .update({
            updated_at: new Date().toISOString(),
        })
        .eq("id", id);

    const notification = await sendSupportAttendNotification(
        conversation.user_id,
        ticketId
    );

    return {
        alreadyAttended: false,
        conversation,
        ticketId,
        message,
        notification,
    };
}

module.exports = {
    ATTEND_PREFIX,
    getTicketId,
    attendSupportTicket,
    sendSupportAttendNotification,
};
