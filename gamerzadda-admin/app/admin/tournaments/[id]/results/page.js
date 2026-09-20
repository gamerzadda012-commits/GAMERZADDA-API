
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getUser(entry) {
  if (Array.isArray(entry?.users)) {
    return entry.users[0] || null;
  }

  return entry?.users || null;
}

function getPlayerName(entry, user) {
  return (
    entry?.game_name ||
    user?.game_name ||
    user?.full_name ||
    "Unknown Player"
  );
}

export default function TournamentResultsPage() {
  const params = useParams();
  const router = useRouter();

  const tournamentId = String(params?.id || "");

  const [tournament, setTournament] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [prizes, setPrizes] = useState([]);

  const [results, setResults] = useState({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [search, setSearch] = useState("");

  async function loadData() {
    if (!tournamentId) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      // -----------------------------------------
      // TOURNAMENT
      // -----------------------------------------
      const {
        data: tournamentData,
        error: tournamentError,
      } = await supabase
        .from("tournaments")
        .select(
          "id,title,game,mode,entry_fee,prize_pool,kill_reward,max_players,start_time,map,status"
        )
        .eq("id", tournamentId)
        .single();

      if (tournamentError) {
        throw tournamentError;
      }

      setTournament(tournamentData);

      // -----------------------------------------
      // PARTICIPANTS
      // -----------------------------------------
      const {
        data: entryData,
        error: entryError,
      } = await supabase
        .from("tournament_entries")
        .select(
          "id,user_id,game_name,free_fire_uid,level,created_at,cancelled"
        )
        .eq("tournament_id", tournamentId)
        .eq("cancelled", false)
        .order("created_at", {
          ascending: true,
        });

      if (entryError) {
        throw entryError;
      }

      const entries = entryData || [];

      // -----------------------------------------
      // USER DETAILS
      // -----------------------------------------
      const userIds = [
        ...new Set(
          entries
            .map((entry) => entry.user_id)
            .filter(Boolean)
        ),
      ];

      const usersMap = {};

      if (userIds.length > 0) {
        const {
          data: usersData,
          error: usersError,
        } = await supabase
          .from("users")
          .select(
            "id,full_name,email,game_name,free_fire_uid,level,bio,avatar_url"
          )
          .in("id", userIds);

        if (usersError) {
          console.warn(
            "Could not load users:",
            usersError.message
          );
        }

        (usersData || []).forEach((user) => {
          usersMap[user.id] = user;
        });
      }

      const mergedParticipants = entries.map((entry) => ({
        ...entry,
        users: usersMap[entry.user_id] || null,
      }));

      setParticipants(mergedParticipants);

      // -----------------------------------------
      // CONFIGURED PRIZES
      // -----------------------------------------
      const {
        data: prizeData,
        error: prizeError,
      } = await supabase
        .from("tournament_prizes")
        .select("id,rank,label,amount")
        .eq("tournament_id", tournamentId)
        .order("rank", {
          ascending: true,
        });

      if (prizeError) {
        throw prizeError;
      }

      const cleanPrizes = (prizeData || [])
        .map((prize) => ({
          id: prize.id,
          rank: Number(prize.rank),
          label:
            prize.label ||
            `${prize.rank}th Place`,
          amount: Number(prize.amount) || 0,
        }))
        .filter((prize) =>
          Number.isFinite(prize.rank)
        );

      setPrizes(cleanPrizes);

      // -----------------------------------------
      // EXISTING SAVED RESULTS
      // -----------------------------------------
      try {
        const response = await fetch(
          `/api/admin/tournaments/${tournamentId}/results`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        if (response.ok) {
          const responseData =
            await response.json().catch(() => null);

          const savedResults =
            responseData?.results ||
            responseData?.data ||
            [];

          const initialResults = {};

          savedResults.forEach((item) => {
            if (!item?.user_id) {
              return;
            }

            initialResults[item.user_id] = {
              rank:
                item.rank === null ||
                item.rank === undefined
                  ? ""
                  : String(item.rank),

              kills: String(item.kills ?? 0),

              winning_amount: String(
                item.winning_amount ?? 0
              ),
            };
          });

          setResults(initialResults);
        }
      } catch (savedResultsError) {
        console.warn(
          "Could not load saved results:",
          savedResultsError
        );
      }
    } catch (loadError) {
      console.error(loadError);

      setError(
        loadError?.message ||
          "Failed to load tournament results."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  // -----------------------------------------
  // GET RANK PRIZE
  // -----------------------------------------
  function getPrizeAmount(rank) {
    if (
      rank === "" ||
      rank === null ||
      rank === undefined
    ) {
      return 0;
    }

    const prize = prizes.find(
      (item) =>
        Number(item.rank) === Number(rank)
    );

    return Number(prize?.amount) || 0;
  }

  // -----------------------------------------
  // KILL AMOUNT
  // -----------------------------------------
  function getKillAmount(kills) {
    const killCount =
      Number(kills) || 0;

    const killReward =
      Number(tournament?.kill_reward) || 0;

    return killCount * killReward;
  }

  // -----------------------------------------
  // FINAL WINNING AMOUNT
  //
  // RANK PRIZE
  // +
  // KILLS × KILL REWARD
  // -----------------------------------------
  function calculateWinningAmount(
    rank,
    kills
  ) {
    const rankPrize =
      getPrizeAmount(rank);

    const killAmount =
      getKillAmount(kills);

    return rankPrize + killAmount;
  }

  // -----------------------------------------
  // UPDATE RESULT
  // -----------------------------------------
  function updateResult(
    userId,
    field,
    value
  ) {
    if (!userId) {
      return;
    }

    setResults((previous) => {
      const current =
        previous[userId] || {
          rank: "",
          kills: "0",
          winning_amount: "0",
        };

      const next = {
        ...current,
        [field]: value,
      };

      /*
       * RANK SELECTED
       *
       * Keep existing kills.
       * Add rank prize + kill amount.
       */
      if (field === "rank") {
        next.winning_amount = String(
          calculateWinningAmount(
            value,
            current.kills
          )
        );
      }

      /*
       * KILLS ENTERED
       *
       * KEEP selected rank.
       * Add rank prize + new kill amount.
       *
       * This fixes the bug where the rank prize
       * was disappearing after entering kills.
       */
      if (field === "kills") {
        next.winning_amount = String(
          calculateWinningAmount(
            current.rank,
            value
          )
        );
      }

      /*
       * WINNING AMOUNT MANUALLY EDITED
       *
       * Do NOT recalculate it here.
       */
      if (field === "winning_amount") {
        next.winning_amount = value;
      }

      return {
        ...previous,
        [userId]: next,
      };
    });
  }

  function getResult(userId) {
    return (
      results[userId] || {
        rank: "",
        kills: "0",
        winning_amount: "0",
      }
    );
  }

  // -----------------------------------------
  // SEARCH
  // -----------------------------------------
  const filteredParticipants = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    if (!query) {
      return participants;
    }

    return participants.filter((entry) => {
      const user = getUser(entry);

      const name =
        getPlayerName(
          entry,
          user
        ).toLowerCase();

      const uid = String(
        entry.free_fire_uid ||
          user?.free_fire_uid ||
          ""
      ).toLowerCase();

      const email = String(
        user?.email || ""
      ).toLowerCase();

      return (
        name.includes(query) ||
        uid.includes(query) ||
        email.includes(query)
      );
    });
  }, [participants, search]);

  // -----------------------------------------
  // ONLY CONFIGURED RANKS
  // -----------------------------------------
  const rankOptions = useMemo(() => {
    return [...prizes]
      .sort(
        (a, b) =>
          Number(a.rank) -
          Number(b.rank)
      )
      .map((prize) => ({
        rank: Number(prize.rank),
        label:
          prize.label ||
          `${prize.rank}th Place`,
        amount:
          Number(prize.amount) || 0,
      }));
  }, [prizes]);

  // -----------------------------------------
  // SAVE RESULTS
  // -----------------------------------------
  async function saveResults() {
    if (!tournamentId) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payloadResults =
        participants.map((player) => {
          const result =
            getResult(player.user_id);

          return {
            user_id: player.user_id,

            rank:
              result.rank === ""
                ? null
                : Number(result.rank),

            kills:
              Number(result.kills) || 0,

            winning_amount:
              Number(
                result.winning_amount
              ) || 0,
          };
        });

      const response = await fetch(
        `/api/admin/tournaments/${tournamentId}/results`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            results: payloadResults,
          }),
        }
      );

      const responseData =
        await response
          .json()
          .catch(() => null);

      if (
        !response.ok ||
        responseData?.success === false
      ) {
        throw new Error(
          responseData?.error ||
            responseData?.message ||
            "Failed to save results."
        );
      }

      // -----------------------------------------
      // MARK TOURNAMENT COMPLETED
      // -----------------------------------------
      const {
        error: statusError,
      } = await supabase
        .from("tournaments")
        .update({
          status: "completed",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", tournamentId);

      if (statusError) {
        console.warn(
          "Status update failed:",
          statusError.message
        );
      }

      setTournament((previous) => ({
        ...previous,
        status: "completed",
      }));

      setMessage(
        "Results saved successfully. Tournament marked as completed."
      );
    } catch (saveError) {
      console.error(saveError);

      setError(
        saveError?.message ||
          "Failed to save results."
      );
    } finally {
      setSaving(false);
    }
  }

  function openPlayer(player) {
    setSelectedPlayer(player);
  }

  function closePlayer() {
    setSelectedPlayer(null);
  }

  // -----------------------------------------
  // STATS
  // -----------------------------------------
  const totalKills = participants.reduce(
    (total, player) => {
      const result =
        getResult(player.user_id);

      return (
        total +
        (Number(result.kills) || 0)
      );
    },
    0
  );

  const totalWinning = participants.reduce(
    (total, player) => {
      const result =
        getResult(player.user_id);

      return (
        total +
        (Number(
          result.winning_amount
        ) || 0)
      );
    },
    0
  );

  const totalRankPrize = participants.reduce(
    (total, player) => {
      const result =
        getResult(player.user_id);

      return (
        total +
        getPrizeAmount(result.rank)
      );
    },
    0
  );

  const totalKillPrize =
    participants.reduce(
      (total, player) => {
        const result =
          getResult(player.user_id);

        return (
          total +
          getKillAmount(result.kills)
        );
      },
      0
    );

  // -----------------------------------------
  // LOADING
  // -----------------------------------------
  if (loading) {
    return (
      <main className="loadingPage">
        <div className="loadingBox">
          Loading tournament results...
        </div>

        <style jsx>{`
          .loadingPage {
            min-height: 100vh;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .loadingBox {
            padding: 30px;
            color: #64748b;
            font-size: 14px;
            font-weight: 900;
          }
        `}</style>
      </main>
    );
  }

  // -----------------------------------------
  // NOT FOUND
  // -----------------------------------------
  if (!tournament) {
    return (
      <main className="loadingPage">
        <div className="errorBox">
          Tournament not found.
        </div>

        <style jsx>{`
          .loadingPage {
            min-height: 100vh;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .errorBox {
            color: #be123c;
            font-size: 14px;
            font-weight: 900;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="page">

      <style jsx>{`

        .page {
          min-height: 100vh;
          background: #f8fafc;
          color: #111827;
          padding: 18px;
          box-sizing: border-box;
        }

        .container {
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
        }

        /* HEADER */

        .header {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 15px;
          overflow: hidden;
          box-shadow:
            0 5px 20px rgba(15, 23, 42, 0.04);
          margin-bottom: 12px;
        }

        .headerTop {
          min-height: 50px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
        }

        .backButton {
          height: 33px;
          padding: 0 11px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #374151;
          border-radius: 8px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 900;
        }

        .backButton:hover {
          color: #ff174f;
          border-color: #ff174f;
          background: #fff7f9;
        }

        .status {
          padding: 6px 10px;
          border-radius: 999px;
          background: #ecfdf5;
          color: #15803d;
          border: 1px solid #bbf7d0;
          font-size: 8px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .headerBody {
          padding: 16px 18px;
        }

        .eyebrow {
          color: #ff174f;
          font-size: 8px;
          font-weight: 950;
          letter-spacing: .16em;
          margin-bottom: 5px;
        }

        .title {
          margin: 0;
          color: #111827;
          font-size: 23px;
          line-height: 1.2;
          font-weight: 950;
        }

        .meta {
          margin-top: 6px;
          color: #64748b;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 7px;
          font-size: 10px;
          font-weight: 700;
        }

        .dot {
          color: #cbd5e1;
        }

        /* ALERTS */

        .message {
          margin-bottom: 12px;
          padding: 10px 12px;
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          color: #15803d;
          border-radius: 9px;
          font-size: 10px;
          font-weight: 850;
        }

        .error {
          margin-bottom: 12px;
          padding: 10px 12px;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #be123c;
          border-radius: 9px;
          font-size: 10px;
          font-weight: 850;
        }

        /* STATS */

        .stats {
          display: grid;
          grid-template-columns:
            repeat(5, minmax(0, 1fr));
          gap: 9px;
          margin-bottom: 11px;
        }

        .stat {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 11px;
          padding: 12px;
        }

        .statLabel {
          color: #94a3b8;
          font-size: 7px;
          font-weight: 950;
          letter-spacing: .09em;
          text-transform: uppercase;
        }

        .statValue {
          margin-top: 5px;
          color: #111827;
          font-size: 16px;
          font-weight: 950;
        }

        .red {
          color: #ff174f;
        }

        .green {
          color: #15803d;
        }

        /* TOOLBAR */

        .toolbar {
          display: flex;
          gap: 8px;
          margin-bottom: 11px;
        }

        .search {
          flex: 1;
          height: 38px;
          padding: 0 12px;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          background: #ffffff;
          color: #111827;
          outline: none;
          font-size: 10px;
          font-weight: 650;
        }

        .search:focus {
          border-color: #ff174f;
          box-shadow:
            0 0 0 3px
            rgba(255, 23, 79, .06);
        }

        .refreshButton {
          height: 38px;
          padding: 0 13px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #374151;
          border-radius: 9px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 900;
        }

        .refreshButton:hover {
          color: #ff174f;
          border-color: #ff174f;
        }

        /* TABLE */

        .tableCard {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 13px;
          overflow: hidden;
          box-shadow:
            0 5px 20px rgba(15, 23, 42, .035);
        }

        .tableScroll {
          width: 100%;
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 960px;
          border-collapse: collapse;
        }

        th {
          height: 42px;
          padding: 0 11px;
          background: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
          color: #64748b;
          text-align: left;
          font-size: 7px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        td {
          padding: 9px 11px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          color: #374151;
          font-size: 10px;
        }

        tr:last-child td {
          border-bottom: 0;
        }

        tr:hover td {
          background: #fffafb;
        }

        /* PLAYER */

        .playerButton {
          border: 0;
          background: transparent;
          padding: 0;
          color: #111827;
          cursor: pointer;
          font-size: 11px;
          font-weight: 950;
          text-align: left;
        }

        .playerButton:hover {
          color: #ff174f;
        }

        .uidText {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 7px;
          font-weight: 700;
        }

        /* RANK */

        .rankSelect {
          width: 155px;
          height: 34px;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: #ffffff;
          color: #111827;
          padding: 0 7px;
          outline: none;
          font-size: 9px;
          font-weight: 800;
        }

        .rankSelect:focus {
          border-color: #ff174f;
        }

        /* NUMBER */

        .numberInput {
          width: 75px;
          height: 34px;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: #ffffff;
          color: #111827;
          padding: 0 8px;
          outline: none;
          font-size: 10px;
          font-weight: 850;
          box-sizing: border-box;
        }

        .numberInput:focus {
          border-color: #ff174f;
        }

        /* WINNING */

        .winningInput {
          width: 105px;
          height: 34px;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          background: #f0fdf4;
          color: #15803d;
          padding: 0 8px;
          outline: none;
          font-size: 10px;
          font-weight: 950;
          box-sizing: border-box;
        }

        .winningInput:focus {
          border-color: #22c55e;
          background: #ffffff;
        }

        .calculation {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 7px;
          font-weight: 750;
        }

        .calculation strong {
          color: #15803d;
        }

        .prizeValue {
          color: #15803d;
          font-size: 10px;
          font-weight: 950;
        }

        .emptyPrize {
          color: #94a3b8;
          font-size: 9px;
          font-weight: 700;
        }

        /* SAVE BAR */

        .saveBar {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 12px;
        }

        .cancelButton {
          height: 40px;
          padding: 0 14px;
          border: 1px solid #dbe2ea;
          border-radius: 9px;
          background: #ffffff;
          color: #374151;
          cursor: pointer;
          font-size: 10px;
          font-weight: 900;
        }

        .saveButton {
          height: 40px;
          padding: 0 17px;
          border: 0;
          border-radius: 9px;
          background: #ff174f;
          color: #ffffff;
          cursor: pointer;
          font-size: 10px;
          font-weight: 950;
          box-shadow:
            0 7px 20px
            rgba(255, 23, 79, .18);
        }

        .saveButton:hover {
          background: #e91548;
        }

        .saveButton:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        /* MODAL */

        .modalOverlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: rgba(15, 23, 42, .52);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .modal {
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
          background: #ffffff;
          border-radius: 16px;
          box-shadow:
            0 30px 80px
            rgba(15, 23, 42, .25);
        }

        .modalHeader {
          min-height: 50px;
          padding: 0 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e5e7eb;
        }

        .modalTitle {
          margin: 0;
          font-size: 15px;
          font-weight: 950;
          color: #111827;
        }

        .closeButton {
          width: 31px;
          height: 31px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          color: #64748b;
          cursor: pointer;
          font-size: 17px;
        }

        .modalBody {
          padding: 17px;
        }

        .profileTop {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 15px;
          margin-bottom: 14px;
          border-bottom: 1px solid #f1f5f9;
        }

        .avatar {
          width: 55px;
          height: 55px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #ffe4ea;
          color: #ff174f;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-size: 20px;
          font-weight: 950;
        }

        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .profileName {
          color: #111827;
          font-size: 15px;
          font-weight: 950;
        }

        .profileSub {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 8px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .details {
          display: grid;
          gap: 9px;
        }

        .detail {
          display: grid;
          grid-template-columns: 115px 1fr;
          gap: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #f1f5f9;
        }

        .detailLabel {
          color: #94a3b8;
          font-size: 8px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .detailValue {
          color: #374151;
          font-size: 9px;
          font-weight: 750;
          word-break: break-word;
        }

        @media (max-width: 900px) {

          .stats {
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
          }

        }

        @media (max-width: 650px) {

          .page {
            padding: 10px;
          }

          .stats {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .title {
            font-size: 19px;
          }

          .toolbar {
            flex-direction: column;
          }

          .refreshButton {
            width: 100%;
          }

          .saveBar {
            flex-direction: column;
          }

          .saveButton,
          .cancelButton {
            width: 100%;
          }

          .detail {
            grid-template-columns: 100px 1fr;
          }

        }

      `}</style>

      <div className="container">

        {/* HEADER */}

        <section className="header">

          <div className="headerTop">

            <button
              className="backButton"
              onClick={() =>
                router.push(
                  `/admin/tournaments/${tournamentId}`
                )
              }
            >
              ← Back
            </button>

            <span className="status">
              {tournament.status ||
                "upcoming"}
            </span>

          </div>

          <div className="headerBody">

            <div className="eyebrow">
              RESULT MANAGEMENT
            </div>

            <h1 className="title">
              {tournament.title}
            </h1>

            <div className="meta">

              <span>
                {tournament.game}
              </span>

              <span className="dot">
                •
              </span>

              <span>
                {tournament.mode}
              </span>

              <span className="dot">
                •
              </span>

              <span>
                {tournament.map ||
                  "No map"}
              </span>

              <span className="dot">
                •
              </span>

              <span>
                Starts{" "}
                {formatDate(
                  tournament.start_time
                )}
              </span>

            </div>

          </div>

        </section>

        {/* MESSAGE */}

        {message && (
          <div className="message">
            ✅ {message}
          </div>
        )}

        {error && (
          <div className="error">
            ⚠️ {error}
          </div>
        )}

        {/* STATS */}

        <div className="stats">

          <div className="stat">
            <div className="statLabel">
              Participants
            </div>

            <div className="statValue">
              {participants.length}
            </div>
          </div>

          <div className="stat">
            <div className="statLabel">
              Total Kills
            </div>

            <div className="statValue">
              {totalKills}
            </div>
          </div>

          <div className="stat">
            <div className="statLabel">
              Kill Reward
            </div>

            <div className="statValue red">
              {money(
                tournament.kill_reward
              )}
            </div>
          </div>

          <div className="stat">
            <div className="statLabel">
              Rank Prizes
            </div>

            <div className="statValue green">
              {money(
                totalRankPrize
              )}
            </div>
          </div>

          <div className="stat">
            <div className="statLabel">
              Total Winning
            </div>

            <div className="statValue green">
              {money(
                totalWinning
              )}
            </div>
          </div>

        </div>

        {/* SEARCH */}

        <div className="toolbar">

          <input
            className="search"
            type="text"
            placeholder="Search by in-game name, UID or email..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />

          <button
            className="refreshButton"
            onClick={loadData}
          >
            ↻ Refresh
          </button>

        </div>

        {/* RESULTS TABLE */}

        <section className="tableCard">

          <div className="tableScroll">

            <table>

              <thead>

                <tr>

                  <th>
                    #
                  </th>

                  <th>
                    Rank
                  </th>

                  <th>
                    In-Game Name
                  </th>

                  <th>
                    Rank Prize
                  </th>

                  <th>
                    Kills
                  </th>

                  <th>
                    Kill Prize
                  </th>

                  <th>
                    Winning Amount
                  </th>

                </tr>

              </thead>

              <tbody>

                {filteredParticipants.length === 0 ? (

                  <tr>

                    <td
                      colSpan="7"
                      style={{
                        textAlign:
                          "center",
                        padding:
                          "40px",
                        color:
                          "#64748b",
                        fontWeight:
                          800,
                      }}
                    >
                      No participants found.
                    </td>

                  </tr>

                ) : (

                  filteredParticipants.map(
                    (player, index) => {

                      const user =
                        getUser(player);

                      const playerName =
                        getPlayerName(
                          player,
                          user
                        );

                      const result =
                        getResult(
                          player.user_id
                        );

                      const rankPrize =
                        getPrizeAmount(
                          result.rank
                        );

                      const killAmount =
                        getKillAmount(
                          result.kills
                        );

                      const automaticWinning =
                        rankPrize +
                        killAmount;

                      return (
                        <tr
                          key={
                            player.id ||
                            player.user_id ||
                            index
                          }
                        >

                          {/* NUMBER */}

                          <td>
                            {index + 1}
                          </td>

                          {/* RANK */}

                          <td>

                            <select
                              className="rankSelect"
                              value={
                                result.rank
                              }
                              onChange={(event) =>
                                updateResult(
                                  player.user_id,
                                  "rank",
                                  event.target.value
                                )
                              }
                            >

                              <option value="">
                                Select Rank
                              </option>

                              {rankOptions.map(
                                (prize) => (
                                  <option
                                    key={
                                      prize.rank
                                    }
                                    value={
                                      prize.rank
                                    }
                                  >
                                    {prize.label}{" "}
                                    —{" "}
                                    {money(
                                      prize.amount
                                    )}
                                  </option>
                                )
                              )}

                            </select>

                          </td>

                          {/* IN-GAME NAME */}

                          <td>

                            <button
                              className="playerButton"
                              onClick={() =>
                                openPlayer(
                                  player
                                )
                              }
                            >
                              {playerName}
                            </button>

                            <div className="uidText">
                              UID:{" "}
                              {player.free_fire_uid ||
                                user?.free_fire_uid ||
                                "—"}
                            </div>

                          </td>

                          {/* RANK PRIZE */}

                          <td>

                            {rankPrize > 0 ? (

                              <div className="prizeValue">
                                {money(
                                  rankPrize
                                )}
                              </div>

                            ) : (

                              <div className="emptyPrize">
                                —
                              </div>

                            )}

                          </td>

                          {/* KILLS */}

                          <td>

                            <input
                              className="numberInput"
                              type="number"
                              min="0"
                              value={
                                result.kills
                              }
                              onChange={(event) =>
                                updateResult(
                                  player.user_id,
                                  "kills",
                                  event.target.value
                                )
                              }
                            />

                          </td>

                          {/* KILL PRIZE */}

                          <td>

                            <div className="calculation">

                              {Number(
                                result.kills
                              ) || 0}

                              {" × "}

                              {money(
                                tournament.kill_reward
                              )}

                              <br />

                              <strong>
                                {money(
                                  killAmount
                                )}
                              </strong>

                            </div>

                          </td>

                          {/* FINAL WINNING */}

                          <td>

                            <input
                              className="winningInput"
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                result.winning_amount
                              }
                              onChange={(event) =>
                                updateResult(
                                  player.user_id,
                                  "winning_amount",
                                  event.target.value
                                )
                              }
                            />

                            <div className="calculation">

                              {money(
                                rankPrize
                              )}

                              {" + "}

                              {money(
                                killAmount
                              )}

                              {" = "}

                              <strong>
                                {money(
                                  automaticWinning
                                )}
                              </strong>

                            </div>

                          </td>

                        </tr>
                      );
                    }
                  )

                )}

              </tbody>

            </table>

          </div>

        </section>

        {/* SAVE BUTTON */}

        <div className="saveBar">

          <button
            className="cancelButton"
            onClick={() =>
              router.push(
                `/admin/tournaments/${tournamentId}`
              )
            }
          >
            Cancel
          </button>

          <button
            className="saveButton"
            disabled={
              saving ||
              participants.length === 0
            }
            onClick={saveResults}
          >
            {saving
              ? "Saving Results..."
              : "💾 Save & Complete Tournament"}
          </button>

        </div>

      </div>

      {/* PLAYER DETAILS POPUP */}

      {selectedPlayer && (

        <div
          className="modalOverlay"
          onClick={closePlayer}
        >

          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            {(() => {

              const user =
                getUser(
                  selectedPlayer
                );

              const playerName =
                getPlayerName(
                  selectedPlayer,
                  user
                );

              return (
                <>

                  <div className="modalHeader">

                    <h2 className="modalTitle">
                      Player Details
                    </h2>

                    <button
                      className="closeButton"
                      onClick={closePlayer}
                    >
                      ×
                    </button>

                  </div>

                  <div className="modalBody">

                    <div className="profileTop">

                      <div className="avatar">

                        {user?.avatar_url ? (

                          <img
                            src={
                              user.avatar_url
                            }
                            alt=""
                          />

                        ) : (
                          "👤"
                        )}

                      </div>

                      <div>

                        <div className="profileName">
                          {playerName}
                        </div>

                        <div className="profileSub">
                          In-Game Name
                        </div>

                      </div>

                    </div>

                    <div className="details">

                      <div className="detail">

                        <div className="detailLabel">
                          Real Name
                        </div>

                        <div className="detailValue">
                          {user?.full_name ||
                            "—"}
                        </div>

                      </div>

                      <div className="detail">

                        <div className="detailLabel">
                          In-Game Name
                        </div>

                        <div className="detailValue">
                          {playerName}
                        </div>

                      </div>

                      <div className="detail">

                        <div className="detailLabel">
                          Free Fire UID
                        </div>

                        <div className="detailValue">
                          {selectedPlayer.free_fire_uid ||
                            user?.free_fire_uid ||
                            "—"}
                        </div>

                      </div>

                      <div className="detail">

                        <div className="detailLabel">
                          Level
                        </div>

                        <div className="detailValue">
                          {selectedPlayer.level ??
                            user?.level ??
                            "—"}
                        </div>

                      </div>

                      <div className="detail">

                        <div className="detailLabel">
                          Email
                        </div>

                        <div className="detailValue">
                          {user?.email ||
                            "—"}
                        </div>

                      </div>

                      <div className="detail">

                        <div className="detailLabel">
                          User ID
                        </div>

                        <div className="detailValue">
                          {selectedPlayer.user_id ||
                            "—"}
                        </div>

                      </div>

                      <div className="detail">

                        <div className="detailLabel">
                          Joined Time
                        </div>

                        <div className="detailValue">
                          {formatDate(
                            selectedPlayer.created_at
                          )}
                        </div>

                      </div>

                      <div className="detail">

                        <div className="detailLabel">
                          Bio
                        </div>

                        <div className="detailValue">
                          {user?.bio ||
                            "—"}
                        </div>

                      </div>

                    </div>

                  </div>

                </>
              );

            })()}

          </div>

        </div>

      )}

    </main>
  );
}