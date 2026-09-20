"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

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
    if (!tournamentId || !supabase) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
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

      let usersMap = {};

      const userIds = [
        ...new Set(
          entries
            .map((entry) => entry.user_id)
            .filter(Boolean)
        ),
      ];

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
            "Users could not be loaded:",
            usersError.message
          );
        }

        (usersData || []).forEach((user) => {
          usersMap[user.id] = user;
        });
      }

      const mergedParticipants = entries.map(
        (entry) => ({
          ...entry,
          users: usersMap[entry.user_id] || null,
        })
      );

      setParticipants(mergedParticipants);

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

      /*
       * Try loading already saved results.
       *
       * If the API is not available yet, the page still
       * works normally with blank result values.
       */
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
          const resultData = await response
            .json()
            .catch(() => null);

          const savedResults =
            resultData?.results ||
            resultData?.data ||
            [];

          const initialResults = {};

          savedResults.forEach((item) => {
            const userId = item.user_id;

            if (!userId) return;

            initialResults[userId] = {
              rank:
                item.rank === null ||
                item.rank === undefined
                  ? ""
                  : String(item.rank),

              kills: String(
                item.kills ?? 0
              ),

              winning_amount: String(
                item.winning_amount ?? 0
              ),
            };
          });

          setResults(initialResults);
        }
      } catch (resultLoadError) {
        console.warn(
          "Existing results could not be loaded:",
          resultLoadError
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

  /*
   * Find configured prize for a selected rank.
   */
  function getPrizeAmount(rank) {
    if (!rank) {
      return 0;
    }

    const prize = prizes.find(
      (item) =>
        Number(item.rank) === Number(rank)
    );

    return Number(prize?.amount) || 0;
  }

  /*
   * IMPORTANT:
   *
   * FINAL WINNING AMOUNT
   *
   * Rank Prize
   * +
   * (Kills × Kill Reward)
   */
  function calculateWinningAmount(
    rank,
    kills
  ) {
    const rankPrize =
      getPrizeAmount(rank);

    const killReward =
      Number(tournament?.kill_reward) || 0;

    const killCount =
      Number(kills) || 0;

    const killAmount =
      killCount * killReward;

    return rankPrize + killAmount;
  }

  function updateResult(
    userId,
    field,
    value
  ) {
    if (!userId) return;

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
       * Rank changed:
       * automatically use rank prize + current kill reward.
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
       * Kills changed:
       * automatically use rank prize + new kill reward.
       */
      if (field === "kills") {
        next.winning_amount = String(
          calculateWinningAmount(
            current.rank,
            value
          )
        );
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

  const filteredParticipants = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    if (!query) {
      return participants;
    }

    return participants.filter(
      (entry) => {
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
      }
    );
  }, [participants, search]);

  /*
   * Only ranks configured during tournament creation.
   */
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

      /*
       * Tournament is completed after results upload.
       */
      const { error: statusError } =
        await supabase
          .from("tournaments")
          .update({
            status: "completed",
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", tournamentId);

      if (statusError) {
        console.warn(
          "Could not update tournament status:",
          statusError.message
        );
      }

      setTournament((previous) => ({
        ...previous,
        status: "completed",
      }));

      setMessage(
        "✅ Results saved successfully. Tournament marked as completed."
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

  function openPlayer(entry) {
    setSelectedPlayer(entry);
  }

  function closePlayer() {
    setSelectedPlayer(null);
  }

  const totalWinning = participants.reduce(
    (sum, player) => {
      const result =
        getResult(player.user_id);

      return (
        sum +
        (Number(
          result.winning_amount
        ) || 0)
      );
    },
    0
  );

  const totalKills = participants.reduce(
    (sum, player) => {
      const result =
        getResult(player.user_id);

      return (
        sum +
        (Number(result.kills) || 0)
      );
    },
    0
  );

  if (loading) {
    return (
      <main className="loadingPage">
        <div className="loadingBox">
          Loading results...
        </div>

        <style jsx>{`
          .loadingPage {
            min-height: 100vh;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #64748b;
          }

          .loadingBox {
            padding: 30px;
            font-size: 14px;
            font-weight: 800;
          }
        `}</style>
      </main>
    );
  }

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
            padding: 30px;
            color: #be123c;
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
          padding: 20px;
          box-sizing: border-box;
        }

        .container {
          max-width: 1350px;
          margin: 0 auto;
        }

        .header {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          overflow: hidden;
          box-shadow:
            0 6px 25px rgba(15, 23, 42, 0.05);
          margin-bottom: 14px;
        }

        .headerTop {
          height: 54px;
          padding: 0 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
        }

        .back {
          height: 34px;
          padding: 0 12px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #374151;
          border-radius: 9px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .back:hover {
          border-color: #ff174f;
          color: #ff174f;
          background: #fff7f9;
        }

        .status {
          padding: 6px 11px;
          border-radius: 999px;
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          color: #15803d;
          font-size: 9px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .headerBody {
          padding: 18px 20px;
        }

        .eyebrow {
          color: #ff174f;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: .15em;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .title {
          margin: 0;
          color: #111827;
          font-size: 25px;
          line-height: 1.2;
          font-weight: 950;
        }

        .meta {
          margin-top: 7px;
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          align-items: center;
        }

        .dot {
          color: #cbd5e1;
        }

        .toolbar {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 12px;
        }

        .search {
          flex: 1;
          height: 40px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          border-radius: 10px;
          padding: 0 13px;
          color: #111827;
          outline: none;
        }

        .search:focus {
          border-color: #ff174f;
          box-shadow:
            0 0 0 3px
            rgba(255, 23, 79, .07);
        }

        .refresh {
          height: 40px;
          padding: 0 13px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #374151;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 900;
        }

        .refresh:hover {
          border-color: #ff174f;
          color: #ff174f;
        }

        .stats {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }

        .stat {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 13px;
        }

        .statLabel {
          color: #64748b;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .08em;
        }

        .statValue {
          margin-top: 5px;
          font-size: 18px;
          color: #111827;
          font-weight: 950;
        }

        .statGreen {
          color: #15803d;
        }

        .statRed {
          color: #ff174f;
        }

        .message {
          margin-bottom: 12px;
          padding: 11px 13px;
          border-radius: 10px;
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          color: #15803d;
          font-size: 11px;
          font-weight: 800;
        }

        .error {
          margin-bottom: 12px;
          padding: 11px 13px;
          border-radius: 10px;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #be123c;
          font-size: 11px;
          font-weight: 800;
        }

        .tableCard {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 15px;
          overflow: hidden;
          box-shadow:
            0 6px 25px rgba(15, 23, 42, 0.04);
        }

        .tableScroll {
          width: 100%;
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 900px;
          border-collapse: collapse;
        }

        th {
          height: 43px;
          padding: 0 12px;
          background: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
          color: #64748b;
          text-align: left;
          font-size: 8px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          font-size: 11px;
          color: #374151;
        }

        tr:last-child td {
          border-bottom: 0;
        }

        tr:hover td {
          background: #fffafb;
        }

        .rankSelect {
          width: 145px;
          height: 35px;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: #ffffff;
          color: #111827;
          padding: 0 8px;
          font-size: 10px;
          font-weight: 800;
          outline: none;
        }

        .rankSelect:focus {
          border-color: #ff174f;
        }

        .playerButton {
          border: 0;
          background: transparent;
          padding: 0;
          cursor: pointer;
          text-align: left;
          color: #111827;
          font-weight: 950;
          font-size: 12px;
        }

        .playerButton:hover {
          color: #ff174f;
        }

        .playerUid {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 8px;
        }

        .numberInput {
          width: 80px;
          height: 35px;
          box-sizing: border-box;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          background: #ffffff;
          color: #111827;
          padding: 0 9px;
          outline: none;
          font-size: 11px;
          font-weight: 800;
        }

        .numberInput:focus {
          border-color: #ff174f;
        }

        .winningInput {
          width: 105px;
          height: 35px;
          box-sizing: border-box;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          background: #f0fdf4;
          color: #15803d;
          padding: 0 9px;
          outline: none;
          font-size: 11px;
          font-weight: 950;
        }

        .calculation {
          color: #64748b;
          font-size: 9px;
          line-height: 1.5;
        }

        .calculation strong {
          color: #15803d;
        }

        .saveBar {
          margin-top: 13px;
          display: flex;
          justify-content: flex-end;
          gap: 9px;
        }

        .saveButton {
          height: 42px;
          padding: 0 18px;
          border: 0;
          border-radius: 10px;
          background: #ff174f;
          color: #ffffff;
          cursor: pointer;
          font-size: 11px;
          font-weight: 950;
          box-shadow:
            0 8px 22px
            rgba(255, 23, 79, .18);
        }

        .saveButton:hover {
          background: #e91548;
        }

        .saveButton:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .cancelButton {
          height: 42px;
          padding: 0 15px;
          border: 1px solid #dbe2ea;
          border-radius: 10px;
          background: #ffffff;
          color: #374151;
          cursor: pointer;
          font-size: 11px;
          font-weight: 900;
        }

        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, .55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 100;
        }

        .modal {
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
          background: #ffffff;
          border-radius: 18px;
          box-shadow:
            0 30px 80px rgba(15, 23, 42, .25);
        }

        .modalHeader {
          padding: 17px 18px;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .modalHeader h2 {
          margin: 0;
          font-size: 16px;
          color: #111827;
          font-weight: 950;
        }

        .close {
          width: 32px;
          height: 32px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          cursor: pointer;
          font-size: 18px;
          color: #64748b;
        }

        .modalBody {
          padding: 18px;
        }

        .profileTop {
          display: flex;
          align-items: center;
          gap: 13px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f1f5f9;
          margin-bottom: 15px;
        }

        .avatar {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          background: #ffe4ea;
          color: #ff174f;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-size: 22px;
          font-weight: 950;
          flex-shrink: 0;
        }

        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .profileName {
          font-size: 16px;
          font-weight: 950;
          color: #111827;
        }

        .profileSub {
          margin-top: 4px;
          color: #64748b;
          font-size: 10px;
        }

        .details {
          display: grid;
          gap: 10px;
        }

        .detail {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 10px;
          padding-bottom: 9px;
          border-bottom: 1px solid #f1f5f9;
        }

        .detailLabel {
          color: #94a3b8;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .detailValue {
          color: #374151;
          font-size: 10px;
          font-weight: 750;
          word-break: break-word;
        }

        @media (max-width: 800px) {

          .page {
            padding: 12px;
          }

          .stats {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .title {
            font-size: 21px;
          }

          .toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .search {
            width: 100%;
          }

          .refresh {
            width: 100%;
          }

          .saveBar {
            flex-direction: column;
          }

          .saveButton,
          .cancelButton {
            width: 100%;
          }
        }

      `}</style>

      <div className="container">

        {/* HEADER */}
        <section className="header">

          <div className="headerTop">

            <button
              className="back"
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
            {message}
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

            <div className="statValue statRed">
              {money(
                tournament.kill_reward
              )}
            </div>
          </div>

          <div className="stat">
            <div className="statLabel">
              Total Winning
            </div>

            <div className="statValue statGreen">
              {money(totalWinning)}
            </div>
          </div>

        </div>

        {/* TOOLBAR */}
        <div className="toolbar">

          <input
            className="search"
            placeholder="Search player by in-game name, UID or email..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />

          <button
            className="refresh"
            onClick={loadData}
          >
            ↻ Refresh
          </button>

        </div>

        {/* TABLE */}
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
                    Prize
                  </th>

                  <th>
                    Kills
                  </th>

                  <th>
                    Kill Amount
                  </th>

                  <th>
                    Winning Amount
                  </th>

                </tr>
              </thead>

              <tbody>

                {filteredParticipants.length ===
                0 ? (

                  <tr>
                    <td
                      colSpan="7"
                      style={{
                        textAlign:
                          "center",
                        padding:
                          "45px",
                        color:
                          "#64748b",
                        fontWeight:
                          700,
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

                      const name =
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
                        (Number(
                          result.kills
                        ) || 0) *
                        (Number(
                          tournament.kill_reward
                        ) || 0);

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
                              onChange={(
                                event
                              ) =>
                                updateResult(
                                  player.user_id,
                                  "rank",
                                  event.target
                                    .value
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

                          {/* PLAYER */}
                          <td>

                            <button
                              className="playerButton"
                              onClick={() =>
                                openPlayer(
                                  player
                                )
                              }
                            >
                              {name}
                            </button>

                            <div className="playerUid">
                              UID:{" "}
                              {player.free_fire_uid ||
                                user?.free_fire_uid ||
                                "—"}
                            </div>

                          </td>

                          {/* PRIZE */}
                          <td>

                            <div
                              style={{
                                fontWeight: 950,
                                color:
                                  rankPrize >
                                  0
                                    ? "#15803d"
                                    : "#94a3b8",
                              }}
                            >
                              {money(
                                rankPrize
                              )}
                            </div>

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
                              onChange={(
                                event
                              ) =>
                                updateResult(
                                  player.user_id,
                                  "kills",
                                  event.target
                                    .value
                                )
                              }
                            />

                          </td>

                          {/* KILL AMOUNT */}
                          <td>

                            <div className="calculation">

                              {Number(
                                result.kills
                              ) || 0}{" "}
                              ×{" "}
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
                              onChange={(
                                event
                              ) =>
                                updateResult(
                                  player.user_id,
                                  "winning_amount",
                                  event.target
                                    .value
                                )
                              }
                            />

                            <div
                              className="calculation"
                              style={{
                                marginTop: 4,
                              }}
                            >
                              {money(
                                rankPrize
                              )}{" "}
                              +{" "}
                              {money(
                                killAmount
                              )}
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

        {/* SAVE */}
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

      {/* PLAYER POPUP */}
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

              const name =
                getPlayerName(
                  selectedPlayer,
                  user
                );

              return (
                <>
                  <div className="modalHeader">

                    <h2>
                      Player Details
                    </h2>

                    <button
                      className="close"
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
                          {name}
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
                          {name}
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
                          Joined
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