const express = require("express");
const cors = require("cors");

const authRoutes = require("../src/routes/auth");
const depositRoutes = require("../src/routes/deposit");
const walletRoutes = require("../src/routes/wallet");
const tournamentsRoutes = require("../src/routes/tournaments");
const profileRoutes = require("../src/routes/profile");
const referralsRoutes = require("../src/routes/referrals");
const statsRoutes = require("../src/routes/stats");
const leaderboardRoutes = require("../src/routes/leaderboard");
const scratchCardRoutes = require("../src/routes/scratchCard");
const spinRoutes = require("../src/routes/spin");

const app = express();

/* =========================================================
   CORS
========================================================= */

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

/* =========================================================
   BODY PARSER
========================================================= */

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

/* =========================================================
   BASIC HEALTH ROUTES
========================================================= */

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "GAMERZADDA API is running",
    status: "online"
  });
});

app.get("/api", (req, res) => {
  res.status(200).json({
    success: true,
    message: "GAMERZADDA API",
    status: "online"
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "GAMERZADDA API healthy",
    status: "online"
  });
});

/* =========================================================
   AUTH
========================================================= */

app.use("/api/auth", authRoutes);

/* =========================================================
   TOURNAMENTS
========================================================= */

app.use("/api/tournaments", tournamentsRoutes);

/* =========================================================
   DEPOSIT / PAYMENT
========================================================= */

app.use("/api/deposit", depositRoutes);

/* =========================================================
   WALLET
========================================================= */

app.use("/api/wallet", walletRoutes);

/* =========================================================
   PROFILE
========================================================= */

app.use("/api/profile", profileRoutes);

/* =========================================================
   REFERRALS
========================================================= */

app.use("/api/referrals", referralsRoutes);

/* =========================================================
   USER STATS
========================================================= */

app.use("/api", statsRoutes);

/* =========================================================
   LEADERBOARD
========================================================= */

app.use("/api", leaderboardRoutes);

/* =========================================================
   SCRATCH CARD
========================================================= */

app.use("/api", scratchCardRoutes);

/* =========================================================
   LUCKY SPIN
   GET  /api/spin/:userId
   POST /api/spin/:userId
========================================================= */

app.use("/api", spinRoutes);

/* =========================================================
   404
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
    path: req.originalUrl,
    method: req.method
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error("GLOBAL API ERROR:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error"
  });
});

/* =========================================================
   EXPORT
========================================================= */

module.exports = app;