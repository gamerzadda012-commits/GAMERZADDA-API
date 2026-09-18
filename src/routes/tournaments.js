const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

// ======================================================
// GET TOURNAMENTS
// ======================================================

router.get("/", async (req, res) => {
    try {
        const game = String(req.query.game || "")
            .trim()
            .toLowerCase();

        const gameMap = {
            freefire: "Free Fire",
            freefiremax: "Free Fire MAX",
            clashsquad: "Clash Squad",
            lonewolf: "Lone Wolf"
        };

        let query = supabase
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
                status
            `)
            .eq("status", "upcoming")
            .order("start_time", {
                ascending: true
            });

        if (game && gameMap[game]) {
            query = query.eq("game", gameMap[game]);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Tournament API error:", error);

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        const tournaments = (data || []).map((item) => ({
            id: String(item.id),
            title: item.title || "",
            game: item.game || "",
            mode: item.mode || "",
            entry_fee: Number(item.entry_fee || 0),
            prize_pool: Number(item.prize_pool || 0),
            kill_reward: Number(item.kill_reward || 0),
            max_players: Number(item.max_players || 0),
            start_time: item.start_time || null,
            map: item.map || null,
            status: item.status || "upcoming"
        }));

        return res.json({
            success: true,
            count: tournaments.length,
            tournaments
        });

    } catch (error) {
        console.error("Tournament API internal error:", error);

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});


// ======================================================
// GET PARTICIPANTS
// IMPORTANT: This must be BEFORE /:id
// ======================================================

router.get("/participants", async (req, res) => {
    try {
        const tournamentId =
            String(req.query.tournamentId || "").trim();

        if (!tournamentId) {
            return res.status(400).json({
                success: false,
                error: "Tournament ID is required"
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
                cancelled,
                users (
                    full_name,
                    level,
                    bio,
                    avatar_url
                )
            `)
            .eq("tournament_id", tournamentId)
            .eq("cancelled", false)
            .order("created_at", {
                ascending: true
            });

        if (error) {
            console.error(
                "Participants API error:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true,
            count: data?.length || 0,
            participants: data || []
        });

    } catch (error) {
        console.error(
            "Participants internal error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});


// ======================================================
// CHECK MY TOURNAMENT ENTRY
// GET /api/tournaments/my-entry?tournamentId=...
// ======================================================

router.get("/my-entry", async (req, res) => {
    try {
        const tournamentId =
            String(req.query.tournamentId || "").trim();

        const userId =
            String(
                req.headers["x-user-id"] ||
                req.query.userId ||
                ""
            ).trim();

        if (!tournamentId) {
            return res.status(400).json({
                success: false,
                error: "Tournament ID is required"
            });
        }

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: "User session not found"
            });
        }

        const {
            data: entry,
            error
        } = await supabase
            .from("tournament_entries")
            .select("id,user_id,tournament_id,cancelled")
            .eq("tournament_id", tournamentId)
            .eq("user_id", userId)
            .eq("cancelled", false)
            .maybeSingle();

        if (error) {
            console.error(
                "My entry error:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true,
            joined: Boolean(entry),
            entryId: entry ? String(entry.id) : null,
            userId,
            entry: entry || null
        });

    } catch (error) {
        console.error(
            "My entry internal error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});


// ======================================================
// JOIN SOLO TOURNAMENT
// POST /api/tournaments/join
// ======================================================

router.post("/join", async (req, res) => {
    try {
        const {
            tournamentId,
            gameName,
            uid,
            level
        } = req.body || {};

        const cleanTournamentId =
            String(tournamentId || "").trim();

        const cleanGameName =
            String(gameName || "").trim();

        const cleanUid =
            String(uid || "").trim();

        const cleanLevel =
            Number(level);

        // ------------------------------------------------
        // USER SESSION
        // ------------------------------------------------

        const userId =
            String(
                req.headers["x-user-id"] ||
                req.body?.userId ||
                ""
            ).trim();

        if (!userId) {
            return res.status(401).json({
                success: false,
                code: "AUTH_REQUIRED",
                error: "User session not found"
            });
        }

        // ------------------------------------------------
        // VALIDATION
        // ------------------------------------------------

        if (!cleanTournamentId) {
            return res.status(400).json({
                success: false,
                error: "Tournament ID is required"
            });
        }

        if (!cleanGameName) {
            return res.status(400).json({
                success: false,
                error: "In-Game Name is required"
            });
        }

        if (cleanGameName.length > 20) {
            return res.status(400).json({
                success: false,
                error: "In-Game Name cannot exceed 20 characters"
            });
        }

        if (!cleanUid) {
            return res.status(400).json({
                success: false,
                error: "UID is required"
            });
        }

        if (!/^\d+$/.test(cleanUid)) {
            return res.status(400).json({
                success: false,
                error: "UID must contain numbers only"
            });
        }

        if (cleanUid.length > 15) {
            return res.status(400).json({
                success: false,
                error: "UID cannot exceed 15 digits"
            });
        }

        if (
            !Number.isInteger(cleanLevel) ||
            cleanLevel < 1 ||
            cleanLevel > 100
        ) {
            return res.status(400).json({
                success: false,
                error: "Level must be between 1 and 100"
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
                game,
                mode,
                entry_fee,
                prize_pool,
                max_players,
                start_time,
                status
            `)
            .eq("id", cleanTournamentId)
            .maybeSingle();

        if (tournamentError) {
            console.error(
                "Join tournament fetch error:",
                tournamentError
            );

            return res.status(500).json({
                success: false,
                error: tournamentError.message
            });
        }

        if (!tournament) {
            return res.status(404).json({
                success: false,
                error: "Tournament not found"
            });
        }

        // ------------------------------------------------
        // STATUS CHECK
        // ------------------------------------------------

        const status =
            String(tournament.status || "")
                .trim()
                .toLowerCase();

        if (
            status !== "upcoming" &&
            status !== "open"
        ) {
            return res.status(400).json({
                success: false,
                error: "Tournament is not open for joining"
            });
        }

        // ------------------------------------------------
        // START TIME CHECK
        // ------------------------------------------------

        if (tournament.start_time) {
            const startTime =
                new Date(tournament.start_time).getTime();

            if (
                Number.isFinite(startTime) &&
                Date.now() >= startTime
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Tournament has already started"
                });
            }
        }

        // ------------------------------------------------
        // ALREADY JOINED CHECK
        // ------------------------------------------------

        const {
            data: existingEntry,
            error: existingError
        } = await supabase
            .from("tournament_entries")
            .select("id,cancelled")
            .eq("tournament_id", cleanTournamentId)
            .eq("user_id", userId)
            .eq("cancelled", false)
            .maybeSingle();

        if (existingError) {
            console.error(
                "Existing entry check error:",
                existingError
            );

            return res.status(500).json({
                success: false,
                error: existingError.message
            });
        }

        if (existingEntry) {
            return res.status(409).json({
                success: false,
                code: "ALREADY_JOINED",
                error: "You have already joined this tournament"
            });
        }

        // ------------------------------------------------
        // PLAYER LIMIT
        // ------------------------------------------------

        const {
            count: joinedCount,
            error: countError
        } = await supabase
            .from("tournament_entries")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq("tournament_id", cleanTournamentId)
            .eq("cancelled", false);

        if (countError) {
            console.error(
                "Tournament count error:",
                countError
            );

            return res.status(500).json({
                success: false,
                error: countError.message
            });
        }

        const maxPlayers =
            Number(tournament.max_players || 0);

        if (
            maxPlayers > 0 &&
            Number(joinedCount || 0) >= maxPlayers
        ) {
            return res.status(409).json({
                success: false,
                code: "TOURNAMENT_FULL",
                error: "Tournament is full"
            });
        }

        // ------------------------------------------------
        // ENTRY FEE
        // ------------------------------------------------

        const entryFee =
            Math.max(
                0,
                Number(tournament.entry_fee || 0)
            );

        // FREE TOURNAMENT
        if (entryFee <= 0) {
            const {
                data: freeEntry,
                error: freeEntryError
            } = await supabase
                .from("tournament_entries")
                .insert({
                    tournament_id: cleanTournamentId,
                    user_id: userId,
                    free_fire_uid: cleanUid,
                    game_name: cleanGameName,
                    level: cleanLevel,
                    cancelled: false
                })
                .select()
                .single();

            if (freeEntryError) {
                console.error(
                    "Free tournament join error:",
                    freeEntryError
                );

                return res.status(500).json({
                    success: false,
                    error: freeEntryError.message
                });
            }

            return res.status(201).json({
                success: true,
                message: "Tournament joined successfully",
                entry: freeEntry,
                entryFee: 0
            });
        }

        // ------------------------------------------------
        // WALLET
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
            .eq("user_id", userId)
            .maybeSingle();

        if (walletError) {
            console.error(
                "Wallet fetch error:",
                walletError
            );

            return res.status(500).json({
                success: false,
                error: walletError.message
            });
        }

        if (!wallet) {
            return res.status(400).json({
                success: false,
                code: "WALLET_NOT_FOUND",
                error: "Wallet not found"
            });
        }

        const depositBalance =
            Math.max(
                0,
                Number(wallet.deposit_balance || 0)
            );

        const bonusBalance =
            Math.max(
                0,
                Number(wallet.bonus_balance || 0)
            );

        const winningBalance =
            Math.max(
                0,
                Number(wallet.winning_balance || 0)
            );

        const totalBalance =
            depositBalance +
            bonusBalance +
            winningBalance;

        if (totalBalance < entryFee) {
            return res.status(402).json({
                success: false,
                code: "INSUFFICIENT_BALANCE",
                error: "Insufficient wallet balance",
                required: entryFee,
                available: totalBalance
            });
        }

        // ------------------------------------------------
        // DEDUCTION ORDER
        // BONUS -> DEPOSIT -> WINNING
        // ------------------------------------------------

        const bonusPercent =
            Math.min(
                100,
                Math.max(
                    0,
                    Number(
                        tournament.bonus_usable_percent || 0
                    )
                )
            );

        const usableBonus =
            bonusBalance *
            (bonusPercent / 100);

        let remaining = entryFee;

        const bonusCut =
            Math.min(
                usableBonus,
                remaining
            );

        remaining -= bonusCut;

        const depositCut =
            Math.min(
                depositBalance,
                remaining
            );

        remaining -= depositCut;

        const winningCut =
            Math.min(
                winningBalance,
                remaining
            );

        remaining -= winningCut;

        if (remaining > 0.000001) {
            return res.status(402).json({
                success: false,
                code: "INSUFFICIENT_BALANCE",
                error: "Insufficient usable wallet balance"
            });
        }

        // ------------------------------------------------
        // UPDATE WALLET
        // ------------------------------------------------

        const newBonusBalance =
            Math.max(
                0,
                bonusBalance - bonusCut
            );

        const newDepositBalance =
            Math.max(
                0,
                depositBalance - depositCut
            );

        const newWinningBalance =
            Math.max(
                0,
                winningBalance - winningCut
            );

        const {
            data: updatedWallet,
            error: updateWalletError
        } = await supabase
            .from("wallets")
            .update({
                bonus_balance: newBonusBalance,
                deposit_balance: newDepositBalance,
                winning_balance: newWinningBalance
            })
            .eq("id", wallet.id)
            .eq("user_id", userId)
            .select()
            .single();

        if (updateWalletError) {
            console.error(
                "Wallet deduction error:",
                updateWalletError
            );

            return res.status(500).json({
                success: false,
                error: updateWalletError.message
            });
        }

        // ------------------------------------------------
        // CREATE ENTRY
        // ------------------------------------------------

        const {
            data: entry,
            error: entryError
        } = await supabase
            .from("tournament_entries")
            .insert({
                tournament_id: cleanTournamentId,
                user_id: userId,
                free_fire_uid: cleanUid,
                game_name: cleanGameName,
                level: cleanLevel,
                cancelled: false
            })
            .select()
            .single();

        // ------------------------------------------------
        // ROLLBACK WALLET IF ENTRY INSERT FAILS
        // ------------------------------------------------

        if (entryError) {
            console.error(
                "Tournament entry insert error:",
                entryError
            );

            await supabase
                .from("wallets")
                .update({
                    bonus_balance: bonusBalance,
                    deposit_balance: depositBalance,
                    winning_balance: winningBalance
                })
                .eq("id", wallet.id)
                .eq("user_id", userId);

            return res.status(500).json({
                success: false,
                error: entryError.message
            });
        }

        // ------------------------------------------------
        // SUCCESS
        // ------------------------------------------------

        const finalBalance =
            newBonusBalance +
            newDepositBalance +
            newWinningBalance;

        return res.status(201).json({
            success: true,
            message: "Tournament joined successfully",
            entry,
            entryFee,
            deduction: {
                bonus: Number(bonusCut.toFixed(2)),
                deposit: Number(depositCut.toFixed(2)),
                winning: Number(winningCut.toFixed(2)),
                total: Number(entryFee.toFixed(2))
            },
            wallet: {
                bonus: Number(newBonusBalance.toFixed(2)),
                deposit: Number(newDepositBalance.toFixed(2)),
                winning: Number(newWinningBalance.toFixed(2)),
                total: Number(finalBalance.toFixed(2))
            }
        });

    } catch (error) {
        console.error(
            "Tournament join internal error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: error?.message ||
                "Internal server error"
        });
    }
});


// ======================================================
// GET SINGLE TOURNAMENT
// ======================================================

router.get("/:id", async (req, res) => {
    try {
        const tournamentId =
            String(req.params.id || "").trim();

        if (!tournamentId) {
            return res.status(400).json({
                success: false,
                error: "Tournament ID is required"
            });
        }

        const {
            data: tournament,
            error: tournamentError
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
                rules,
                status
            `)
            .eq("id", tournamentId)
            .single();

        if (tournamentError || !tournament) {
            return res.status(404).json({
                success: false,
                error: "Tournament not found"
            });
        }

        const {
            data: entries,
            error: entriesError
        } = await supabase
            .from("tournament_entries")
            .select("id")
            .eq("tournament_id", tournamentId)
            .eq("cancelled", false);

        if (entriesError) {
            console.error(
                "Participants error:",
                entriesError
            );
        }

        return res.json({
            success: true,
            tournament: {
                id: String(tournament.id),
                title: tournament.title || "",
                game: tournament.game || "",
                mode: tournament.mode || "",
                entry_fee: Number(
                    tournament.entry_fee || 0
                ),
                prize_pool: Number(
                    tournament.prize_pool || 0
                ),
                kill_reward: Number(
                    tournament.kill_reward || 0
                ),
                max_players: Number(
                    tournament.max_players || 0
                ),
                joined_count:
                    entries?.length || 0,
                start_time:
                    tournament.start_time || null,
                map:
                    tournament.map || null,
                rules:
                    tournament.rules || null,
                status:
                    tournament.status || ""
            }
        });

    } catch (error) {
        console.error(
            "Tournament details error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

module.exports = router;