const express = require("express");
const cors = require("cors");

const authRouter = require("../src/routes/auth");
const tournamentsRouter = require("../src/routes/tournaments");
const walletRouter = require("../src/routes/wallet");
const depositRoutes = require("../src/routes/deposit");

const app = express();

/* =====================================================
   MIDDLEWARE
===================================================== */

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
            "Accept",
            "Cookie"
        ]
    })
);

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

/* =====================================================
   ROOT
===================================================== */

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Gamerzadda API is running"
    });
});

/* =====================================================
   HEALTH
===================================================== */

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Gamerzadda API is healthy"
    });
});

/* =====================================================
   AUTH API
===================================================== */

app.use(
    "/api/auth",
    authRouter
);

/* =====================================================
   TOURNAMENT API
===================================================== */

app.use(
    "/api/tournaments",
    tournamentsRouter
);

/* =====================================================
   WALLET API
===================================================== */

app.use(
    "/api/wallet",
    walletRouter
);

/* =====================================================
   DEPOSIT / ADD MONEY API
===================================================== */

app.use(
    "/api/deposit",
    depositRoutes
);

/* =====================================================
   DEPOSIT TEST
===================================================== */

app.get("/api/deposit/test", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Deposit API is working"
    });
});

/* =====================================================
   WALLET TEST
===================================================== */

app.get("/api/wallet/test", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Wallet API is working"
    });
});

/* =====================================================
   404 HANDLER
===================================================== */

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "API endpoint not found",
        path: req.originalUrl,
        method: req.method
    });
});

/* =====================================================
   GLOBAL ERROR HANDLER
===================================================== */

app.use((err, req, res, next) => {
    console.error("API ERROR:", err);

    res.status(500).json({
        success: false,
        error:
            err?.message ||
            "Internal server error"
    });
});

/* =====================================================
   EXPORT
===================================================== */

module.exports = app;