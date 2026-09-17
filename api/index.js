const express = require("express");
const cors = require("cors");

const depositRoutes = require("../routes/deposit");

const app = express();

app.get("/TEST-DEPOSIT-123", (req, res) => {
    res.status(200).json({
        success: true,
        message: "NEW DEPLOYMENT IS WORKING"
    });
});
/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(
    cors({
        origin: true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Accept",
            "Cookie"
        ]
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =====================================================
   HEALTH
===================================================== */

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Gamerzadda API is running"
    });
});

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Gamerzadda API is healthy"
    });
});

/* =====================================================
   DEPOSIT API
===================================================== */

app.use("/api/deposit", depositRoutes);

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
   404
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
   ERROR HANDLER
===================================================== */

app.use((err, req, res, next) => {
    console.error("API ERROR:", err);

    res.status(500).json({
        success: false,
        error: err?.message || "Internal server error"
    });
});

module.exports = app;