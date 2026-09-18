const express = require("express");
const cors = require("cors");

const authRoutes = require("../src/routes/auth");
const depositRoutes = require("../src/routes/deposit");
const walletRoutes = require("../src/routes/wallet");
const tournamentsRoutes = require("../src/routes/tournaments");
const profileRoutes = require("../src/routes/profile");

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
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With"
        ]
    })
);

/*
======================================================
BODY PARSERS
======================================================
*/

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/*
======================================================
HEALTH CHECK
======================================================
*/

app.get("/", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "GAMERZADDA API is running",
        status: "online"
    });
});

app.get("/api", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "GAMERZADDA API",
        status: "online"
    });
});

app.get("/health", (req, res) => {
    return res.status(200).json({
        success: true,
        status: "healthy"
    });
});

/*
======================================================
API ROUTES
======================================================
*/

// Authentication
app.use("/api/auth", authRoutes);

// Tournaments
app.use("/api/tournaments", tournamentsRoutes);

// Deposits
app.use("/api/deposit", depositRoutes);

// Wallet
app.use("/api/wallet", walletRoutes);

// Profile
app.use("/api/profile", profileRoutes);

/*
======================================================
404 HANDLER
======================================================
*/

app.use((req, res) => {
    console.log("404 API ROUTE:", req.method, req.originalUrl);

    return res.status(404).json({
        success: false,
        message: "API endpoint not found",
        path: req.originalUrl,
        method: req.method
    });
});

/*
======================================================
ERROR HANDLER
======================================================
*/

app.use((err, req, res, next) => {
    console.error("API ERROR:", err);

    return res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal server error"
    });
});

/*
======================================================
VERCEL EXPORT
======================================================
*/

module.exports = app;