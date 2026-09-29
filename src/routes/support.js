const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const router = express.Router();
const supabase = require("../config/supabase");

// ======================================================
// CONFIG
// ======================================================

const UPLOAD_DIR = path.join(
    __dirname,
    "..",
    "..",
    "uploads",
    "support"
);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",

    "video/mp4",
    "video/webm",
    "video/quicktime",

    "application/pdf"
]);

// ======================================================
// CREATE UPLOAD DIRECTORY
// ======================================================

fs.mkdirSync(UPLOAD_DIR, {
    recursive: true
});

// ======================================================
// MULTER STORAGE
// ======================================================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },

    filename: function (req, file, cb) {

        const ext = path
            .extname(file.originalname || "")
            .toLowerCase();

        const safeExt =
            ext && ext.length <= 10
                ? ext
                : "";

        const uniqueName =
            `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${safeExt}`;

        cb(null, uniqueName);
    }
});

const upload = multer({

    storage,

    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1
    },

    fileFilter: function (req, file, cb) {

        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {

            return cb(
                new Error(
                    "Unsupported file type. Allowed: JPG, PNG, WEBP, GIF, MP4, WEBM, MOV and PDF."
                )
            );
        }

        cb(null, true);
    }
});

// ======================================================
// HELPERS
// ======================================================

function getAttachmentUrl(req, filename) {

    return `https://api.gamerzadda.in/uploads/support/${encodeURIComponent(
        filename
    )}`;
}

function deleteUploadedFile(file) {

    if (!file?.path) {
        return;
    }

    try {

        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

    } catch (error) {

        console.error(
            "UPLOAD CLEANUP ERROR:",
            error
        );
    }
}

// ======================================================
// VERIFY OPEN CONVERSATION
// ======================================================

async function verifyOpenConversation(
    userId,
    conversationId
) {

    const {
        data: conversation,
        error
    } = await supabase
        .from("support_conversations")
        .select(
            "id, user_id, status, category, created_at, updated_at"
        )
        .eq("id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!conversation) {

        return {
            ok: false,
            status: 404,
            error: "Support conversation not found."
        };
    }

    if (conversation.status !== "open") {

        return {
            ok: false,
            status: 400,
            error: "This support conversation is closed."
        };
    }

    return {
        ok: true,
        conversation
    };
}

// ======================================================
// GET USER SUPPORT CONVERSATIONS
// GET /api/support/:userId
// ======================================================

router.get("/:userId", async (req, res) => {

    try {

        const userId =
            String(
                req.params.userId || ""
            ).trim();

        if (!userId) {

            return res.status(400).json({
                success: false,
                error: "User ID is required."
            });
        }

        const {
            data,
            error
        } = await supabase
            .from("support_conversations")
            .select("*")
            .eq("user_id", userId)
            .order("updated_at", {
                ascending: false
            });

        if (error) {

            console.error(
                "SUPPORT CONVERSATIONS ERROR:",
                error
            );

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

        console.error(
            "SUPPORT GET ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                "Internal server error."
        });
    }
});

// ======================================================
// GET MESSAGES
// GET /api/support/:userId/:conversationId
// ======================================================

router.get(
    "/:userId/:conversationId",
    async (req, res) => {

        try {

            const userId =
                String(
                    req.params.userId || ""
                ).trim();

            const conversationId =
                String(
                    req.params.conversationId || ""
                ).trim();

            if (!userId || !conversationId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "User ID and conversation ID are required."
                });
            }

            const {
                data: conversation,
                error: conversationError
            } = await supabase
                .from("support_conversations")
                .select(
                    "id, user_id, status, category, created_at, updated_at"
                )
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
                    error:
                        "Support conversation not found."
                });
            }

            const {
                data: messages,
                error: messagesError
            } = await supabase
                .from("support_messages")
                .select("*")
                .eq(
                    "conversation_id",
                    conversationId
                )
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

            console.error(
                "SUPPORT MESSAGE GET ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Internal server error."
            });
        }
    }
);

// ======================================================
// CREATE CONVERSATION
// POST /api/support/:userId
// ======================================================

router.post("/:userId", async (req, res) => {

    try {

        const userId =
            String(
                req.params.userId || ""
            ).trim();

        const category =
            String(
                req.body?.category ||
                "general"
            ).trim();

        if (!userId) {

            return res.status(400).json({
                success: false,
                error: "User ID is required."
            });
        }

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

        const {
            data: existingConversation,
            error: existingError
        } = await supabase
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
                conversation:
                    existingConversation,
                existing: true
            });
        }

        const {
            data: conversation,
            error: createError
        } = await supabase
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
            error:
                error.message ||
                "Internal server error."
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

            const userId =
                String(
                    req.params.userId || ""
                ).trim();

            const conversationId =
                String(
                    req.params.conversationId || ""
                ).trim();

            const message =
                String(
                    req.body?.message || ""
                ).trim();

            if (!userId || !conversationId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "User ID and conversation ID are required."
                });
            }

            if (!message) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Message cannot be empty."
                });
            }

            if (message.length > 5000) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Message is too long."
                });
            }

            const verification =
                await verifyOpenConversation(
                    userId,
                    conversationId
                );

            if (!verification.ok) {

                return res.status(
                    verification.status
                ).json({
                    success: false,
                    error:
                        verification.error
                });
            }

            const {
                data: newMessage,
                error: messageError
            } = await supabase
                .from("support_messages")
                .insert({

                    conversation_id:
                        conversationId,

                    sender_id:
                        userId,

                    sender_type:
                        "user",

                    message:
                        message,

                    attachment_url:
                        null,

                    attachment_name:
                        null,

                    attachment_type:
                        null,

                    attachment_size:
                        null
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
                    error:
                        messageError.message
                });
            }

            await supabase
                .from("support_conversations")
                .update({
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    conversationId
                );

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
                error:
                    error.message ||
                    "Internal server error."
            });
        }
    }
);

// ======================================================
// UPLOAD ATTACHMENT
// POST /api/support/:userId/:conversationId/upload
//
// multipart/form-data
// field: file
// optional field: message
// ======================================================

router.post(
    "/:userId/:conversationId/upload",

    async (req, res, next) => {

        try {

            const userId =
                String(
                    req.params.userId || ""
                ).trim();

            const conversationId =
                String(
                    req.params.conversationId || ""
                ).trim();

            if (!userId || !conversationId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "User ID and conversation ID are required."
                });
            }

            const verification =
                await verifyOpenConversation(
                    userId,
                    conversationId
                );

            if (!verification.ok) {

                return res.status(
                    verification.status
                ).json({
                    success: false,
                    error:
                        verification.error
                });
            }

            next();

        } catch (error) {

            console.error(
                "SUPPORT UPLOAD VERIFY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to verify support conversation."
            });
        }
    },

    upload.single("file"),

    async (req, res) => {

        try {

            const userId =
                String(
                    req.params.userId || ""
                ).trim();

            const conversationId =
                String(
                    req.params.conversationId || ""
                ).trim();

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Please select a file."
                });
            }

            // IMPORTANT:
            // Database message column is NOT NULL.
            // A valid placeholder is used when there is no text message.
            const message =
                String(
                    req.body?.message || ""
                ).trim();

            if (message.length > 5000) {

                deleteUploadedFile(
                    req.file
                );

                return res.status(400).json({
                    success: false,
                    error:
                        "Message is too long."
                });
            }

            const attachmentUrl =
                getAttachmentUrl(
                    req,
                    req.file.filename
                );

            const {
                data: newMessage,
                error: messageError
            } = await supabase
                .from("support_messages")
                .insert({

                    conversation_id:
                        conversationId,

                    sender_id:
                        userId,

                    sender_type:
                        "user",

                    // NEVER NULL
                    message:
                        message || "[Attachment]",

                    attachment_url:
                        attachmentUrl,

                    attachment_name:
                        req.file.originalname,

                    attachment_type:
                        req.file.mimetype,

                    attachment_size:
                        req.file.size
                })
                .select("*")
                .single();

            if (messageError) {

                deleteUploadedFile(
                    req.file
                );

                console.error(
                    "SUPPORT ATTACHMENT DB ERROR:",
                    messageError
                );

                return res.status(500).json({
                    success: false,
                    error:
                        messageError.message
                });
            }

            await supabase
                .from("support_conversations")
                .update({
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    conversationId
                );

            return res.status(201).json({

                success: true,

                message:
                    newMessage,

                attachment: {

                    url:
                        attachmentUrl,

                    name:
                        req.file.originalname,

                    type:
                        req.file.mimetype,

                    size:
                        req.file.size
                }
            });

        } catch (error) {

            if (req.file) {

                deleteUploadedFile(
                    req.file
                );
            }

            console.error(
                "SUPPORT ATTACHMENT UPLOAD ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to upload attachment."
            });
        }
    }
);

// ======================================================
// MULTER / UPLOAD ERROR HANDLER
// ======================================================

router.use(
    (
        error,
        req,
        res,
        next
    ) => {

        if (
            error instanceof multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(413).json({
                    success: false,
                    error:
                        "File is too large. Maximum size is 50 MB."
                });
            }

            return res.status(400).json({
                success: false,
                error:
                    error.message ||
                    "File upload failed."
            });
        }

        if (error) {

            return res.status(400).json({
                success: false,
                error:
                    error.message ||
                    "File upload failed."
            });
        }

        next();
    }
);

// ======================================================
// CLOSE / UPDATE CONVERSATION
// PATCH /api/support/:userId/:conversationId
// ======================================================

router.patch(
    "/:userId/:conversationId",
    async (req, res) => {

        try {

            const userId =
                String(
                    req.params.userId || ""
                ).trim();

            const conversationId =
                String(
                    req.params.conversationId || ""
                ).trim();

            const status =
                String(
                    req.body?.status || ""
                )
                    .trim()
                    .toLowerCase();

            if (
                !["open", "closed"].includes(
                    status
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Status must be open or closed."
                });
            }

            const {
                data,
                error
            } = await supabase
                .from("support_conversations")
                .update({

                    status,

                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    conversationId
                )
                .eq(
                    "user_id",
                    userId
                )
                .select("*")
                .maybeSingle();

            if (error) {

                console.error(
                    "SUPPORT STATUS UPDATE ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        error.message
                });
            }

            if (!data) {

                return res.status(404).json({
                    success: false,
                    error:
                        "Support conversation not found."
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
                error:
                    error.message ||
                    "Internal server error."
            });
        }
    }
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;