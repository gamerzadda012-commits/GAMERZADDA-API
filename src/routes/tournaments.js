const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

// ========================================
// GET TOURNAMENTS
// ========================================

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
        console.error(
            "Tournament API internal error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

// ========================================
// GET SINGLE TOURNAMENT
// ========================================

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