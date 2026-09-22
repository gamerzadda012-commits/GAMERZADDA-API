const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

/*
  GET /api/leaderboard

  Query:
    period = weekly | monthly | all
    game   = ALL

  Example:
    /api/leaderboard?period=weekly&game=ALL
*/

function getStartDate(period) {
  const now = new Date();

  if (period === "weekly") {
    const date = new Date(now);
    date.setDate(date.getDate() - 7);
    return date.toISOString();
  }

  if (period === "monthly") {
    const date = new Date(now);
    date.setDate(date.getDate() - 30);
    return date.toISOString();
  }

  return null;
}

router.get("/leaderboard", async (req, res) => {
  try {
    const period = String(req.query.period || "all").toLowerCase();
    const game = String(req.query.game || "ALL").trim();

    if (!["weekly", "monthly", "all"].includes(period)) {
      return res.status(400).json({
        success: false,
        error: "Invalid period."
      });
    }

    /*
      Get tournament results.

      We intentionally calculate the leaderboard from
      tournament_results.winning_amount.
    */

    let resultsQuery = supabase
      .from("tournament_results")
      .select(
        "user_id,tournament_id,winning_amount,updated_at"
      )
      .gt("winning_amount", 0);

    const startDate = getStartDate(period);

    if (startDate) {
      resultsQuery = resultsQuery.gte(
        "updated_at",
        startDate
      );
    }

    const { data: resultRows, error: resultsError } =
      await resultsQuery;

    if (resultsError) {
      console.error(
        "Leaderboard results error:",
        resultsError
      );

      return res.status(500).json({
        success: false,
        error: resultsError.message
      });
    }

    const rows = resultRows || [];

    if (rows.length === 0) {
      return res.json({
        success: true,
        period,
        game,
        players: []
      });
    }

    /*
      Game filtering is future-ready.

      Currently game=ALL is used, so no filtering
      is applied.
    */

    let filteredRows = rows;

    if (game !== "ALL") {
      const tournamentIds = [
        ...new Set(
          rows
            .map((row) =>
              String(row.tournament_id || "").trim()
            )
            .filter(Boolean)
        )
      ];

      if (tournamentIds.length > 0) {
        const { data: tournaments, error: tournamentError } =
          await supabase
            .from("tournaments")
            .select("id,game")
            .in("id", tournamentIds);

        if (tournamentError) {
          return res.status(500).json({
            success: false,
            error: tournamentError.message
          });
        }

        const tournamentMap = new Map(
          (tournaments || []).map((tournament) => [
            String(tournament.id),
            String(tournament.game || "")
          ])
        );

        const normalize = (value) =>
          String(value || "")
            .toLowerCase()
            .replace(/[\s_-]/g, "");

        filteredRows = rows.filter((row) => {
          const tournamentGame =
            tournamentMap.get(
              String(row.tournament_id || "")
            );

          return (
            normalize(tournamentGame) ===
            normalize(game)
          );
        });
      }
    }

    /*
      Add all winnings belonging to the same user.
    */

    const totals = new Map();

    for (const row of filteredRows) {
      const userId = String(
        row.user_id || ""
      ).trim();

      const amount = Number(
        row.winning_amount || 0
      );

      if (!userId) continue;
      if (!Number.isFinite(amount)) continue;
      if (amount <= 0) continue;

      totals.set(
        userId,
        (totals.get(userId) || 0) + amount
      );
    }

    const userIds = Array.from(totals.keys());

    if (userIds.length === 0) {
      return res.json({
        success: true,
        period,
        game,
        players: []
      });
    }

    /*
      Fetch player profile information.
    */

    const { data: users, error: usersError } =
      await supabase
        .from("users")
        .select(
          "id,full_name,bio"
        )
        .in("id", userIds);

    if (usersError) {
      console.error(
        "Leaderboard users error:",
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

    /*
      Sort:
        1. Highest winnings
        2. User ID as deterministic tie-breaker
    */

    const sortedPlayers = userIds
      .map((userId) => {
        const user = userMap.get(userId);

        return {
          userId,
          name:
            user?.full_name ||
            "GAMERZADDA Player",
          bio:
            user?.bio ||
            "",
          winningAmount:
            Number(totals.get(userId) || 0)
        };
      })
      .sort((a, b) => {
        if (
          b.winningAmount !==
          a.winningAmount
        ) {
          return (
            b.winningAmount -
            a.winningAmount
          );
        }

        return a.userId.localeCompare(
          b.userId
        );
      })
      .slice(0, 100)
      .map((player, index) => ({
        rank: index + 1,
        userId: player.userId,
        name: player.name,
        bio: player.bio,
        winningAmount:
          player.winningAmount
      }));

    return res.json({
      success: true,
      period,
      game,
      totalPlayers: sortedPlayers.length,
      players: sortedPlayers
    });

  } catch (error) {
    console.error(
      "Leaderboard API error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Unable to load leaderboard."
    });
  }
});

module.exports = router;