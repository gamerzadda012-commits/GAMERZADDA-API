const express = require("express");

const router = express.Router();

const supabase = require("../config/supabase");

// ============================================================
// HELPERS
// ============================================================

function getUserId(req) {
    const headerUserId =
        req.headers["x-user-id"];

    const bodyUserId =
        req.body?.userId;

    const queryUserId =
        req.query?.userId;

    return String(
        headerUserId ||
        bodyUserId ||
        queryUserId ||
        ""
    ).trim();
}

function cleanNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

// ============================================================
// GET ALL TOURNAMENTS
// GET /api/tournaments?game=FREE FIRE
// ============================================================

router.get("/", async (req, res) => {

    try {

        const game =
            String(
                req.query.game || ""
            ).trim();

        let query =
            supabase
                .from("tournaments")
                .select(`
                    id,
                    title,
                    game,
                    mode,
                    entry_fee,
                    prize_pool,
                    kill_reward,
                    max_players,
                    start_time,
                    map,
                    status,
                    rules,
                    bonus_usable_percent
                `)
                .order(
                    "start_time",
                    {
                        ascending: true
                    }
                );

        if (game) {
            query = query.eq(
                "game",
                game
            );
        }

        const {
            data: tournaments,
            error
        } = await query;

        if (error) {

            console.error(
                "GET TOURNAMENTS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        const list =
            tournaments || [];

        const result = [];

        for (
            const tournament of list
        ) {

            const {
                count,
                error: countError
            } = await supabase
                .from("tournament_entries")
                .select(
                    "id",
                    {
                        count: "exact",
                        head: true
                    }
                )
                .eq(
                    "tournament_id",
                    tournament.id
                )
                .eq(
                    "cancelled",
                    false
                );

            if (countError) {

                console.error(
                    "COUNT ERROR:",
                    countError
                );
            }

            result.push({
                ...tournament,
                joined_count:
                    count || 0
            });
        }

        return res.status(200).json({
            success: true,
            tournaments: result
        });

    } catch (error) {

        console.error(
            "GET TOURNAMENTS EXCEPTION:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Internal server error"
        });
    }
});

// ============================================================
// GET PARTICIPANTS
// GET /api/tournaments/participants?tournamentId=...
// ============================================================

router.get(
    "/participants",
    async (req, res) => {

        try {

            const tournamentId =
                String(
                    req.query.tournamentId ||
                    ""
                ).trim();

            if (!tournamentId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Tournament ID is required"
                });
            }

            const {
                data,
                error
            } = await supabase
                .from("tournament_entries")
                .select(`
                    id,
                    user_id,
                    free_fire_uid,
                    game_name,
                    level,
                    cancelled,
                    created_at
                `)
                .eq(
                    "tournament_id",
                    tournamentId
                )
                .eq(
                    "cancelled",
                    false
                )
                .order(
                    "created_at",
                    {
                        ascending: true
                    }
                );

            if (error) {

                console.error(
                    "PARTICIPANTS ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            return res.status(200).json({
                success: true,
                participants:
                    data || []
            });

        } catch (error) {

            console.error(
                "PARTICIPANTS EXCEPTION:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Internal server error"
            });
        }
    }
);

// ============================================================
// GET MY ENTRY
// GET /api/tournaments/my-entry?tournamentId=...
// ============================================================

router.get(
    "/my-entry",
    async (req, res) => {

        try {

            const userId =
                getUserId(req);

            const tournamentId =
                String(
                    req.query.tournamentId ||
                    ""
                ).trim();

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    error:
                        "User session not found."
                });
            }

            if (!tournamentId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Tournament ID is required."
                });
            }

            const {
                data,
                error
            } = await supabase
                .from("tournament_entries")
                .select(`
                    id,
                    tournament_id,
                    user_id,
                    free_fire_uid,
                    game_name,
                    level,
                    cancelled,
                    created_at
                `)
                .eq(
                    "tournament_id",
                    tournamentId
                )
                .eq(
                    "user_id",
                    userId
                )
                .eq(
                    "cancelled",
                    false
                )
                .maybeSingle();

            if (error) {

                console.error(
                    "MY ENTRY ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            return res.status(200).json({
                success: true,
                entry: data || null,
                joined: !!data
            });

        } catch (error) {

            console.error(
                "MY ENTRY EXCEPTION:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Internal server error"
            });
        }
    }
);

// ============================================================
// JOIN TOURNAMENT
// POST /api/tournaments/join
// ============================================================

router.post(
    "/join",
    async (req, res) => {

        try {

            const userId =
                getUserId(req);

            const {
                tournamentId,
                gameName,
                uid,
                level
            } = req.body || {};

            const cleanTournamentId =
                String(
                    tournamentId || ""
                ).trim();

            const cleanGameName =
                String(
                    gameName || ""
                ).trim();

            const cleanUid =
                String(
                    uid || ""
                ).trim();

            const cleanLevel =
                Number(level);

            // ------------------------------------------------
            // AUTH
            // ------------------------------------------------

            if (!userId) {

                return res.status(401).json({
                    success: false,
                    code: "AUTH_REQUIRED",
                    error:
                        "User session not found. Please login again."
                });
            }

            // ------------------------------------------------
            // VALIDATION
            // ------------------------------------------------

            if (!cleanTournamentId) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Tournament ID is required."
                });
            }

            if (!cleanGameName) {

                return res.status(400).json({
                    success: false,
                    error:
                        "In-Game Name is required."
                });
            }

            if (!cleanUid) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Free Fire UID is required."
                });
            }

            if (
                !Number.isInteger(cleanLevel) ||
                cleanLevel < 1 ||
                cleanLevel > 100
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Level must be between 1 and 100."
                });
            }

            // ------------------------------------------------
            // GET TOURNAMENT
            // ------------------------------------------------

            const {
                data: tournament,
                error: tournamentError
            } = await supabase
                .from("tournaments")
                .select(`
                    id,
                    title,
                    mode,
                    status,
                    entry_fee,
                    max_players,
                    bonus_usable_percent
                `)
                .eq(
                    "id",
                    cleanTournamentId
                )
                .maybeSingle();

            if (tournamentError) {

                console.error(
                    "TOURNAMENT FETCH ERROR:",
                    tournamentError
                );

                return res.status(500).json({
                    success: false,
                    error:
                        tournamentError.message
                });
            }

            if (!tournament) {

                return res.status(404).json({
                    success: false,
                    code:
                        "TOURNAMENT_NOT_FOUND",
                    error:
                        "Tournament not found."
                });
            }

            // ------------------------------------------------
            // STATUS CHECK
            // ------------------------------------------------

            const status =
                String(
                    tournament.status || ""
                ).toLowerCase();

            if (
                status &&
                ![
                    "upcoming",
                    "open",
                    "active",
                    "live"
                ].includes(status)
            ) {

                return res.status(400).json({
                    success: false,
                    code:
                        "TOURNAMENT_CLOSED",
                    error:
                        "This tournament is not open for joining."
                });
            }

            // ------------------------------------------------
            // ENTRY FEE
            // ------------------------------------------------

            const entryFee =
                cleanNumber(
                    tournament.entry_fee,
                    0
                );

            // ------------------------------------------------
            // MAX PLAYERS
            // ------------------------------------------------

            if (
                tournament.max_players
            ) {

                const {
                    count,
                    error: countError
                } = await supabase
                    .from("tournament_entries")
                    .select(
                        "id",
                        {
                            count: "exact",
                            head: true
                        }
                    )
                    .eq(
                        "tournament_id",
                        cleanTournamentId
                    )
                    .eq(
                        "cancelled",
                        false
                    );

                if (countError) {

                    console.error(
                        "PLAYER COUNT ERROR:",
                        countError
                    );

                    return res.status(500).json({
                        success: false,
                        error:
                            countError.message
                    });
                }

                if (
                    (count || 0) >=
                    Number(
                        tournament.max_players
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        code:
                            "TOURNAMENT_FULL",
                        error:
                            "Tournament is full."
                    });
                }
            }

            // ------------------------------------------------
            // DUPLICATE JOIN CHECK
            // ------------------------------------------------

            const {
                data: existingEntry,
                error: existingError
            } = await supabase
                .from("tournament_entries")
                .select("id")
                .eq(
                    "tournament_id",
                    cleanTournamentId
                )
                .eq(
                    "user_id",
                    userId
                )
                .eq(
                    "cancelled",
                    false
                )
                .maybeSingle();

            if (existingError) {

                console.error(
                    "DUPLICATE CHECK ERROR:",
                    existingError
                );

                return res.status(500).json({
                    success: false,
                    error:
                        existingError.message
                });
            }

            if (existingEntry) {

                return res.status(409).json({
                    success: false,
                    code:
                        "ALREADY_JOINED",
                    error:
                        "You have already joined this tournament."
                });
            }

            // ------------------------------------------------
            // GET WALLET
            // ------------------------------------------------

            const {
                data: wallet,
                error: walletError
            } = await supabase
                .from("wallets")
                .select(`
                    id,
                    user_id,
                    deposit_balance,
                    bonus_balance,
                    winning_balance
                `)
                .eq(
                    "user_id",
                    userId
                )
                .maybeSingle();

            if (walletError) {

                console.error(
                    "WALLET FETCH ERROR:",
                    walletError
                );

                return res.status(500).json({
                    success: false,
                    error:
                        walletError.message
                });
            }

            if (!wallet) {

                return res.status(400).json({
                    success: false,
                    code:
                        "WALLET_NOT_FOUND",
                    error:
                        "Wallet not found."
                });
            }

            // ------------------------------------------------
            // WALLET VALUES
            // ------------------------------------------------

            let deposit =
                cleanNumber(
                    wallet.deposit_balance
                );

            let bonus =
                cleanNumber(
                    wallet.bonus_balance
                );

            let winning =
                cleanNumber(
                    wallet.winning_balance
                );

            const total =
                deposit +
                bonus +
                winning;

            if (
                total < entryFee
            ) {

                return res.status(402).json({
                    success: false,
                    code:
                        "INSUFFICIENT_BALANCE",
                    error:
                        "Insufficient wallet balance."
                });
            }

            // ------------------------------------------------
            // BONUS LIMIT
            // ------------------------------------------------

            let bonusPercent =
                cleanNumber(
                    tournament.bonus_usable_percent,
                    0
                );

            bonusPercent =
                Math.max(
                    0,
                    Math.min(
                        100,
                        bonusPercent
                    )
                );

            const maxBonusUsable =
                entryFee *
                (bonusPercent / 100);

            // ------------------------------------------------
            // DEDUCTION
            //
            // BONUS → DEPOSIT → WINNING
            // ------------------------------------------------

            let remaining =
                entryFee;

            let bonusDeduction =
                Math.min(
                    bonus,
                    maxBonusUsable,
                    remaining
                );

            remaining -=
                bonusDeduction;

            let depositDeduction =
                Math.min(
                    deposit,
                    remaining
                );

            remaining -=
                depositDeduction;

            let winningDeduction =
                Math.min(
                    winning,
                    remaining
                );

            remaining -=
                winningDeduction;

            if (
                remaining > 0.0001
            ) {

                return res.status(402).json({
                    success: false,
                    code:
                        "INSUFFICIENT_BALANCE",
                    error:
                        "Insufficient usable wallet balance."
                });
            }

            const newDeposit =
                Number(
                    (
                        deposit -
                        depositDeduction
                    ).toFixed(2)
                );

            const newBonus =
                Number(
                    (
                        bonus -
                        bonusDeduction
                    ).toFixed(2)
                );

            const newWinning =
                Number(
                    (
                        winning -
                        winningDeduction
                    ).toFixed(2)
                );

            // ------------------------------------------------
            // UPDATE WALLET
            // ------------------------------------------------

            const {
                error: updateWalletError
            } = await supabase
                .from("wallets")
                .update({
                    deposit_balance:
                        newDeposit,

                    bonus_balance:
                        newBonus,

                    winning_balance:
                        newWinning,

                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "user_id",
                    userId
                );

            if (updateWalletError) {

                console.error(
                    "WALLET UPDATE ERROR:",
                    updateWalletError
                );

                return res.status(500).json({
                    success: false,
                    error:
                        updateWalletError.message
                });
            }

            // ------------------------------------------------
            // CREATE TOURNAMENT ENTRY
            // ------------------------------------------------

            const {
                data: entry,
                error: entryError
            } = await supabase
                .from("tournament_entries")
                .insert({
                    tournament_id:
                        cleanTournamentId,

                    user_id:
                        userId,

                    free_fire_uid:
                        cleanUid,

                    game_name:
                        cleanGameName,

                    level:
                        cleanLevel,

                    cancelled:
                        false
                })
                .select(`
                    id,
                    tournament_id,
                    user_id,
                    free_fire_uid,
                    game_name,
                    level,
                    cancelled,
                    created_at
                `)
                .single();

            // ------------------------------------------------
            // ROLLBACK WALLET IF ENTRY FAILED
            // ------------------------------------------------

            if (entryError) {

                console.error(
                    "TOURNAMENT ENTRY ERROR:",
                    entryError
                );

                await supabase
                    .from("wallets")
                    .update({
                        deposit_balance:
                            deposit,

                        bonus_balance:
                            bonus,

                        winning_balance:
                            winning,

                        updated_at:
                            new Date().toISOString()
                    })
                    .eq(
                        "user_id",
                        userId
                    );

                return res.status(500).json({
                    success: false,
                    code:
                        "JOIN_FAILED",
                    error:
                        entryError.message ||
                        "Unable to join tournament."
                });
            }

            // ------------------------------------------------
            // SUCCESS
            // ------------------------------------------------

            const remainingBalance =
                Number(
                    (
                        newDeposit +
                        newBonus +
                        newWinning
                    ).toFixed(2)
                );

            return res.status(200).json({

                success: true,

                code:
                    "TOURNAMENT_JOINED",

                message:
                    "Tournament joined successfully!",

                entryId:
                    entry?.id || null,

                tournamentId:
                    cleanTournamentId,

                wallet: {
                    depositBalance:
                        newDeposit,

                    bonusBalance:
                        newBonus,

                    winningBalance:
                        newWinning,

                    totalBalance:
                        remainingBalance
                },

                deduction: {
                    entryFee:
                        entryFee,

                    bonus:
                        Number(
                            bonusDeduction.toFixed(2)
                        ),

                    deposit:
                        Number(
                            depositDeduction.toFixed(2)
                        ),

                    winning:
                        Number(
                            winningDeduction.toFixed(2)
                        )
                }
            });

        } catch (error) {

            console.error(
                "JOIN TOURNAMENT EXCEPTION:",
                error
            );

            return res.status(500).json({
                success: false,
                code:
                    "SERVER_ERROR",
                error:
                    error?.message ||
                    "Internal server error."
            });
        }
    }
);

// ============================================================
// GET SINGLE TOURNAMENT
// IMPORTANT: KEEP THIS AFTER /participants AND /my-entry
// ============================================================

router.get(
    "/:id",
    async (req, res) => {

        try {

            const id =
                String(
                    req.params.id || ""
                ).trim();

            if (!id) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Tournament ID is required."
                });
            }

            const {
                data: tournament,
                error
            } = await supabase
                .from("tournaments")
                .select(`
                    id,
                    title,
                    game,
                    mode,
                    entry_fee,
                    prize_pool,
                    kill_reward,
                    max_players,
                    start_time,
                    map,
                    status,
                    rules,
                    bonus_usable_percent
                `)
                .eq(
                    "id",
                    id
                )
                .maybeSingle();

            if (error) {

                console.error(
                    "GET TOURNAMENT ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        error.message
                });
            }

            if (!tournament) {

                return res.status(404).json({
                    success: false,
                    error:
                        "Tournament not found."
                });
            }

            const {
                count,
                error: countError
            } = await supabase
                .from("tournament_entries")
                .select(
                    "id",
                    {
                        count: "exact",
                        head: true
                    }
                )
                .eq(
                    "tournament_id",
                    id
                )
                .eq(
                    "cancelled",
                    false
                );

            if (countError) {

                console.error(
                    "SINGLE TOURNAMENT COUNT ERROR:",
                    countError
                );
            }

            return res.status(200).json({

                success: true,

                tournament: {
                    ...tournament,

                    joined_count:
                        count || 0
                }
            });

        } catch (error) {

            console.error(
                "GET SINGLE TOURNAMENT EXCEPTION:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Internal server error"
            });
        }
    }
);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;