const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");

/*
======================================================
GET MY STATS
======================================================

GET /api/stats/:userId

This version matches the current GAMERZADDA auth system.
The current auth API returns userId after login rather than
creating a gamerzadda_session cookie.
======================================================
*/

router.get("/stats/:userId", async (req, res) => {
    try {
        const userId = String(req.params.userId || "").trim();

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required."
            });
        }

        /*
        ==================================================
        VERIFY USER
        ==================================================
        */

        const {
            data: user,
            error: userError
        } = await supabase
            .from("users")
            .select("id, status")
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            console.error(
                "STATS USER ERROR:",
                userError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to verify user."
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found."
            });
        }

        if (
            user.status &&
            String(user.status).toLowerCase() !== "active"
        ) {
            return res.status(403).json({
                success: false,
                error: "Your account is currently disabled."
            });
        }

        /*
        ==================================================
        TOURNAMENT ENTRIES
        ==================================================
        */

        const {
            data: entries,
            error: entriesError
        } = await supabase
            .from("tournament_entries")
            .select("id, tournament_id, cancelled")
            .eq("user_id", userId)
            .eq("cancelled", false);

        if (entriesError) {
            console.error(
                "STATS ENTRIES ERROR:",
                entriesError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to load tournament history."
            });
        }

        const tournamentIds = [
            ...new Set(
                (entries || [])
                    .map(row => row.tournament_id)
                    .filter(Boolean)
            )
        ];

        /*
        ==================================================
        TOURNAMENT INFORMATION
        ==================================================
        */

        let tournaments = [];

        if (tournamentIds.length > 0) {
            const {
                data,
                error
            } = await supabase
                .from("tournaments")
                .select(
                    "id, title, game, mode"
                )
                .in("id", tournamentIds);

            if (error) {
                console.error(
                    "STATS TOURNAMENT ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: "Unable to load tournament information."
                });
            }

            tournaments = data || [];
        }

        const tournamentMap = new Map();

        tournaments.forEach(tournament => {
            tournamentMap.set(
                String(tournament.id),
                tournament
            );
        });

        /*
        ==================================================
        RESULTS
        ==================================================
        */

        const {
            data: results,
            error: resultsError
        } = await supabase
            .from("tournament_results")
            .select(
                [
                    "id",
                    "tournament_id",
                    "rank",
                    "kills",
                    "winning_amount",
                    "match_id",
                    "created_at",
                    "updated_at"
                ].join(", ")
            )
            .eq("user_id", userId);

        if (resultsError) {
            console.error(
                "STATS RESULTS ERROR:",
                resultsError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to load tournament results."
            });
        }

        const resultRows = results || [];

        /*
        ==================================================
        BASIC STATS
        ==================================================
        */

        const totalGames = (entries || []).length;

        const completedGames =
            resultRows.length;

        let wins = 0;
        let podiumFinishes = 0;
        let totalKills = 0;
        let totalWinnings = 0;

        let bestKills = 0;
        let bestRank = null;
        let bestTournamentTitle = null;

        resultRows.forEach(result => {

            const rank =
                Number(result.rank || 0);

            const kills =
                Number(result.kills || 0);

            const winnings =
                Number(result.winning_amount || 0);

            totalKills += kills;
            totalWinnings += winnings;

            if (rank === 1) {
                wins++;
            }

            if (
                rank >= 1 &&
                rank <= 3
            ) {
                podiumFinishes++;
            }

            if (kills > bestKills) {
                bestKills = kills;
            }

            /*
            Best result:
            1. Higher kills
            2. Better rank
            */

            const shouldReplace =
                bestRank === null ||
                kills > bestKills ||
                (
                    kills === bestKills &&
                    rank > 0 &&
                    rank < bestRank
                );

            if (shouldReplace) {
                bestRank =
                    rank > 0 ? rank : bestRank;

                const tournament =
                    tournamentMap.get(
                        String(result.tournament_id)
                    );

                bestTournamentTitle =
                    tournament?.title || null;
            }
        });

        /*
        ==================================================
        WIN RATE
        ==================================================
        */

        const winRate =
            completedGames > 0
                ? Number(
                    (
                        (wins / completedGames) *
                        100
                    ).toFixed(1)
                )
                : 0;

        /*
        ==================================================
        GAME CATEGORIES
        ==================================================
        */

        const categories = {
            freeFire: 0,
            freeFireMax: 0,
            clashSquad: 0,
            loneWolf: 0,
            other: 0
        };

        (entries || []).forEach(entry => {

            const tournament =
                tournamentMap.get(
                    String(entry.tournament_id)
                );

            if (!tournament) {
                categories.other++;
                return;
            }

            const game =
                String(
                    tournament.game || ""
                ).toLowerCase();

            const mode =
                String(
                    tournament.mode || ""
                ).toLowerCase();

            const combined =
                `${game} ${mode}`;

            if (
                combined.includes("free fire max") ||
                combined.includes("freefire max") ||
                combined.includes("ff max")
            ) {
                categories.freeFireMax++;
            } else if (
                combined.includes("clash squad") ||
                combined.includes("clashsquad")
            ) {
                categories.clashSquad++;
            } else if (
                combined.includes("lone wolf") ||
                combined.includes("lonewolf")
            ) {
                categories.loneWolf++;
            } else if (
                combined.includes("free fire") ||
                combined.includes("freefire")
            ) {
                categories.freeFire++;
            } else {
                categories.other++;
            }
        });

        /*
        ==================================================
        WITHDRAWALS
        ==================================================
        */

        const {
            data: withdrawals,
            error: withdrawalsError
        } = await supabase
            .from("withdraw_requests")
            .select(
                "id, amount, net_amount, status"
            )
            .eq("user_id", userId)
            .eq("status", "approved");

        if (withdrawalsError) {
            console.error(
                "STATS WITHDRAW ERROR:",
                withdrawalsError
            );

            return res.status(500).json({
                success: false,
                error: "Unable to load withdrawal history."
            });
        }

        const withdrawalRows =
            withdrawals || [];

        const totalWithdrawn =
            withdrawalRows.reduce(
                (sum, row) =>
                    sum +
                    Number(
                        row.net_amount ??
                        row.amount ??
                        0
                    ),
                0
            );

        /*
        ==================================================
        RESPONSE
        ==================================================
        */

        return res.status(200).json({
            success: true,

            stats: {
                totalGames,
                completedGames,
                wins,
                podiumFinishes,
                totalKills,

                totalWinnings:
                    Number(
                        totalWinnings.toFixed(2)
                    ),

                winRate,

                totalWithdrawn:
                    Number(
                        totalWithdrawn.toFixed(2)
                    ),

                withdrawalCount:
                    withdrawalRows.length,

                bestKills,

                bestRank,

                bestTournamentTitle,

                categories
            }
        });

    } catch (error) {

        console.error(
            "STATS API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                "Internal server error."
        });
    }
});

module.exports = router;