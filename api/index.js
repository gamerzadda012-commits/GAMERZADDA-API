const express = require("express");
const cors = require("cors");

const depositRoutes =
    require("../src/routes/deposit");

const walletRoutes =
    require("../src/routes/wallet");


const app = express();


/*
======================================================
DEPLOYMENT TEST
======================================================
*/
app.get(
    "/TEST-DEPOSIT-123",
    (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "NEW DEPLOYMENT IS WORKING"
        });
    }
);


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
            "Accept",
            "Cookie"
        ]
    })
);


/*
======================================================
BODY PARSER
======================================================
*/
app.use(
    express.json()
);

app.use(
    express.urlencoded({
        extended: true
    })
);


/*
======================================================
HEALTH
======================================================
*/
app.get(
    "/",
    (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "Gamerzadda API is running"
        });
    }
);


app.get(
    "/api/health",
    (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "Gamerzadda API is healthy"
        });
    }
);


/*
======================================================
DEPOSIT API
======================================================
*/

app.use(
    "/api/deposit",
    depositRoutes
);


/*
======================================================
WALLET API
======================================================
*/

app.use(
    "/api/wallet",
    walletRoutes
);


/*
======================================================
DEPOSIT TEST
======================================================
*/

app.get(
    "/api/deposit/test",
    (req, res) => {
        return res.status(200).json({
            success: true,
            message:
                "Deposit API is working"
        });
    }
);


/*
======================================================
404 HANDLER
======================================================
*/

app.use(
    (req, res) => {
        return res.status(404).json({
            success: false,
            error:
                "API endpoint not found",
            path:
                req.originalUrl,
            method:
                req.method
        });
    }
);


/*
======================================================
ERROR HANDLER
======================================================
*/

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            "API ERROR:",
            err
        );

        return res.status(500).json({
            success: false,
            error:
                err?.message ||
                "Internal server error"
        });
    }
);


module.exports = app;