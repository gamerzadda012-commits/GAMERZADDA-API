const express = require("express");
const cors = require("cors");

// Routes
const authRoutes = require("../src/routes/auth");
const depositRoutes = require("../src/routes/deposit");
const walletRoutes = require("../src/routes/wallet");
const tournamentsRoutes = require("../src/routes/tournaments");
const profileRoutes = require("../src/routes/profile");
const referralsRoutes = require("../src/routes/referrals");

const app = express();

/*
======================================================
CORS
======================================================
*/

app.use(
    cors({
        origin: true,
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

/*
======================================================
BODY PARSER
======================================================
*/

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

/*
======================================================
ROOT
======================================================
*/

app.get("/", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "GAMERZADDA API is running",
        status: "online"
    });
});

/*
======================================================
API ROOT
======================================================
*/

app.get("/api", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "GAMERZADDA API",
        status: "online"
    });
});

/*
======================================================
HEALTH CHECK
======================================================
*/

app.get("/health", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "GAMERZADDA API healthy",
        status: "online"
    });
});

/*
======================================================
API ROUTES
======================================================
*/

// Authentication
// POST /api/auth/otp
app.use(
    "/api/auth",
    authRoutes
);

// Tournaments
// /api/tournaments/*
app.use(
    "/api/tournaments",
    tournamentsRoutes
);

// Deposit
// /api/deposit/*
app.use(
    "/api/deposit",
    depositRoutes
);

// Wallet
// /api/wallet/*
app.use(
    "/api/wallet",
    walletRoutes
);

// Profile
// GET  /api/profile/:userId
// PATCH /api/profile/:userId
// POST /api/profile/:userId/avatar
app.use(
    "/api/profile",
    profileRoutes
);

// Referrals
// GET /api/referrals/:userId
app.use(
    "/api/referrals",
    referralsRoutes
);

/*
======================================================
404 HANDLER
======================================================
*/

app.use((req, res) => {
    console.log(
        "404 API ROUTE:",
        req.method,
        req.originalUrl
    );

    return res.status(404).json({
        success: false,
        message: "API endpoint not found",
        path: req.originalUrl,
        method: req.method
    });
});

/*
======================================================
GLOBAL ERROR HANDLER
======================================================
*/

app.use((err, req, res, next) => {
    console.error(
        "GLOBAL API ERROR:",
        err
    );

    return res.status(
        err.status || 500
    ).json({
        success: false,
        message:
            err.message ||
            "Internal server error"
    });
});

/*
======================================================
VERCEL EXPORT
======================================================
*/

module.exports = app;