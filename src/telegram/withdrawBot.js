const { Bot } = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const supabase = require("../config/supabase");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TELEGRAM_WITHDRAW_BOT_TOKEN;

const ADMIN_CHAT_ID = String(
    process.env.TELEGRAM_WITHDRAW_ADMIN_CHAT_ID || ""
);

if (!TOKEN) {
    throw new Error(
        "TELEGRAM_WITHDRAW_BOT_TOKEN is missing."
    );
}

if (!ADMIN_CHAT_ID) {
    throw new Error(
        "TELEGRAM_WITHDRAW_ADMIN_CHAT_ID is missing."
    );
}

// ============================================================
// TELEGRAM BOT
// ============================================================

const bot = new Bot(TOKEN);

// ============================================================
// STATE
// ============================================================

const STATE_FILE = path.join(
    __dirname,
    "withdrawBotState.json"
);

let notifiedIds = new Set();

try {
    if (fs.existsSync(STATE_FILE)) {
        const saved = JSON.parse(
            fs.readFileSync(
                STATE_FILE,
                "utf8"
            )
        );

        if (Array.isArray(saved)) {
            notifiedIds = new Set(saved);
        }
    }
} catch (error) {
    console.error(
        "Telegram state load error:",
        error.message
    );
}

function saveState() {
    try {
        fs.writeFileSync(
            STATE_FILE,
            JSON.stringify(
                [...notifiedIds].slice(-5000)
            ),
            "utf8"
        );
    } catch (error) {
        console.error(
            "Telegram state save error:",
            error.message
        );
    }
}

// ============================================================
// TEXT HELPERS
// ============================================================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ============================================================
// SEND NEW WITHDRAWAL
// ============================================================

async function sendWithdrawalRequest(
    withdrawal
) {
    if (!withdrawal?.id) {
        return;
    }

    const amount = Number(
        withdrawal.amount || 0
    );

    const serviceCharge = Number(
        withdrawal.service_charge || 0
    );

    const netAmount = Number(
        withdrawal.net_amount ??
        amount - serviceCharge
    );

    const user = Array.isArray(
        withdrawal.users
    )
        ? withdrawal.users[0] || {}
        : withdrawal.users || {};

    const message = [
        "💸 <b>NEW WITHDRAWAL REQUEST</b>",
        "",
        `👤 <b>User:</b> ${escapeHtml(
            user.game_name || "User"
        )}`,
        `📧 <b>Email:</b> ${escapeHtml(
            user.email || "N/A"
        )}`,
        `🆔 <b>UID:</b> ${escapeHtml(
            user.free_fire_uid || "N/A"
        )}`,
        "",
        `💰 <b>Amount:</b> ₹${amount.toFixed(2)}`,
        `💳 <b>Service Charge:</b> ₹${serviceCharge.toFixed(2)}`,
        `✅ <b>Net Amount:</b> ₹${netAmount.toFixed(2)}`,
        "",
        `👤 <b>Account Holder:</b> ${escapeHtml(
            withdrawal.account_holder_name ||
            "N/A"
        )}`,
        `🏦 <b>UPI ID:</b> ${escapeHtml(
            withdrawal.upi_id || "N/A"
        )}`,
        "",
        `🆔 <b>Withdrawal ID:</b> <code>${escapeHtml(
            withdrawal.id
        )}</code>`,
        "",
        "⏳ <b>Status:</b> PENDING"
    ].join("\n");

    await bot.api.sendMessage(
        ADMIN_CHAT_ID,
        message,
        {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "✅ APPROVE",
                            callback_data:
                                `withdraw:approve:${withdrawal.id}`
                        },
                        {
                            text: "❌ DECLINE",
                            callback_data:
                                `withdraw:reject:${withdrawal.id}`
                        }
                    ]
                ]
            }
        }
    );

    console.log(
        "Telegram withdrawal notification sent:",
        withdrawal.id
    );
}

// ============================================================
// CHECK NEW WITHDRAWALS
// ============================================================

async function checkNewWithdrawals() {
    try {
        const {
            data,
            error
        } = await supabase
            .from("withdraw_requests")
            .select(`
                id,
                user_id,
                account_holder_name,
                amount,
                upi_id,
                status,
                service_charge,
                net_amount,
                created_at,
                users (
                    email,
                    game_name,
                    free_fire_uid
                )
            `)
            .eq(
                "status",
                "pending"
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            )
            .limit(50);

        if (error) {
            console.error(
                "Telegram withdrawal fetch error:",
                error.message
            );
            return;
        }

        for (
            const withdrawal
            of data || []
        ) {
            const id = String(
                withdrawal.id
            );

            if (
                notifiedIds.has(id)
            ) {
                continue;
            }

            try {
                await sendWithdrawalRequest(
                    withdrawal
                );

                notifiedIds.add(id);

                saveState();
            } catch (error) {
                console.error(
                    "Telegram notification error:",
                    error.message
                );
            }
        }
    } catch (error) {
        console.error(
            "Telegram withdrawal checker error:",
            error.message
        );
    }
}

// ============================================================
// CALLBACK HANDLER
// ============================================================

bot.on(
    "callback_query",
    async (query) => {
        try {
            const chatId = String(
                query?.message?.chat?.id ||
                ""
            );

            // Only configured admin
            if (
                chatId !==
                ADMIN_CHAT_ID
            ) {
                await bot.api.answerCallbackQuery(
                    query.id,
                    {
                        text:
                            "❌ Unauthorized",
                        show_alert:
                            true
                    }
                );

                return;
            }

            const data = String(
                query.data || ""
            );

            if (
                !data.startsWith(
                    "withdraw:"
                )
            ) {
                return;
            }

            const parts =
                data.split(":");

            const action =
                parts[1];

            const withdrawalId =
                parts
                    .slice(2)
                    .join(":");

            if (
                ![
                    "approve",
                    "reject"
                ].includes(action) ||
                !withdrawalId
            ) {
                await bot.api.answerCallbackQuery(
                    query.id,
                    {
                        text:
                            "Invalid withdrawal request.",
                        show_alert:
                            true
                    }
                );

                return;
            }

            await bot.api.answerCallbackQuery(
                query.id,
                {
                    text:
                        action ===
                        "approve"
                            ? "⏳ Approving..."
                            : "⏳ Declining..."
                }
            );

            // ==================================================
            // GET WITHDRAWAL
            // ==================================================

            const {
                data:
                    withdrawal,
                error:
                    lookupError
            } = await supabase
                .from(
                    "withdraw_requests"
                )
                .select(`
                    id,
                    user_id,
                    amount,
                    upi_id,
                    account_holder_name,
                    status,
                    service_charge,
                    net_amount
                `)
                .eq(
                    "id",
                    withdrawalId
                )
                .maybeSingle();

            if (lookupError) {
                throw lookupError;
            }

            if (!withdrawal) {
                await bot.api.sendMessage(
                    ADMIN_CHAT_ID,
                    "❌ Withdrawal request not found."
                );

                return;
            }

            // ==================================================
            // ALREADY PROCESSED
            // ==================================================

            if (
                String(
                    withdrawal.status
                ).toLowerCase() !==
                "pending"
            ) {
                await bot.api.sendMessage(
                    ADMIN_CHAT_ID,
                    [
                        "⚠️ <b>Withdrawal Already Processed</b>",
                        "",
                        `Status: <b>${escapeHtml(
                            withdrawal.status
                        )}</b>`,
                        "",
                        `ID: <code>${escapeHtml(
                            withdrawalId
                        )}</code>`
                    ].join("\n"),
                    {
                        parse_mode:
                            "HTML"
                    }
                );

                notifiedIds.add(
                    String(
                        withdrawalId
                    )
                );

                saveState();

                return;
            }

            // ==================================================
            // SAME EXISTING ADMIN RPC
            // ==================================================

            const {
                data: rpcData,
                error: rpcError
            } = await supabase.rpc(
                "admin_process_withdrawal",
                {
                    p_withdrawal_id:
                        withdrawalId,

                    p_action:
                        action,

                    p_note:
                        action ===
                        "approve"
                            ? "Approved via Telegram"
                            : "Declined via Telegram"
                }
            );

            if (rpcError) {
                throw rpcError;
            }

            const result =
                Array.isArray(
                    rpcData
                )
                    ? rpcData[0]
                    : rpcData;

            if (
                result &&
                result.success ===
                    false
            ) {
                await bot.api.sendMessage(
                    ADMIN_CHAT_ID,
                    [
                        "❌ <b>Withdrawal Processing Failed</b>",
                        "",
                        escapeHtml(
                            result.message ||
                                result.error ||
                                "Unknown error"
                        )
                    ].join("\n"),
                    {
                        parse_mode:
                            "HTML"
                    }
                );

                return;
            }

            // ==================================================
            // SUCCESS
            // ==================================================

            notifiedIds.add(
                String(
                    withdrawalId
                )
            );

            saveState();

            const amount =
                Number(
                    withdrawal.amount ||
                        0
                );

            const serviceCharge =
                Number(
                    withdrawal.service_charge ||
                        0
                );

            const netAmount =
                Number(
                    withdrawal.net_amount ??
                        amount -
                            serviceCharge
                );

            const isApproved =
                action ===
                "approve";

            const statusText =
                isApproved
                    ? "✅ APPROVED"
                    : "❌ DECLINED";

            const finalMessage = [
                isApproved
                    ? "💸 <b>WITHDRAWAL APPROVED</b>"
                    : "💸 <b>WITHDRAWAL DECLINED</b>",
                "",
                `💰 <b>Amount:</b> ₹${amount.toFixed(2)}`,
                `💳 <b>Service Charge:</b> ₹${serviceCharge.toFixed(2)}`,
                `💵 <b>Net Amount:</b> ₹${netAmount.toFixed(2)}`,
                "",
                `👤 <b>Account Holder:</b> ${escapeHtml(
                    withdrawal.account_holder_name ||
                        "N/A"
                )}`,
                `🏦 <b>UPI ID:</b> ${escapeHtml(
                    withdrawal.upi_id ||
                        "N/A"
                )}`,
                "",
                `🆔 <b>Withdrawal ID:</b> <code>${escapeHtml(
                    withdrawalId
                )}</code>`,
                "",
                `<b>Status:</b> ${statusText}`,
                "",
                "🤖 <i>Processed via GamerzAdda Telegram Bot</i>"
            ].join("\n");

            // ==================================================
            // UPDATE ORIGINAL TELEGRAM MESSAGE
            // ==================================================

            if (
                query.message?.message_id
            ) {
                await bot.api.editMessageText(
                    finalMessage,
                    {
                        chat_id:
                            ADMIN_CHAT_ID,

                        message_id:
                            query.message
                                .message_id,

                        parse_mode:
                            "HTML",

                        reply_markup: {
                            inline_keyboard:
                                []
                        }
                    }
                );
            }

            console.log(
                "Telegram withdrawal processed:",
                {
                    withdrawalId,
                    action
                }
            );
        } catch (error) {
            console.error(
                "Telegram withdrawal callback error:",
                error
            );

            try {
                await bot.api.answerCallbackQuery(
                    query.id,
                    {
                        text:
                            error?.message ||
                            "Something went wrong.",
                        show_alert:
                            true
                    }
                );
            } catch {}
        }
    }
);

// ============================================================
// BOT START
// ============================================================

async function startBot() {
    try {
        await bot.init();

        console.log(
            "=========================================="
        );

        console.log(
            "GAMERZADDA WITHDRAW TELEGRAM BOT STARTED"
        );

        console.log(
            "ADMIN CHAT ID:",
            ADMIN_CHAT_ID
        );

        console.log(
            "=========================================="
        );

        // Start polling
        bot.start({
            allowed_updates: [
                "message",
                "callback_query"
            ]
        });

        // Initial check
        await checkNewWithdrawals();

        // Check every 5 seconds
        setInterval(
            checkNewWithdrawals,
            5000
        );
    } catch (error) {
        console.error(
            "TELEGRAM BOT START ERROR:",
            error
        );

        process.exit(1);
    }
}

startBot();

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    bot,
    sendWithdrawalRequest,
    checkNewWithdrawals
};