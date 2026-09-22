const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

function getPeriodStart(period) {
    const now = new Date();

    if (period === "weekly") {
        const date = new Date(now);
        const day = date.getDay();
        const diff = day === 0 ? -6 : 1 - day;

        date.setDate(date.getDate() + diff);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    if (period === "monthly") {
        const date = new Date(now);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    return null;
}

function normalizeGame(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .replace(/\s+/g, " ");
}

function matchesGame(gameValue, filter) {
    const game = normalizeGame(gameValue);
    const wanted = normalizeGame(filter);

    if (!wanted || wanted === "all") {
        return true;
    }

    if (wanted === "free fire max") {
        return (
            game.includes("free fire max") ||
            game.includes("freefire max") ||
            game.includes("ff max")
        );
    }

    if (wanted === "free fire") {
        return (
            game === "free fire" ||
            game === "freefire" ||
            game.includes("free fire") && !game.includes("max")
        );
    }

    if (wanted === "clash squad") {
        return game.includes("clash squad") || game.includes("clashsquad");
    }

    if (wanted === "lone wolf") {
        return game.includes("lone wolf") || game.includes("lonewolf");
    }

    return game === wanted;
}

router.get("/leaderboard", async (req, res) => {
    try {
        const period = String(
            req.query.period || "all"
        ).trim().toLowerCase();

        const game = String(
            req.query.game || "ALL"
        ).trim();

        if (!["all", "weekly", "monthly"].includes(period)) {
            return res.status(400).json({
                success: false,
                error: "Invalid period. Use all, weekly or monthly."
            });
        }

        const periodStart = getPeriodStart(period);

        let resultsQuery = supabaseAdmin
            .from("tournament_results")
            .select(
                "tournament_id,user_id,winning_amount,updated_at,created_at"
            )
            .gt("winning_amount", 0)
            .order("updated_at", {
                ascending: false,
                nullsFirst: false
            });

        if (periodStart) {
            resultsQuery = resultsQuery.gte(
                "updated_at",
                periodStart.toISOString()
            );
        }

        const {
            data: resultRows,
            error: resultsError
        } = await resultsQuery.range(0, 9999);

        if (resultsError) {
            console.error(
                "LEADERBOARD RESULTS ERROR:",
                resultsError
            );

            return res.status(500).json({
                success: false,
                error: resultsError.message
            });
        }

        const safeResults = resultRows || [];

        if (safeResults.length === 0) {
            return res.status(200).json({
                success: true,
                period,
                game,
                totalPlayers: 0,
                players: []
            });
        }

        const tournamentIds = [
            ...new Set(
                safeResults
                    .map((row) => String(row.tournament_id || "").trim())
                    .filter(Boolean)
            )
        ];

        let tournaments = [];

        if (tournamentIds.length > 0) {
            const {
                data,
                error
            } = await supabaseAdmin
                .from("tournaments")
                .select("id,game,mode,title")
                .in("id", tournamentIds);

            if (error) {
                console.error(
                    "LEADERBOARD TOURNAMENT ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            tournaments = data || [];
        }

        const tournamentMap = new Map(
            tournaments.map((tournament) => [
                String(tournament.id),
                tournament
            ])
        );

        const filteredResults = safeResults.filter((row) => {
            const tournament = tournamentMap.get(
                String(row.tournament_id)
            );

            return matchesGame(
                tournament?.game || tournament?.mode || "",
                game
            );
        });

        if (filteredResults.length === 0) {
            return res.status(200).json({
                success: true,
                period,
                game,
                totalPlayers: 0,
                players: []
            });
        }

        const userIds = [
            ...new Set(
                filteredResults
                    .map((row) => String(row.user_id || "").trim())
                    .filter(Boolean)
            )
        ];

        const {
            data: users,
            error: usersError
        } = await supabaseAdmin
            .from("users")
            .select("id,full_name,bio,avatar_url")
            .in("id", userIds);

        if (usersError) {
            console.error(
                "LEADERBOARD USERS ERROR:",
                usersError
            );

            return res.status(500).json({
                success: false,
                error: usersError.message
            });
        }

        const userMap = new Map(
            (users || []).map((user) => [
                String(user.id),
                user
            ])
        );

        const totals = new Map();

        for (const row of filteredResults) {
            const userId = String(row.user_id || "").trim();

            if (!userId) continue;

            const amount = Number(
                row.winning_amount || 0
            );

            totals.set(
                userId,
                (totals.get(userId) || 0) + amount
            );
        }

        const players = [...totals.entries()]
            .map(([userId, winningAmount]) => {
                const user = userMap.get(userId);

                return {
                    userId,
                    name: String(
                        user?.full_name || ""
                    ).trim(),
                    bio: String(
                        user?.bio || ""
                    ),
                    avatarUrl: String(
                        user?.avatar_url || ""
                    ),
                    winningAmount: Number(
                        winningAmount || 0
                    )
                };
            })
            .filter((player) => player.name.length > 0)
            .sort((a, b) => {
                if (b.winningAmount !== a.winningAmount) {
                    return b.winningAmount - a.winningAmount;
                }

                return a.name.localeCompare(
                    b.name,
                    "en",
                    { sensitivity: "base" }
                );
            })
            .slice(0, 100)
            .map((player, index) => ({
                rank: index + 1,
                userId: player.userId,
                name: player.name,
                bio: player.bio,
                avatarUrl: player.avatarUrl,
                winningAmount: player.winningAmount
            }));

        return res.status(200).json({
            success: true,
            period,
            game,
            totalPlayers: players.length,
            players
        });

    } catch (error) {
        console.error(
            "LEADERBOARD API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error"
        });
    }
});

module.exports = router;
