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

const app = express();

const ADMIN_FRONTEND_URL =
    process.env.ADMIN_FRONTEND_URL || "http://localhost:3000";

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

app.use(
    cors({
        origin: ADMIN_FRONTEND_URL,
        credentials: true
    })
);

/*
|--------------------------------------------------------------------------
| BODY PARSERS
|--------------------------------------------------------------------------
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
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/api/health", async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            api: "running",
            database: "connected"
        });
    } catch (error) {
        console.error(
            "HEALTH CHECK ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            api: "running",
            database: "error"
        });
    }
});

/*
|--------------------------------------------------------------------------
| AUTH ROUTES
|--------------------------------------------------------------------------
*/

app.use(
    "/api/auth",
    authRouter
);

/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
*/

app.use(
    "/api/admin",
    adminRouter
);

/*
|--------------------------------------------------------------------------
| TOURNAMENT ROUTES
|--------------------------------------------------------------------------
*/

app.use(
    "/api/tournaments",
    tournamentsRouter
);

/*
|--------------------------------------------------------------------------
| WALLET ROUTES
|--------------------------------------------------------------------------
*/

app.use(
    "/api/wallet",
    walletRouter
);

/*
|--------------------------------------------------------------------------
| DEPOSIT ROUTES
|--------------------------------------------------------------------------
*/

app.use(
    "/api/deposit",
    depositRouter
);

/*
|--------------------------------------------------------------------------
| LEADERBOARD ROUTES
|--------------------------------------------------------------------------
|
| Main Android endpoint:
|
| /api/leaderboard?period=all&game=ALL
|
| Also supports:
|
| /api/leaderboard/leaderboard
|
|--------------------------------------------------------------------------
*/

app.use(
    "/api/leaderboard",
    leaderboardRouter
);

/*
|--------------------------------------------------------------------------
| REFERRAL ROUTES
|--------------------------------------------------------------------------
|
| Android endpoint:
|
| /api/referrals/:userId
|
|--------------------------------------------------------------------------
*/

app.use(
    "/api/referrals",
    referralsRouter
);

/*
|--------------------------------------------------------------------------
| ROOT
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "GAMERZADDA API is running"
    });
});

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
    console.log(
        "404 ROUTE:",
        req.method,
        req.originalUrl
    );

    res.status(404).json({
        success: false,
        error: "Route not found",
        path: req.originalUrl
    });
});

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
    console.error(
        "GLOBAL SERVER ERROR:",
        error
    );

    res.status(500).json({
        success: false,
        error:
            error?.message ||
            "Internal server error"
    });
});

/*
|--------------------------------------------------------------------------
| SERVER
|--------------------------------------------------------------------------
*/

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
