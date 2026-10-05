const { Bot } = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const supabase = require("../config/supabase");
const { attendSupportTicket } = require("../utils/supportAttendance");

const TOKEN = process.env.TELEGRAM_SUPPORT_BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.TELEGRAM_SUPPORT_ADMIN_CHAT_ID || "").trim();

if (!TOKEN) {
    throw new Error("TELEGRAM_SUPPORT_BOT_TOKEN is missing in .env");
}

if (!ADMIN_CHAT_ID) {
    throw new Error("TELEGRAM_SUPPORT_ADMIN_CHAT_ID is missing in .env");
}

const bot = new Bot(TOKEN);

const STATE_FILE = path.join(__dirname, "supportBotState.json");
const POLL_MS = 5000;
const REMINDER_MS = 60000;

let state = {
    tickets: {}
};

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return;
        }

        const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));

        if (parsed && typeof parsed === "object") {
            state = {
                tickets: parsed.tickets || {}
            };
        }
    } catch (error) {
        console.error("SUPPORT BOT STATE LOAD ERROR:", error);
    }
}

function saveState() {
    try {
        fs.writeFileSync(
            STATE_FILE,
            JSON.stringify(state, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error("SUPPORT BOT STATE SAVE ERROR:", error);
    }
}

function getTicketId(conversationId) {
    const raw = String(conversationId || "").replace(/-/g, "");
    return `GZ-${raw.slice(0, 8).toUpperCase()}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function short(value, max = 900) {
    const text = String(value ?? "").trim();

    if (text.length <= max) {
        return text;
    }

    return `${text.slice(0, max - 3)}...`;
}

function formatDate(value) {
    if (!value) {
        return "-";
    }

    try {
        return new Date(value).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "medium",
            timeStyle: "short"
        });
    } catch {
        return String(value);
    }
}

function ticketState(conversationId) {
    const id = String(conversationId);

    if (!state.tickets[id]) {
        state.tickets[id] = {
            attended: false,
            lastMessageId: null,
            lastNotifiedAt: 0,
            telegramMessageId: null
        };
    }

    return state.tickets[id];
}

async function getOpenUserMessages() {
    const { data: conversations, error: conversationError } =
        await supabase
            .from("support_conversations")
            .select("id,user_id,status,created_at,updated_at")
            .eq("status", "open")
            .order("updated_at", { ascending: false });

    if (conversationError) {
        throw conversationError;
    }

    if (!conversations?.length) {
        return [];
    }

    const userIds = [
        ...new Set(
            conversations
                .map((item) => item.user_id)
                .filter(Boolean)
                .map(String)
        )
    ];

    const conversationIds = conversations
        .map((item) => item.id)
        .filter(Boolean);

    const [usersResult, messagesResult] = await Promise.all([
        userIds.length
            ? supabase
                .from("users")
                .select("id,full_name,email,phone,game_name,free_fire_uid")
                .in("id", userIds)
            : Promise.resolve({ data: [], error: null }),

        conversationIds.length
            ? supabase
                .from("support_messages")
                .select(
                    "id,conversation_id,sender_id,sender_type,message,attachment_url,attachment_name,attachment_type,attachment_size,created_at"
                )
                .in("conversation_id", conversationIds)
                .eq("sender_type", "user")
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null })
    ]);

    if (usersResult.error) {
        throw usersResult.error;
    }

    if (messagesResult.error) {
        throw messagesResult.error;
    }

    const userMap = new Map(
        (usersResult.data || []).map((user) => [
            String(user.id),
            user
        ])
    );

    const latestUserMessage = new Map();

    for (const message of messagesResult.data || []) {
        const key = String(message.conversation_id);

        if (!latestUserMessage.has(key)) {
            latestUserMessage.set(key, message);
        }
    }

    return conversations
        .map((conversation) => {
            const message = latestUserMessage.get(
                String(conversation.id)
            );

            if (!message) {
                return null;
            }

            return {
                conversation,
                user:
                    userMap.get(String(conversation.user_id)) || null,
                message
            };
        })
        .filter(Boolean);
}

function buildTicketText(item) {
    const { conversation, user, message } = item;

    const name =
        user?.game_name ||
        user?.full_name ||
        "Unknown User";

    const email = user?.email || "-";
    const phone = user?.phone || "-";
    const uid = user?.free_fire_uid || "-";

    const attachment = message.attachment_name
        ? `\n📎 <b>Attachment:</b> ${escapeHtml(message.attachment_name)}`
        : "";

    return (
        `🚨 <b>NEW SUPPORT REQUEST</b>\n\n` +
        `🎫 <b>Ticket:</b> ${escapeHtml(getTicketId(conversation.id))}\n` +
        `👤 <b>User:</b> ${escapeHtml(name)}\n` +
        `📧 <b>Email:</b> ${escapeHtml(email)}\n` +
        `📱 <b>Phone:</b> ${escapeHtml(phone)}\n` +
        `🎮 <b>Game Name:</b> ${escapeHtml(user?.game_name || "-")}\n` +
        `🆔 <b>Free Fire UID:</b> ${escapeHtml(uid)}\n` +
        `🕒 <b>Time:</b> ${escapeHtml(formatDate(message.created_at))}\n\n` +
        `💬 <b>User Message:</b>\n${escapeHtml(short(message.message))}` +
        `${attachment}\n\n` +
        `⚠️ <b>Status:</b> Waiting for admin attendance`
    );
}

function ticketKeyboard(conversationId) {
    return {
        inline_keyboard: [
            [
                {
                    text: "👀 ATTEND",
                    callback_data: `attend:${conversationId}`
                },
                {
                    text: "✅ CLOSE",
                    callback_data: `close:${conversationId}`
                }
            ]
        ]
    };
}

async function sendTicketNotification(item, force = false) {
    const conversationId = String(item.conversation.id);
    const current = ticketState(conversationId);
    const now = Date.now();

    if (
        !force &&
        current.lastNotifiedAt &&
        now - current.lastNotifiedAt < REMINDER_MS
    ) {
        return;
    }

    const text = buildTicketText(item);

    const sent = await bot.sendMessage(
        ADMIN_CHAT_ID,
        text,
        {
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: ticketKeyboard(conversationId)
        }
    );

    current.lastMessageId = String(item.message.id);
    current.lastNotifiedAt = now;
    current.telegramMessageId = sent.message_id;

    saveState();

    console.log(
        "TELEGRAM SUPPORT NOTIFICATION SENT:",
        conversationId,
        item.message.id
    );
}

async function checkSupportTickets() {
    try {
        const items = await getOpenUserMessages();

        for (const item of items) {
            const conversationId = String(item.conversation.id);
            const current = ticketState(conversationId);
            const messageId = String(item.message.id);

            // Attendance is persisted in support_messages by the shared
            // attendance helper. A bot restart or a newer user message
            // must NOT restart reminders after an admin has attended.
            const { data: attendanceMessage, error: attendanceError } =
                await supabase
                    .from("support_messages")
                    .select("id")
                    .eq("conversation_id", conversationId)
                    .eq("sender_type", "admin")
                    .ilike("message", "🎧 Support Agent Connected%")
                    .limit(1)
                    .maybeSingle();

            if (attendanceError) {
                throw attendanceError;
            }

            if (attendanceMessage || current.attended) {
                current.attended = true;
                continue;
            }

            await sendTicketNotification(item);
        }

        saveState();
    } catch (error) {
        console.error(
            "SUPPORT BOT CHECK ERROR:",
            error?.message || error
        );
    }
}

async function attendTicket(conversationId, callbackQuery) {
    const id = String(conversationId);

    const result = await attendSupportTicket(id);

    const current = ticketState(id);
    current.attended = true;
    current.lastNotifiedAt = Date.now();
    saveState();

    await bot.answerCallbackQuery(
        callbackQuery.id,
        {
            text: result.alreadyAttended
                ? "Already attended. Notifications are stopped."
                : "Attended. User has been notified.",
            show_alert: false
        }
    );

    if (callbackQuery.message) {
        const oldText = callbackQuery.message.text || "";

        const updatedText =
            oldText.replace(
                /⚠️ <b>Status:<\/b> Waiting for admin attendance/,
                "👀 <b>Status:</b> ATTENDED BY ADMIN"
            );

        await bot.editMessageText(updatedText, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🔔 ATTENDED",
                            callback_data: `attended:${id}`
                        },
                        {
                            text: "✅ CLOSE",
                            callback_data: `close:${id}`
                        }
                    ]
                ]
            }
        });
    }

    console.log("TELEGRAM SUPPORT ATTENDED:", id);
}

async function closeTicket(conversationId, callbackQuery) {
    const id = String(conversationId);

    const { data: conversation, error } = await supabase
        .from("support_conversations")
        .select("id,user_id,status")
        .eq("id", id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!conversation) {
        throw new Error("Support ticket not found.");
    }

    if (conversation.status === "closed") {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: "Ticket is already closed.",
            show_alert: false
        });
        return;
    }

    const ticketId = getTicketId(id);

    const resolutionMessage =
        `Your GAMERZADDA support ticket ${ticketId} has been marked as resolved. ✅\n\n` +
        `If your issue is still not resolved or you need help with a different issue, please open Support again and send a new message. A new ticket will be created for you.`;

    const { error: updateError } = await supabase
        .from("support_conversations")
        .update({
            status: "closed",
            updated_at: new Date().toISOString()
        })
        .eq("id", id);

    if (updateError) {
        throw updateError;
    }

    const { error: messageError } = await supabase
        .from("support_messages")
        .insert({
            conversation_id: id,
            sender_id: conversation.user_id,
            sender_type: "admin",
            message: resolutionMessage,
            attachment_url: null,
            attachment_name: null,
            attachment_type: null,
            attachment_size: null
        });

    if (messageError) {
        console.error(
            "SUPPORT BOT RESOLUTION MESSAGE ERROR:",
            messageError
        );
    }

    const current = ticketState(id);
    current.attended = true;
    current.lastNotifiedAt = Date.now();
    saveState();

    await bot.answerCallbackQuery(callbackQuery.id, {
        text: "Support ticket closed.",
        show_alert: false
    });

    if (callbackQuery.message) {
        const oldText = callbackQuery.message.text || "";

        const updatedText =
            oldText.replace(
                /⚠️ <b>Status:<\/b> Waiting for admin attendance|👀 <b>Status:<\/b> ATTENDED BY ADMIN/,
                "✅ <b>Status:</b> CLOSED"
            );

        await bot.editMessageText(updatedText, {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "✅ CLOSED",
                            callback_data: `closed:${id}`
                        }
                    ]
                ]
            }
        });
    }

    console.log("TELEGRAM SUPPORT CLOSED:", id);
}

bot.on("callback_query", async (callbackQuery) => {
    try {
        const chatId = String(
            callbackQuery?.message?.chat?.id || ""
        );

        if (chatId !== ADMIN_CHAT_ID) {
            await bot.answerCallbackQuery(
                callbackQuery.id,
                {
                    text: "Not authorized.",
                    show_alert: true
                }
            );
            return;
        }

        const data = String(callbackQuery.data || "");

        if (data.startsWith("attend:")) {
            await attendTicket(
                data.slice("attend:".length),
                callbackQuery
            );
            return;
        }

        if (data.startsWith("close:")) {
            await closeTicket(
                data.slice("close:".length),
                callbackQuery
            );
            return;
        }

        if (
            data.startsWith("attended:") ||
            data.startsWith("closed:")
        ) {
            await bot.answerCallbackQuery(
                callbackQuery.id,
                {
                    text: "No action required.",
                    show_alert: false
                }
            );
        }
    } catch (error) {
        console.error(
            "SUPPORT BOT CALLBACK ERROR:",
            error?.message || error
        );

        try {
            await bot.answerCallbackQuery(
                callbackQuery.id,
                {
                    text: error?.message || "Action failed.",
                    show_alert: true
                }
            );
        } catch {}
    }
});

bot.onText(/^\/start$/, async (message) => {
    const chatId = String(message.chat.id);

    if (chatId !== ADMIN_CHAT_ID) {
        await bot.sendMessage(
            chatId,
            "This is the GAMERZADDA Support Admin Bot."
        );
        return;
    }

    await bot.sendMessage(
        chatId,
        "🎧 <b>GAMERZADDA Support Bot</b>\n\n" +
        "I will notify you when users send support messages.\n\n" +
        "👀 ATTEND → stops reminders for that ticket\n" +
        "✅ CLOSE → closes the ticket",
        {
            parse_mode: "HTML"
        }
    );
});

bot.catch((error) => {
    console.error(
        "TELEGRAM SUPPORT BOT ERROR:",
        error?.message || error
    );
});

async function startBot() {
    loadState();

    console.log("Starting GamerzAdda Telegram Support Bot...");

    await bot.getMe();

    await checkSupportTickets();

    setInterval(
        checkSupportTickets,
        POLL_MS
    );

    bot.startPolling();

    console.log(
        "GAMERZADDA TELEGRAM SUPPORT BOT STARTED"
    );
}

if (require.main === module) {
    startBot().catch((error) => {
        console.error(
            "SUPPORT BOT START ERROR:",
            error
        );
        process.exit(1);
    });
}

module.exports = {
    bot,
    checkSupportTickets,
    startBot
};
