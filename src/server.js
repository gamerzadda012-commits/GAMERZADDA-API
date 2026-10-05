require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

// ===============================
// ROUTES
// ===============================

const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const appVersionRouter = require("./routes/appVersion");
const tournamentsRouter = require("./routes/tournaments");
const walletRouter = require("./routes/wallet");
const depositRouter = require("./routes/deposit");
const leaderboardRouter = require("./routes/leaderboard");
const referralsRouter = require("./routes/referrals");
const statsRouter = require("./routes/stats");
const profileRouter = require("./routes/profile");
const spinRouter = require("./routes/spin");
const scratchCardRouter = require("./routes/scratchCard");
const supportRouter = require("./routes/support");
const notificationsRouter = require("./routes/notifications");

const app = express();

// ===============================
// SUPPORT UPLOADS
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
// APP VERSION
//
// GET /api/app-version
//
// Used by Android app to check:
// - latest version
// - minimum supported version
// - version code
// - APK URL
// - force update
// ===============================

app.use(
    "/api/app-version",
    appVersionRouter
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
// NOTIFICATIONS
// ===============================

app.use(
    "/api/notifications",
    notificationsRouter
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
// SCRATCH CARD
//
// scratchCard.js contains:
//
// GET  /scratch-card/:userId
// POST /scratch-card/:userId/claim
//
// Final:
//
// GET  /api/scratch-card/:userId
// POST /api/scratch-card/:userId/claim
// ===============================

app.use(
    "/api",
    scratchCardRouter
);

// ===============================
// SUPPORT
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