const { Bot } = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const supabase = require("../config/supabase");

// ============================================================
// CONFIG
// ============================================================

const TOKEN =
    process.env.TELEGRAM_WITHDRAW_BOT_TOKEN;

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
// BOT
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

let pendingDeclines = new Map();

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
        "WITHDRAW BOT STATE LOAD ERROR:",
        error.message
    );
}

function saveState() {
    try {
        fs.writeFileSync(
            STATE_FILE,
            JSON.stringify(
                [...notifiedIds].slice(-5000),
                null,
                2
            ),
            "utf8"
        );
    } catch (error) {
        console.error(
            "WITHDRAW BOT STATE SAVE ERROR:",
            error.message
        );
    }
}

// ============================================================
// HELPERS
// ============================================================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getUser(withdrawal) {
    return Array.isArray(withdrawal?.users)
        ? withdrawal.users[0] || {}
        : withdrawal?.users || {};
}

// ============================================================
// SEND NEW WITHDRAWAL
// ============================================================

async function sendWithdrawalRequest(withdrawal) {
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

    const user = getUser(withdrawal);

    const upiId =
        String(
            withdrawal.upi_id || "N/A"
        );

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
        `🏦 <b>UPI ID:</b> <code>${escapeHtml(
            upiId
        )}</code>`,
        "",
        `🆔 <b>Withdrawal ID:</b> <code>${escapeHtml(
            withdrawal.id
        )}</code>`,
        "",
        "⏳ <b>Status:</b> PENDING"
    ].join("\n");

    await bot.api.sendMessage({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: "HTML",

        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "📋 COPY UPI",
                        copy_text: {
                            text: upiId
                        }
                    }
                ],
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
    });

    console.log(
        "TELEGRAM WITHDRAWAL NOTIFICATION SENT:",
        withdrawal.id
    );
}

// ============================================================
// CHECK PENDING WITHDRAWALS
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
                "TELEGRAM WITHDRAWAL FETCH ERROR:",
                error.message
            );

            return;
        }

        for (
            const withdrawal of data || []
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
                    "TELEGRAM WITHDRAWAL SEND ERROR:",
                    error.message
                );
            }
        }
    } catch (error) {
        console.error(
            "TELEGRAM WITHDRAWAL CHECK ERROR:",
            error.message
        );
    }
}

// ============================================================
// PROCESS WITHDRAWAL
// ============================================================

async function processWithdrawal(
    withdrawalId,
    action,
    note
) {
    const {
        data: withdrawal,
        error: lookupError
    } = await supabase
        .from("withdraw_requests")
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
        throw new Error(
            "Withdrawal request not found."
        );
    }

    if (
        String(
            withdrawal.status
        ).toLowerCase() !== "pending"
    ) {
        throw new Error(
            `Withdrawal already processed. Status: ${withdrawal.status}`
        );
    }

    // ========================================================
    // SAME EXISTING ADMIN RPC
    // ========================================================

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
                note || null
        }
    );

    if (rpcError) {
        throw rpcError;
    }

    const result =
        Array.isArray(rpcData)
            ? rpcData[0]
            : rpcData;

    if (
        result &&
        result.success === false
    ) {
        throw new Error(
            result.message ||
            result.error ||
            "Withdrawal processing failed."
        );
    }

    return {
        withdrawal,
        result
    };
}

// ============================================================
// FINISH TELEGRAM MESSAGE
// ============================================================

async function finishWithdrawalMessage(
    callback,
    withdrawal,
    action,
    note
) {
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

    const approved =
        action === "approve";

    const lines = [
        approved
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
        `🏦 <b>UPI ID:</b> <code>${escapeHtml(
            withdrawal.upi_id || "N/A"
        )}</code>`,
        "",
        `🆔 <b>Withdrawal ID:</b> <code>${escapeHtml(
            withdrawal.id
        )}</code>`,
        ""
    ];

    if (!approved && note) {
        lines.push(
            `📝 <b>Decline Reason:</b> ${escapeHtml(
                note
            )}`,
            ""
        );
    }

    lines.push(
        approved
            ? "✅ <b>Status:</b> APPROVED"
            : "❌ <b>Status:</b> DECLINED",
        "",
        "🤖 <i>Processed via GamerzAdda Telegram Bot</i>"
    );

    if (
        callback?.message?.message_id
    ) {
        await bot.api.editMessageText({
            chat_id:
                ADMIN_CHAT_ID,

            message_id:
                callback.message
                    .message_id,

            text:
                lines.join("\n"),

            parse_mode:
                "HTML",

            reply_markup: {
                inline_keyboard: []
            }
        });
    }
}

// ============================================================
// CALLBACK HANDLER
// ============================================================

bot.on(
    "callback_query",
    async (ctx) => {
        try {
            const callback =
                ctx.callbackQuery;

            const chatId = String(
                callback?.message?.chat?.id ||
                ""
            );

            // ------------------------------------------------
            // ADMIN ONLY
            // ------------------------------------------------

            if (
                chatId !==
                ADMIN_CHAT_ID
            ) {
                await ctx.answerCallbackQuery({
                    text:
                        "❌ Unauthorized",
                    show_alert:
                        true
                });

                return;
            }

            const data = String(
                callback?.data || ""
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
                await ctx.answerCallbackQuery({
                    text:
                        "Invalid withdrawal request.",
                    show_alert:
                        true
                });

                return;
            }

            // =================================================
            // DECLINE -> ASK FOR REASON
            // =================================================

            if (
                action === "reject"
            ) {
                pendingDeclines.set(
                    ADMIN_CHAT_ID,
                    {
                        withdrawalId,
                        messageId:
                            callback
                                ?.message
                                ?.message_id ||
                            null,
                        createdAt:
                            Date.now()
                    }
                );

                await ctx.answerCallbackQuery({
                    text:
                        "Enter decline reason"
                });

                await bot.api.sendMessage({
                    chat_id:
                        ADMIN_CHAT_ID,

                    text:
                        "❌ <b>DECLINE WITHDRAWAL</b>\n\n" +
                        "Please send the reason for declining this withdrawal.\n\n" +
                        "Example: <i>Invalid UPI ID</i>\n\n" +
                        "⏳ Waiting for your reason...",
                    parse_mode:
                        "HTML"
                });

                return;
            }

            // =================================================
            // APPROVE
            // =================================================

            await ctx.answerCallbackQuery({
                text:
                    "⏳ Approving withdrawal..."
            });

            const {
                withdrawal
            } = await processWithdrawal(
                withdrawalId,
                "approve",
                "Approved via Telegram"
            );

            notifiedIds.add(
                String(
                    withdrawalId
                )
            );

            saveState();

            await finishWithdrawalMessage(
                callback,
                withdrawal,
                "approve",
                null
            );

            console.log(
                "TELEGRAM WITHDRAWAL APPROVED:",
                withdrawalId
            );
        } catch (error) {
            console.error(
                "TELEGRAM CALLBACK ERROR:",
                error
            );

            try {
                await ctx.answerCallbackQuery({
                    text:
                        error?.message ||
                        "Something went wrong.",
                    show_alert:
                        true
                });
            } catch {}
        }
    }
);

// ============================================================
// DECLINE REASON MESSAGE
// ============================================================

bot.on(
    "message",
    async (ctx) => {
        try {
            const message =
                ctx.message;

            const chatId = String(
                message?.chat?.id || ""
            );

            // Only configured admin
            if (
                chatId !==
                ADMIN_CHAT_ID
            ) {
                return;
            }

            const pending =
                pendingDeclines.get(
                    ADMIN_CHAT_ID
                );

            if (!pending) {
                return;
            }

            // Ignore empty/non-text messages
            if (
                typeof message.text !==
                "string"
            ) {
                return;
            }

            const reason =
                message.text.trim();

            if (!reason) {
                return;
            }

            // ------------------------------------------------
            // Expire old decline request after 10 minutes
            // ------------------------------------------------

            if (
                Date.now() -
                    pending.createdAt >
                10 * 60 * 1000
            ) {
                pendingDeclines.delete(
                    ADMIN_CHAT_ID
                );

                await bot.api.sendMessage({
                    chat_id:
                        ADMIN_CHAT_ID,

                    text:
                        "⌛ Decline request expired. Press ❌ DECLINE again."
                });

                return;
            }

            // Remove waiting state first
            pendingDeclines.delete(
                ADMIN_CHAT_ID
            );

            await bot.api.sendMessage({
                chat_id:
                    ADMIN_CHAT_ID,

                text:
                    "⏳ Processing decline..."
            });

            const {
                withdrawal
            } = await processWithdrawal(
                pending.withdrawalId,
                "reject",
                reason
            );

            notifiedIds.add(
                String(
                    pending.withdrawalId
                )
            );

            saveState();

            // ------------------------------------------------
            // Update original withdrawal message
            // ------------------------------------------------

            if (
                pending.messageId
            ) {
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

                const finalMessage = [
                    "💸 <b>WITHDRAWAL DECLINED</b>",
                    "",
                    `💰 <b>Amount:</b> ₹${amount.toFixed(2)}`,
                    `💳 <b>Service Charge:</b> ₹${serviceCharge.toFixed(2)}`,
                    `💵 <b>Net Amount:</b> ₹${netAmount.toFixed(2)}`,
                    "",
                    `👤 <b>Account Holder:</b> ${escapeHtml(
                        withdrawal.account_holder_name ||
                        "N/A"
                    )}`,
                    `🏦 <b>UPI ID:</b> <code>${escapeHtml(
                        withdrawal.upi_id ||
                        "N/A"
                    )}</code>`,
                    "",
                    `🆔 <b>Withdrawal ID:</b> <code>${escapeHtml(
                        pending.withdrawalId
                    )}</code>`,
                    "",
                    `📝 <b>Decline Reason:</b> ${escapeHtml(
                        reason
                    )}`,
                    "",
                    "❌ <b>Status:</b> DECLINED",
                    "",
                    "🤖 <i>Processed via GamerzAdda Telegram Bot</i>"
                ].join("\n");

                try {
                    await bot.api.editMessageText({
                        chat_id:
                            ADMIN_CHAT_ID,

                        message_id:
                            pending.messageId,

                        text:
                            finalMessage,

                        parse_mode:
                            "HTML",

                        reply_markup: {
                            inline_keyboard: []
                        }
                    });
                } catch (
                    editError
                ) {
                    console.error(
                        "TELEGRAM MESSAGE UPDATE ERROR:",
                        editError.message
                    );
                }
            }

            console.log(
                "TELEGRAM WITHDRAWAL DECLINED:",
                {
                    withdrawalId:
                        pending.withdrawalId,
                    reason
                }
            );
        } catch (error) {
            console.error(
                "TELEGRAM DECLINE REASON ERROR:",
                error
            );

            pendingDeclines.delete(
                ADMIN_CHAT_ID
            );

            try {
                await bot.api.sendMessage({
                    chat_id:
                        ADMIN_CHAT_ID,

                    text:
                        `❌ Decline failed: ${escapeHtml(
                            error?.message ||
                            "Something went wrong."
                        )}`,

                    parse_mode:
                        "HTML"
                });
            } catch {}
        }
    }
);

// ============================================================
// BOT ERROR HANDLER
// ============================================================

bot.catch(
    (error) => {
        console.error(
            "TELEGRAM BOT ERROR:",
            error
        );
    }
);

// ============================================================
// START BOT
// ============================================================

async function startBot() {
    try {
        console.log(
            "=========================================="
        );

        console.log(
            "GAMERZADDA WITHDRAW TELEGRAM BOT STARTING"
        );

        console.log(
            "ADMIN CHAT ID:",
            ADMIN_CHAT_ID
        );

        console.log(
            "=========================================="
        );

        // Check pending withdrawals immediately
        await checkNewWithdrawals();

        // Check every 5 seconds
        setInterval(
            checkNewWithdrawals,
            5000
        );

        // Start Telegram polling
        bot.startPolling();

        console.log(
            "GAMERZADDA WITHDRAW TELEGRAM BOT STARTED"
        );
    } catch (error) {
        console.error(
            "TELEGRAM BOT START ERROR:",
            error
        );
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