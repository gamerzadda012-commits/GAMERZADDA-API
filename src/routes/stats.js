const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getAuthenticatedUserId(req) {
  const cookieHeader = String(req.headers.cookie || "");
  const match = cookieHeader.match(
    /(?:^|;\s*)gamerzadda_session=([^;]+)/
  );

  if (!match) return null;

  let token = match[1];

  try {
    token = decodeURIComponent(token);
  } catch (_) {}

  const tokenHash = hashToken(token);

  const { data: session, error } = await supabaseAdmin
    .from("user_sessions")
    .select("user_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !session?.user_id) return null;

  if (
    session.expires_at &&
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    await supabaseAdmin
      .from("user_sessions")
      .delete()
      .eq("token_hash", tokenHash);

    return null;
  }

  return String(session.user_id);
}

function gameCategory(game, mode) {
  const value = `${game || ""} ${mode || ""}`.toLowerCase();

  if (
    value.includes("free fire max") ||
    value.includes("freefire max") ||
    value.includes("ff max")
  ) return "freeFireMax";

  if (value.includes("clash squad") || value.includes("clashsquad"))
    return "clashSquad";

  if (value.includes("lone wolf") || value.includes("lonewolf"))
    return "loneWolf";

  if (value.includes("free fire") || value.includes("freefire"))
    return "freeFire";

  return "other";
}

router.get("/stats/:userId", async (req, res) => {
  try {
    const requestedUserId = String(req.params.userId || "").trim();

    if (!requestedUserId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required.",
      });
    }

    /*
     * Security:
     * The ID in the URL is NOT trusted.
     * It must match the authenticated GamerzAdda session.
     */
    const sessionUserId = await getAuthenticatedUserId(req);

    if (!sessionUserId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized. Please login again.",
      });
    }

    if (sessionUserId !== requestedUserId) {
      return res.status(403).json({
        success: false,
        error: "You can only view your own stats.",
      });
    }

    const { data: entries, error: entriesError } = await supabaseAdmin
      .from("tournament_entries")
      .select("id,tournament_id,cancelled")
      .eq("user_id", sessionUserId)
      .eq("cancelled", false);

    if (entriesError) {
      console.error("STATS entries error:", entriesError);
      return res.status(500).json({
        success: false,
        error: "Unable to load games played.",
      });
    }

    const entryRows = entries || [];

    const tournamentIds = [
      ...new Set(
        entryRows
          .map((row) => row.tournament_id)
          .filter(Boolean)
          .map(String)
      ),
    ];

    let tournaments = [];

    if (tournamentIds.length) {
      const { data, error } = await supabaseAdmin
        .from("tournaments")
        .select("id,title,game,mode,status")
        .in("id", tournamentIds);

      if (error) {
        console.error("STATS tournaments error:", error);
        return res.status(500).json({
          success: false,
          error: "Unable to load tournament statistics.",
        });
      }

      tournaments = data || [];
    }

    const tournamentMap = new Map(
      tournaments.map((tournament) => [
        String(tournament.id),
        tournament,
      ])
    );

    const categories = {
      freeFire: 0,
      freeFireMax: 0,
      clashSquad: 0,
      loneWolf: 0,
      other: 0,
    };

    for (const entry of entryRows) {
      const tournament = tournamentMap.get(
        String(entry.tournament_id)
      );

      const category = gameCategory(
        tournament?.game,
        tournament?.mode
      );

      categories[category] += 1;
    }

    const { data: results, error: resultsError } = await supabaseAdmin
      .from("tournament_results")
      .select(
        "id,tournament_id,rank,kills,winning_amount,match_id,created_at,updated_at"
      )
      .eq("user_id", sessionUserId);

    if (resultsError) {
      console.error("STATS results error:", resultsError);
      return res.status(500).json({
        success: false,
        error: "Unable to load game results.",
      });
    }

    const resultRows = results || [];

    const totalKills = resultRows.reduce(
      (sum, row) =>
        sum + Math.max(0, Number(row.kills || 0)),
      0
    );

    const totalWinnings = resultRows.reduce(
      (sum, row) =>
        sum + Math.max(0, Number(row.winning_amount || 0)),
      0
    );

    const wins = resultRows.filter(
      (row) =>
        Number(row.rank) === 1 ||
        Number(row.winning_amount || 0) > 0
    ).length;

    const podiumFinishes = resultRows.filter((row) => {
      const rank = Number(row.rank);
      return rank >= 1 && rank <= 3;
    }).length;

    const completedGames = resultRows.length;

    const winRate = completedGames
      ? Number(((wins / completedGames) * 100).toFixed(1))
      : 0;

    const { data: withdrawals, error: withdrawalsError } =
      await supabaseAdmin
        .from("withdraw_requests")
        .select(
          "id,amount,net_amount,status,created_at,processed_at"
        )
        .eq("user_id", sessionUserId)
        .eq("status", "approved");

    if (withdrawalsError) {
      console.error("STATS withdrawals error:", withdrawalsError);
      return res.status(500).json({
        success: false,
        error: "Unable to load withdrawal statistics.",
      });
    }

    const withdrawalRows = withdrawals || [];

    const totalWithdrawn = withdrawalRows.reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          Number(row.net_amount ?? row.amount ?? 0)
        ),
      0
    );

    const bestResult = resultRows.reduce((best, row) => {
      if (!best) return row;

      const bestKills = Number(best.kills || 0);
      const currentKills = Number(row.kills || 0);

      if (currentKills > bestKills) return row;

      const bestRank = Number(best.rank || 999999);
      const currentRank = Number(row.rank || 999999);

      return currentRank < bestRank ? row : best;
    }, null);

    const bestTournament = bestResult
      ? tournamentMap.get(String(bestResult.tournament_id))
      : null;

    return res.json({
      success: true,
      stats: {
        totalGames: entryRows.length,
        completedGames,
        wins,
        podiumFinishes,
        totalKills,
        totalWinnings,
        winRate,
        totalWithdrawn,
        withdrawalCount: withdrawalRows.length,
        bestKills: Number(bestResult?.kills || 0),
        bestRank:
          bestResult?.rank == null
            ? null
            : Number(bestResult.rank),
        bestTournamentTitle:
          bestTournament?.title || null,
        categories,
      },
    });
  } catch (error) {
    console.error("MY STATS ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error.",
    });
  }
});

module.exports = router;
