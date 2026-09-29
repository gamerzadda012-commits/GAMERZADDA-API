const express = require("express");

const router = express.Router();
const supabase = require("../config/supabase");

// ======================================================
// GET USER SUPPORT CONVERSATIONS
// GET /api/support/:userId
// ======================================================

router.get("/:userId", async (req, res) => {
    try {
        const userId = String(req.params.userId || "").trim();

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required."
            });
        }

        const { data, error } = await supabase
            .from("support_conversations")
            .select("*")
            .eq("user_id", userId)
            .order("updated_at", {
                ascending: false
            });

        if (error) {
            console.error("SUPPORT CONVERSATIONS ERROR:", error);

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true,
            conversations: data || []
        });

    } catch (error) {
        console.error("SUPPORT GET ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Internal server error."
        });
    }
});


// ======================================================
// GET MESSAGES
// GET /api/support/:userId/:conversationId
// ======================================================

router.get("/:userId/:conversationId", async (req, res) => {
    try {
        const userId = String(req.params.userId || "").trim();
        const conversationId = String(
            req.params.conversationId || ""
        ).trim();

        if (!userId || !conversationId) {
            return res.status(400).json({
                success: false,
                error: "User ID and conversation ID are required."
            });
        }

        // Verify conversation belongs to user
        const { data: conversation, error: conversationError } =
            await supabase
                .from("support_conversations")
                .select("id, user_id, status, category, created_at, updated_at")
                .eq("id", conversationId)
                .eq("user_id", userId)
                .maybeSingle();

        if (conversationError) {
            console.error(
                "SUPPORT CONVERSATION CHECK ERROR:",
                conversationError
            );

            return res.status(500).json({
                success: false,
                error: conversationError.message
            });
        }

        if (!conversation) {
            return res.status(404).json({
                success: false,
                error: "Support conversation not found."
            });
        }

        const { data: messages, error: messagesError } =
            await supabase
                .from("support_messages")
                .select("*")
                .eq("conversation_id", conversationId)
                .order("created_at", {
                    ascending: true
                });

        if (messagesError) {
            console.error(
                "SUPPORT MESSAGES ERROR:",
                messagesError
            );

            return res.status(500).json({
                success: false,
                error: messagesError.message
            });
        }

        return res.json({
            success: true,
            conversation,
            messages: messages || []
        });

    } catch (error) {
        console.error("SUPPORT MESSAGE GET ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Internal server error."
        });
    }
});


// ======================================================
// CREATE CONVERSATION
// POST /api/support/:userId
// ======================================================

router.post("/:userId", async (req, res) => {
    try {
        const userId = String(req.params.userId || "").trim();

        const category = String(
            req.body?.category || "general"
        ).trim();

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required."
            });
        }

        // Check if user exists
        const { data: user, error: userError } =
            await supabase
                .from("users")
                .select("id")
                .eq("id", userId)
                .maybeSingle();

        if (userError) {
            console.error(
                "SUPPORT USER CHECK ERROR:",
                userError
            );

            return res.status(500).json({
                success: false,
                error: userError.message
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found."
            });
        }

        // Reuse existing open conversation if available
        const { data: existingConversation, error: existingError } =
            await supabase
                .from("support_conversations")
                .select("*")
                .eq("user_id", userId)
                .eq("status", "open")
                .order("updated_at", {
                    ascending: false
                })
                .limit(1)
                .maybeSingle();

        if (existingError) {
            console.error(
                "SUPPORT EXISTING CONVERSATION ERROR:",
                existingError
            );

            return res.status(500).json({
                success: false,
                error: existingError.message
            });
        }

        if (existingConversation) {
            return res.json({
                success: true,
                conversation: existingConversation,
                existing: true
            });
        }

        const { data: conversation, error: createError } =
            await supabase
                .from("support_conversations")
                .insert({
                    user_id: userId,
                    status: "open",
                    category
                })
                .select("*")
                .single();

        if (createError) {
            console.error(
                "SUPPORT CREATE CONVERSATION ERROR:",
                createError
            );

            return res.status(500).json({
                success: false,
                error: createError.message
            });
        }

        return res.status(201).json({
            success: true,
            conversation,
            existing: false
        });

    } catch (error) {
        console.error(
            "SUPPORT CREATE API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message || "Internal server error."
        });
    }
});


// ======================================================
// SEND TEXT MESSAGE
// POST /api/support/:userId/:conversationId/message
// ======================================================

router.post(
    "/:userId/:conversationId/message",
    async (req, res) => {
        try {
            const userId = String(
                req.params.userId || ""
            ).trim();

            const conversationId = String(
                req.params.conversationId || ""
            ).trim();

            const message = String(
                req.body?.message || ""
            ).trim();

            if (!userId || !conversationId) {
                return res.status(400).json({
                    success: false,
                    error: "User ID and conversation ID are required."
                });
            }

            if (!message) {
                return res.status(400).json({
                    success: false,
                    error: "Message cannot be empty."
                });
            }

            if (message.length > 5000) {
                return res.status(400).json({
                    success: false,
                    error: "Message is too long."
                });
            }

            // Verify conversation
            const { data: conversation, error: conversationError } =
                await supabase
                    .from("support_conversations")
                    .select("id, user_id, status")
                    .eq("id", conversationId)
                    .eq("user_id", userId)
                    .maybeSingle();

            if (conversationError) {
                console.error(
                    "SUPPORT MESSAGE CONVERSATION ERROR:",
                    conversationError
                );

                return res.status(500).json({
                    success: false,
                    error: conversationError.message
                });
            }

            if (!conversation) {
                return res.status(404).json({
                    success: false,
                    error: "Support conversation not found."
                });
            }

            if (conversation.status !== "open") {
                return res.status(400).json({
                    success: false,
                    error: "This support conversation is closed."
                });
            }

            const { data: newMessage, error: messageError } =
                await supabase
                    .from("support_messages")
                    .insert({
                        conversation_id: conversationId,
                        sender_id: userId,
                        sender_type: "user",
                        message,
                        attachment_url: null,
                        attachment_name: null,
                        attachment_type: null,
                        attachment_size: null
                    })
                    .select("*")
                    .single();

            if (messageError) {
                console.error(
                    "SUPPORT MESSAGE INSERT ERROR:",
                    messageError
                );

                return res.status(500).json({
                    success: false,
                    error: messageError.message
                });
            }

            await supabase
                .from("support_conversations")
                .update({
                    updated_at: new Date().toISOString()
                })
                .eq("id", conversationId);

            return res.status(201).json({
                success: true,
                message: newMessage
            });

        } catch (error) {
            console.error(
                "SUPPORT SEND MESSAGE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message || "Internal server error."
            });
        }
    }
);


// ======================================================
// CLOSE CONVERSATION
// PATCH /api/support/:userId/:conversationId
// ======================================================

router.patch(
    "/:userId/:conversationId",
    async (req, res) => {
        try {
            const userId = String(
                req.params.userId || ""
            ).trim();

            const conversationId = String(
                req.params.conversationId || ""
            ).trim();

            const status = String(
                req.body?.status || ""
            ).trim().toLowerCase();

            if (!["open", "closed"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: "Status must be open or closed."
                });
            }

            const { data, error } = await supabase
                .from("support_conversations")
                .update({
                    status,
                    updated_at: new Date().toISOString()
                })
                .eq("id", conversationId)
                .eq("user_id", userId)
                .select("*")
                .maybeSingle();

            if (error) {
                console.error(
                    "SUPPORT STATUS UPDATE ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            if (!data) {
                return res.status(404).json({
                    success: false,
                    error: "Support conversation not found."
                });
            }

            return res.json({
                success: true,
                conversation: data
            });

        } catch (error) {
            console.error(
                "SUPPORT CLOSE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message || "Internal server error."
            });
        }
    }
);


module.exports = router;