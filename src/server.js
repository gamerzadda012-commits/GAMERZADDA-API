require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

// ===============================
// ROUTES
// ===============================

const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const tournamentsRouter = require("./routes/tournaments");
const walletRouter = require("./routes/wallet");
const depositRouter = require("./routes/deposit");
const leaderboardRouter = require("./routes/leaderboard");
const referralsRouter = require("./routes/referrals");
const statsRouter = require("./routes/stats");
const profileRouter = require("./routes/profile");
const spinRouter = require("./routes/spin");
const supportRouter = require("./routes/support");

const app = express();

// ===============================
// SUPPORT UPLOADS
// ===============================
// Files stored in:
// /var/www/gamerzadda-api/uploads/
//
// Public URL:
// https://api.gamerzadda.in/uploads/...
//
// IMPORTANT:
// This must be BEFORE the 404 handler.
// ===============================

app.use(
    "/uploads",
    express.static(
        path.join(__dirname, "uploads"),
        {
            maxAge: "1d",
            etag: true
        }
    )
);

// ===============================
// CORS
// ===============================

const ADMIN_FRONTEND_URL =
    process.env.ADMIN_FRONTEND_URL ||
    "http://localhost:3000";

app.use(
    cors({
        origin: ADMIN_FRONTEND_URL,
        credentials: true,
        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With"
        ]
    })
);

// ===============================
// BODY PARSER
// ===============================

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);

// ===============================
// HEALTH
// ===============================

app.get(
    "/api/health",
    async (req, res) => {
        try {
            return res.status(200).json({
                success: true,
                api: "running",
                database: "connected"
            });
        } catch (error) {
            console.error(
                "HEALTH CHECK ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                api: "running",
                database: "error"
            });
        }
    }
);

// ===============================
// AUTH
// ===============================

app.use(
    "/api/auth",
    authRouter
);

// ===============================
// ADMIN
// ===============================

app.use(
    "/api/admin",
    adminRouter
);

// ===============================
// TOURNAMENTS
// ===============================

app.use(
    "/api/tournaments",
    tournamentsRouter
);

// ===============================
// WALLET
// ===============================

app.use(
    "/api/wallet",
    walletRouter
);

// ===============================
// DEPOSIT
// ===============================

app.use(
    "/api/deposit",
    depositRouter
);

// ===============================
// LEADERBOARD
// ===============================

app.use(
    "/api/leaderboard",
    leaderboardRouter
);

// ===============================
// REFERRALS
// ===============================

app.use(
    "/api/referrals",
    referralsRouter
);

// ===============================
// PROFILE
// ===============================

app.use(
    "/api/profile",
    profileRouter
);

// ===============================
// SPIN
//
// spin.js contains:
//
// GET  /spin/:userId
// POST /spin/:userId
//
// Final:
//
// GET  /api/spin/:userId
// POST /api/spin/:userId
// ===============================

app.use(
    "/api",
    spinRouter
);

// ===============================
// SUPPORT
//
// support.js contains:
//
// GET    /:userId
// GET    /:userId/:conversationId
// POST   /:userId
// POST   /:userId/:conversationId/message
// POST   /:userId/:conversationId/upload
// PATCH  /:userId/:conversationId
//
// Final:
//
// GET    /api/support/:userId
// GET    /api/support/:userId/:conversationId
// POST   /api/support/:userId
// POST   /api/support/:userId/:conversationId/message
// POST   /api/support/:userId/:conversationId/upload
// PATCH  /api/support/:userId/:conversationId
// ===============================

app.use(
    "/api/support",
    supportRouter
);

// ===============================
// STATS
// ===============================

app.use(
    "/api",
    statsRouter
);

// ===============================
// ROOT
// ===============================

app.get(
    "/",
    (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "GAMERZADDA API is running"
        });
    }
);

// ===============================
// 404
// ===============================

app.use(
    (req, res) => {
        console.log(
            "404 ROUTE:",
            req.method,
            req.originalUrl
        );

        return res.status(404).json({
            success: false,
            error: "Route not found",
            path: req.originalUrl
        });
    }
);

// ===============================
// GLOBAL ERROR
// ===============================

app.use(
    (error, req, res, next) => {
        console.error(
            "GLOBAL SERVER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Internal server error"
        });
    }
);

// ===============================
// SERVER
// ===============================

const PORT =
    process.env.PORT || 5000;

if (require.main === module) {
    app.listen(
        PORT,
        "0.0.0.0",
        () => {
            console.log(
                `GAMERZADDA API running on port ${PORT}`
            );
        }
    );
}

module.exports = app;