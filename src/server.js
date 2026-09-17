const express = require("express");
const cors = require("cors");
require("dotenv").config();

const supabase = require("./config/supabase");

const authRouter = require("./routes/auth");
const tournamentsRouter = require("./routes/tournaments");
const walletRouter = require("./routes/wallet");

const app = express();

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ======================================================
// ROOT
// ======================================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "GAMERZADDA API is running",
        version: "1.0.0"
    });
});

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", async (req, res) => {
    try {

        const { error } = await supabase
            .from("tournaments")
            .select("id")
            .limit(1);

        if (error) {

            console.error(
                "Supabase health error:",
                error
            );

            return res.status(500).json({
                success: false,
                api: "running",
                database: "disconnected",
                error: error.message
            });
        }

        return res.json({
            success: true,
            api: "running",
            database: "connected"
        });

    } catch (error) {

        console.error(
            "Health check error:",
            error
        );

        return res.status(500).json({
            success: false,
            api: "running",
            database: "disconnected",
            error: error.message
        });
    }
});

// ======================================================
// API ROUTES
// ======================================================

// Authentication / OTP
app.use("/api/auth", authRouter);

// Tournaments
app.use("/api/tournaments", tournamentsRouter);

// Wallet
app.use("/api/wallet", walletRouter);

// ======================================================
// 404 HANDLER
// ======================================================

app.use((req, res) => {

    res.status(404).json({
        success: false,
        error: "API endpoint not found",
        path: req.originalUrl
    });
});

// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use((error, req, res, next) => {

    console.error(
        "GLOBAL API ERROR:",
        error
    );

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Internal server error"
    });
});

// ======================================================
// EXPORT FOR VERCEL
// ======================================================

module.exports = app;

// ======================================================
// LOCAL SERVER
// ======================================================

if (require.main === module) {

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {

        console.log(
            `GAMERZADDA API running on port ${PORT}`
        );

        console.log(
            `Health: http://localhost:${PORT}/api/health`
        );

    });
}