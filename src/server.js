require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const tournamentsRouter = require("./routes/tournaments");
const walletRouter = require("./routes/wallet");
const depositRouter = require("./routes/deposit");
const leaderboardRouter = require("./routes/leaderboard");
const referralsRouter = require("./routes/referrals");
const statsRouter = require("./routes/stats");

const app = express();

const ADMIN_FRONTEND_URL =
    process.env.ADMIN_FRONTEND_URL || "http://localhost:3000";

app.use(
    cors({
        origin: ADMIN_FRONTEND_URL,
        credentials: true
    })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/api/health", async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            api: "running",
            database: "connected"
        });
    } catch (error) {
        console.error("HEALTH CHECK ERROR:", error);
        res.status(500).json({
            success: false,
            api: "running",
            database: "error"
        });
    }
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/tournaments", tournamentsRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/deposit", depositRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/referrals", referralsRouter);
app.use("/api", statsRouter);

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "GAMERZADDA API is running"
    });
});

app.use((req, res) => {
    console.log("404 ROUTE:", req.method, req.originalUrl);
    res.status(404).json({
        success: false,
        error: "Route not found",
        path: req.originalUrl
    });
});

app.use((error, req, res, next) => {
    console.error("GLOBAL SERVER ERROR:", error);
    res.status(500).json({
        success: false,
        error: error?.message || "Internal server error"
    });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`GAMERZADDA API running on port ${PORT}`);
    });
}

module.exports = app;
