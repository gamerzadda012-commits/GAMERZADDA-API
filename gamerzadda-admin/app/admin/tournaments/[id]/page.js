"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabase.js";

const GAMES = [
  "Free Fire",
  "Free Fire MAX",
  "Clash Squad",
  "Lone Wolf",
];

const MODES = [
  "Solo",
  "Duo",
  "Squad",
];

const MAPS = [
  "Bermuda Classic",
  "Purgatory",
  "Kalahari",
  "Alpine",
  "NexTerra",
];

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function localDateTime(value) {
  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  const pad = (n) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(value) {
  if (!value) {
    return "Not scheduled";
  }

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TournamentManagePage() {
  const params = useParams();
  const router = useRouter();

  const id = String(params?.id || "");

  const [tab, setTab] = useState("manage");

  const [tournament, setTournament] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [participants, setParticipants] = useState([]);

  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keysSaving, setKeysSaving] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    game: "Free Fire",
    mode: "Solo",
    entry_fee: "",
    prize_pool: "",
    kill_reward: "0",
    bonus_usable_percent: "0",
    max_players: "48",
    start_time: "",
    map: "Bermuda Classic",
    status: "upcoming",
  });

  function setField(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function loadAll() {
    if (!id || !supabase) {
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: tError } = await supabase
      .from("tournaments")
      .select(
        "id,title,game,mode,entry_fee,prize_pool,kill_reward,max_players,start_time,map,status,bonus_usable_percent,created_at,updated_at"
      )
      .eq("id", id)
      .single();

    if (tError) {
      setError(tError.message);
      setLoading(false);
      return;
    }

    setTournament(data);

    setForm({
      title: data.title || "",
      game: data.game || "Free Fire",
      mode: data.mode || "Solo",
      entry_fee: String(data.entry_fee ?? ""),
      prize_pool: String(data.prize_pool ?? ""),
      kill_reward: String(data.kill_reward ?? "0"),
      bonus_usable_percent: String(
        data.bonus_usable_percent ?? "0"
      ),
      max_players: String(data.max_players ?? "48"),
      start_time: localDateTime(data.start_time),
      map: data.map || "Bermuda Classic",
      status: data.status || "upcoming",
    });

    const { data: prizeData } = await supabase
      .from("tournament_prizes")
      .select("id,rank,label,amount")
      .eq("tournament_id", id)
      .order("rank", {
        ascending: true,
      });

    setPrizes(
      (prizeData || []).map((p) => ({
        ...p,
        rank: String(p.rank ?? ""),
        amount: String(p.amount ?? ""),
        label: p.label || "",
      }))
    );

    const { data: match } = await supabase
      .from("matches")
      .select("room_id,room_password")
      .eq("tournament_id", id)
      .order("id", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    setRoomId(match?.room_id || "");
    setRoomPassword(match?.room_password || "");

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, [id]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("edit") === "1"
    ) {
      setTab("edit");
    }
  }, []);

  async function saveTournament() {
    if (!supabase || !id) {
      return;
    }

    if (!form.title.trim()) {
      setError("Tournament title is required.");
      return;
    }

    if (!form.entry_fee || !form.prize_pool) {
      setError("Entry fee and prize pool are required.");
      return;
    }

    const bonus = Number(form.bonus_usable_percent);

    if (
      !Number.isFinite(bonus) ||
      bonus < 0 ||
      bonus > 100
    ) {
      setError("Bonus usable percentage must be 0-100.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const start = form.start_time
      ? new Date(form.start_time)
      : null;

    const payload = {
      title: form.title.trim(),
      game: form.game,
      mode: form.mode,
      entry_fee: Number(form.entry_fee) || 0,
      prize_pool: Number(form.prize_pool) || 0,
      kill_reward: Number(form.kill_reward) || 0,
      bonus_usable_percent: bonus,
      max_players: Number(form.max_players) || 48,
      start_time:
        start && !Number.isNaN(start.getTime())
          ? start.toISOString()
          : null,
      map: form.map,
      status: form.status,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("tournaments")
      .update(payload)
      .eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const cleanPrizes = prizes
      .filter((p) => Number(p.amount) > 0)
      .map((p, i) => ({
        tournament_id: id,
        rank: Number(p.rank) || i + 1,
        label:
          (p.label || `${i + 1}th Place`).trim(),
        amount: Number(p.amount) || 0,
      }));

    const { error: delError } = await supabase
      .from("tournament_prizes")
      .delete()
      .eq("tournament_id", id);

    if (delError) {
      setError(delError.message);
      setSaving(false);
      return;
    }

    if (cleanPrizes.length) {
      const { error: prizeError } = await supabase
        .from("tournament_prizes")
        .insert(cleanPrizes);

      if (prizeError) {
        setError(prizeError.message);
        setSaving(false);
        return;
      }
    }

    setMessage("Tournament updated successfully.");

    await loadAll();

    setSaving(false);
  }

  async function makeKeysLive() {
    if (!roomId.trim() || !roomPassword.trim()) {
      setError(
        "Enter Room ID and Room Password first."
      );
      return;
    }

    setKeysSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/admin/keys",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            tournamentId: id,
            roomId: roomId.trim(),
            roomPassword: roomPassword.trim(),
          }),
        }
      );

      const result = await response
        .json()
        .catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error ||
            "Failed to make keys live."
        );
      }

      setMessage(
        "🔴 Room ID & Password are LIVE. Registered players can receive the room details."
      );

      setForm((prev) => ({
        ...prev,
        status: "live",
      }));

      await loadAll();
    } catch (e) {
      setError(
        e?.message ||
          "Failed to make keys live."
      );
    }

    setKeysSaving(false);
  }

  async function loadParticipants() {
    if (!supabase || !id) {
      return;
    }

    setParticipantsLoading(true);
    setError("");

    const { data, error: pError } =
      await supabase
        .from("tournament_entries")
        .select(
          "id,user_id,game_name,free_fire_uid,level,created_at,cancelled,users(full_name,email,game_name,free_fire_uid,level,bio,avatar_url)"
        )
        .eq("tournament_id", id)
        .eq("cancelled", false)
        .order("created_at", {
          ascending: true,
        });

    if (pError) {
      setError(pError.message);
    } else {
      setParticipants(data || []);
    }

    setParticipantsLoading(false);
  }

  useEffect(() => {
    if (tab === "manage") {
      loadParticipants();
    }
  }, [tab, id]);

  function addPrize() {
    setPrizes((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        rank: String(prev.length + 1),
        label: `${prev.length + 1}th Place`,
        amount: "",
      },
    ]);
  }

  function updatePrize(index, key, value) {
    setPrizes((prev) =>
      prev.map((p, i) =>
        i === index
          ? {
              ...p,
              [key]: value,
            }
          : p
      )
    );
  }

  function removePrize(index) {
    setPrizes((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((p, i) => ({
          ...p,
          rank: String(i + 1),
          label:
            p.label ||
            `${i + 1}th Place`,
        }))
    );
  }

  if (!supabase) {
    return (
      <main className="page">
        <div className="errorBox">
          Supabase configuration missing.
          Check your NEXT_PUBLIC_SUPABASE_URL
          and NEXT_PUBLIC_SUPABASE_ANON_KEY /
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: #f8fafc;
            padding: 40px;
            color: #111827;
          }

          .errorBox {
            padding: 30px;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 16px;
          }
        `}</style>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="page">
        <div className="loader">
          Loading tournament...
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: #f8fafc;
            color: #111827;
            padding: 40px;
          }

          .loader {
            padding: 50px;
            text-align: center;
            color: #64748b;
            font-weight: 700;
          }
        `}</style>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="page">
        <div className="errorBox">
          Tournament not found.
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: #f8fafc;
            color: #111827;
            padding: 40px;
          }

          .errorBox {
            padding: 30px;
            background: #fff;
            border: 1px solid #fecdd3;
            border-radius: 16px;
            color: #be123c;
            font-weight: 800;
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
          padding: 24px;
          box-sizing: border-box;
          background: #f8fafc;
          color: #111827;
        }

        .wrap {
          max-width: 1180px;
          margin: 0 auto;
        }

        .headerCard {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          overflow: hidden;
          margin-bottom: 16px;
          box-shadow: 0 8px 30px rgba(15, 23, 42, 0.05);
        }

        .headerTop {
          min-height: 58px;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
          background: #ffffff;
        }

        .back {
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #374151;
          border-radius: 10px;
          padding: 9px 13px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 800;
          transition: all 0.2s ease;
        }

        .back:hover {
          color: #ff174f;
          border-color: #ff174f;
          background: #fff7f9;
        }

        .headerContent {
          padding: 22px 24px 24px;
        }

        .eyebrow {
          color: #ff174f;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 7px;
        }

        .title {
          margin: 0;
          color: #111827;
          font-size: 30px;
          line-height: 1.15;
          font-weight: 950;
          letter-spacing: -0.025em;
        }

        .meta {
          margin-top: 9px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 7px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.5;
          font-weight: 600;
        }

        .dot {
          color: #cbd5e1;
          font-weight: 900;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 82px;
          padding: 7px 12px;
          border-radius: 999px;
          background: #ecfdf5;
          color: #15803d;
          border: 1px solid #bbf7d0;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .tabs {
          display: flex;
          gap: 8px;
          padding: 7px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 15px;
          margin-bottom: 16px;
          box-shadow: 0 4px 18px rgba(15, 23, 42, 0.03);
        }

        .tab {
          flex: 1;
          border: 0;
          border-radius: 10px;
          padding: 12px;
          cursor: pointer;
          background: transparent;
          color: #64748b;
          font-weight: 950;
        }

        .tab.active {
          background: #ff174f;
          color: #ffffff;
          box-shadow: 0 8px 24px rgba(255, 23, 79, 0.18);
        }

        .grid {
          display: grid;
          grid-template-columns: 1.4fr 0.8fr;
          gap: 15px;
        }

        .card {
          border: 1px solid #e5e7eb;
          border-radius: 17px;
          background: #ffffff;
          padding: 18px;
          box-shadow: 0 8px 30px rgba(15, 23, 42, 0.04);
        }

        .card h2 {
          font-size: 15px;
          margin: 0 0 14px;
          color: #111827;
        }

        .fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .field.full {
          grid-column: 1 / -1;
        }

        .field label {
          display: block;
          color: #64748b;
          font-size: 9px;
          font-weight: 900;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .input,
        .select {
          width: 100%;
          height: 43px;
          box-sizing: border-box;
          border: 1px solid #dbe2ea;
          border-radius: 10px;
          background: #ffffff;
          color: #111827;
          padding: 0 12px;
          outline: none;
        }

        .input:focus,
        .select:focus {
          border-color: #ff174f;
          box-shadow: 0 0 0 3px rgba(255, 23, 79, 0.08);
        }

        .actions {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          margin-top: 15px;
        }

        .primary,
        .secondary,
        .danger {
          border-radius: 10px;
          padding: 11px 14px;
          font-weight: 950;
          cursor: pointer;
        }

        .primary {
          background: #ff174f;
          color: #ffffff;
          border: 0;
        }

        .secondary {
          background: #ffffff;
          color: #374151;
          border: 1px solid #dbe2ea;
        }

        .danger {
          background: #fff1f2;
          color: #e11d48;
          border: 1px solid #fecdd3;
        }

        .primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .notice {
          margin-bottom: 15px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          color: #15803d;
          font-size: 11px;
          font-weight: 800;
        }

        .err {
          margin-bottom: 15px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #be123c;
          font-size: 11px;
          font-weight: 800;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
        }

        .stat {
          padding: 13px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #f8fafc;
        }

        .stat small {
          display: block;
          color: #64748b;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .stat strong {
          display: block;
          margin-top: 5px;
          font-size: 17px;
          color: #111827;
        }

        .keyBox {
          border: 1px solid #fecdd3;
          background: #fff7f9;
          border-radius: 15px;
          padding: 14px;
        }

        .keyGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .liveBtn {
          width: 100%;
          margin-top: 9px;
          border: 0;
          border-radius: 10px;
          padding: 12px;
          background: #ff174f;
          color: #ffffff;
          font-weight: 950;
          cursor: pointer;
        }

        .participantList {
          display: grid;
          gap: 9px;
          max-height: 520px;
          overflow: auto;
        }

        .player {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 11px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #f8fafc;
        }

        .avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          object-fit: cover;
          background: #ffe4ea;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 950;
          color: #ff174f;
          flex-shrink: 0;
          overflow: hidden;
        }

        .pname {
          font-size: 12px;
          font-weight: 950;
          color: #111827;
        }

        .pmeta {
          font-size: 9px;
          color: #64748b;
          margin-top: 3px;
        }

        .empty {
          padding: 30px;
          text-align: center;
          color: #64748b;
          font-size: 11px;
        }

        .prizeRow {
          display: grid;
          grid-template-columns: 70px 1fr 140px 38px;
          gap: 8px;
          margin-bottom: 8px;
        }

        .remove {
          border: 1px solid #fecdd3;
          background: #fff1f2;
          color: #e11d48;
          border-radius: 9px;
          cursor: pointer;
        }

        .summary {
          padding: 13px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid #e5e7eb;
          margin-top: 12px;
        }

        .summaryLine {
          display: flex;
          justify-content: space-between;
          color: #64748b;
          font-size: 10px;
        }

        .summaryLine strong {
          color: #15803d;
        }

        .quick {
          display: grid;
          gap: 9px;
        }

        .quick button {
          border: 1px solid #e5e7eb;
          background: #ffffff;
          color: #374151;
          border-radius: 11px;
          padding: 12px;
          text-align: left;
          cursor: pointer;
          font-weight: 900;
        }

        .quick button:hover {
          border-color: #ff174f;
          color: #ff174f;
        }

        @media (max-width: 850px) {
          .page {
            padding: 14px;
          }

          .grid {
            grid-template-columns: 1fr;
          }

          .fields {
            grid-template-columns: 1fr;
          }

          .field.full {
            grid-column: auto;
          }

          .keyGrid {
            grid-template-columns: 1fr;
          }

          .prizeRow {
            grid-template-columns: 55px 1fr 100px 36px;
          }

          .title {
            font-size: 24px;
          }

          .headerContent {
            padding: 18px 16px 20px;
          }
        }
      `}</style>

      <div className="wrap">

        {/* HEADER */}
        <div className="headerCard">

          <div className="headerTop">
            <button
              className="back"
              onClick={() =>
                router.push("/admin/tournaments")
              }
            >
              ← Back
            </button>

            <span className="badge">
              {tournament.status || "upcoming"}
            </span>
          </div>

          <div className="headerContent">

            <div className="eyebrow">
              Tournament Control Center
            </div>

            <h1 className="title">
              {tournament.title}
            </h1>

            <div className="meta">
              <span>{tournament.game}</span>

              <span className="dot">
                •
              </span>

              <span>{tournament.mode}</span>

              <span className="dot">
                •
              </span>

              <span>
                {tournament.map || "No map"}
              </span>

              <span className="dot">
                •
              </span>

              <span>
                Starts{" "}
                {fmtDate(tournament.start_time)}
              </span>
            </div>

          </div>
        </div>

        {/* TABS */}
        <div className="tabs">

          <button
            className={`tab ${
              tab === "manage"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setTab("manage")
            }
          >
            ⚡ MANAGE
          </button>

          <button
            className={`tab ${
              tab === "edit"
                ? "active"
                : ""
            }`}
            onClick={() =>
              setTab("edit")
            }
          >
            ✏️ EDIT TOURNAMENT
          </button>

        </div>

        {message && (
          <div className="notice">
            {message}
          </div>
        )}

        {error && (
          <div className="err">
            ⚠️ {error}
          </div>
        )}

        {/* EDIT */}
        {tab === "edit" ? (

          <div className="grid">

            <section className="card">

              <h2>
                ✏️ Full Tournament Details
              </h2>

              <div className="fields">

                <div className="field full">
                  <label>
                    Tournament Title
                  </label>

                  <input
                    className="input"
                    value={form.title}
                    onChange={(e) =>
                      setField(
                        "title",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Game
                  </label>

                  <select
                    className="select"
                    value={form.game}
                    onChange={(e) =>
                      setField(
                        "game",
                        e.target.value
                      )
                    }
                  >
                    {GAMES.map((game) => (
                      <option
                        key={game}
                        value={game}
                      >
                        {game}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Mode
                  </label>

                  <select
                    className="select"
                    value={form.mode}
                    onChange={(e) =>
                      setField(
                        "mode",
                        e.target.value
                      )
                    }
                  >
                    {MODES.map((mode) => (
                      <option
                        key={mode}
                        value={mode}
                      >
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Entry Fee
                  </label>

                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={form.entry_fee}
                    onChange={(e) =>
                      setField(
                        "entry_fee",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Prize Pool
                  </label>

                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={form.prize_pool}
                    onChange={(e) =>
                      setField(
                        "prize_pool",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Kill Reward
                  </label>

                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={form.kill_reward}
                    onChange={(e) =>
                      setField(
                        "kill_reward",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Bonus Usable %
                  </label>

                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="100"
                    value={
                      form.bonus_usable_percent
                    }
                    onChange={(e) =>
                      setField(
                        "bonus_usable_percent",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Maximum Players
                  </label>

                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={form.max_players}
                    onChange={(e) =>
                      setField(
                        "max_players",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Map
                  </label>

                  <select
                    className="select"
                    value={form.map}
                    onChange={(e) =>
                      setField(
                        "map",
                        e.target.value
                      )
                    }
                  >
                    {MAPS.map((map) => (
                      <option
                        key={map}
                        value={map}
                      >
                        {map}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Start Time
                  </label>

                  <input
                    className="input"
                    type="datetime-local"
                    value={form.start_time}
                    onChange={(e) =>
                      setField(
                        "start_time",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Status
                  </label>

                  <select
                    className="select"
                    value={form.status}
                    onChange={(e) =>
                      setField(
                        "status",
                        e.target.value
                      )
                    }
                  >
                    <option value="upcoming">
                      Upcoming
                    </option>

                    <option value="live">
                      Live
                    </option>

                    <option value="disabled">
                      Disabled
                    </option>

                    <option value="completed">
                      Completed
                    </option>
                  </select>
                </div>

              </div>

              <div className="actions">

                <button
                  className="primary"
                  disabled={saving}
                  onClick={saveTournament}
                >
                  {saving
                    ? "SAVING..."
                    : "💾 SAVE ALL CHANGES"}
                </button>

                <button
                  className="secondary"
                  onClick={() =>
                    setTab("manage")
                  }
                >
                  Cancel
                </button>

              </div>

            </section>

            {/* PRIZES */}
            <aside className="card">

              <h2>
                🏆 Prize Distribution
              </h2>

              {prizes.map((prize, index) => (
                <div
                  className="prizeRow"
                  key={prize.id || index}
                >

                  <input
                    className="input"
                    value={prize.rank}
                    onChange={(e) =>
                      updatePrize(
                        index,
                        "rank",
                        e.target.value
                      )
                    }
                    placeholder="#"
                  />

                  <input
                    className="input"
                    value={prize.label}
                    onChange={(e) =>
                      updatePrize(
                        index,
                        "label",
                        e.target.value
                      )
                    }
                    placeholder="Label"
                  />

                  <input
                    className="input"
                    type="number"
                    value={prize.amount}
                    onChange={(e) =>
                      updatePrize(
                        index,
                        "amount",
                        e.target.value
                      )
                    }
                    placeholder="Amount"
                  />

                  <button
                    className="remove"
                    onClick={() =>
                      removePrize(index)
                    }
                  >
                    ×
                  </button>

                </div>
              ))}

              <button
                className="secondary"
                style={{
                  width: "100%",
                  marginTop: 5,
                }}
                onClick={addPrize}
              >
                ＋ Add Prize
              </button>

              <div className="summary">

                <div className="summaryLine">
                  <span>
                    Configured prizes
                  </span>

                  <strong>
                    {money(
                      prizes.reduce(
                        (sum, prize) =>
                          sum +
                          (Number(
                            prize.amount
                          ) || 0),
                        0
                      )
                    )}
                  </strong>
                </div>

                <div
                  className="summaryLine"
                  style={{
                    marginTop: 7,
                  }}
                >
                  <span>
                    Prize pool
                  </span>

                  <strong>
                    {money(form.prize_pool)}
                  </strong>
                </div>

              </div>

            </aside>

          </div>

        ) : (

          /* MANAGE */
          <div className="grid">

            <div
              style={{
                display: "grid",
                gap: 15,
              }}
            >

              {/* ROOM */}
              <section className="card">

                <h2>
                  🔑 Room Control
                </h2>

                <div className="keyBox">

                  <div className="keyGrid">

                    <input
                      className="input"
                      value={roomId}
                      onChange={(e) =>
                        setRoomId(
                          e.target.value
                        )
                      }
                      placeholder="Room ID"
                    />

                    <input
                      className="input"
                      value={roomPassword}
                      onChange={(e) =>
                        setRoomPassword(
                          e.target.value
                        )
                      }
                      placeholder="Room Password"
                    />

                  </div>

                  <button
                    className="liveBtn"
                    disabled={keysSaving}
                    onClick={makeKeysLive}
                  >
                    {keysSaving
                      ? "GOING LIVE..."
                      : "🔴 MAKE KEYS LIVE"}
                  </button>

                </div>

              </section>

              {/* PARTICIPANTS */}
              <section className="card">

                <h2>
                  👥 Participants{" "}
                  <span
                    style={{
                      color: "#15803d",
                      fontSize: 12,
                    }}
                  >
                    ({participants.length})
                  </span>
                </h2>

                {participantsLoading ? (

                  <div className="empty">
                    Loading participants...
                  </div>

                ) : participants.length === 0 ? (

                  <div className="empty">
                    No active participants yet.
                  </div>

                ) : (

                  <div className="participantList">

                    {participants.map(
                      (participant, index) => {

                        const user =
                          Array.isArray(
                            participant.users
                          )
                            ? participant.users[0]
                            : participant.users;

                        const name =
                          participant.game_name ||
                          user?.game_name ||
                          user?.full_name ||
                          `Player ${index + 1}`;

                        return (
                          <div
                            className="player"
                            key={participant.id}
                          >

                            <div className="avatar">

                              {user?.avatar_url ? (

                                <img
                                  src={
                                    user.avatar_url
                                  }
                                  alt=""
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    borderRadius:
                                      "50%",
                                    objectFit:
                                      "cover",
                                  }}
                                />

                              ) : (
                                "👤"
                              )}

                            </div>

                            <div
                              style={{
                                minWidth: 0,
                                flex: 1,
                              }}
                            >

                              <div className="pname">
                                #{index + 1}{" "}
                                {name}
                              </div>

                              <div className="pmeta">
                                UID:{" "}
                                {participant.free_fire_uid ||
                                  user?.free_fire_uid ||
                                  "—"}{" "}
                                • Level:{" "}
                                {participant.level ??
                                  user?.level ??
                                  "—"}
                              </div>

                              <div className="pmeta">
                                {user?.full_name ||
                                  ""}

                                {user?.email
                                  ? ` • ${user.email}`
                                  : ""}
                              </div>

                            </div>

                          </div>
                        );
                      }
                    )}

                  </div>
                )}

              </section>

            </div>

            {/* RIGHT SIDE */}
            <aside
              style={{
                display: "grid",
                gap: 15,
                alignContent: "start",
              }}
            >

              <section className="card">

                <h2>
                  🎮 Match Snapshot
                </h2>

                <div className="stats">

                  <div className="stat">
                    <small>
                      Entry
                    </small>

                    <strong>
                      {money(
                        tournament.entry_fee
                      )}
                    </strong>
                  </div>

                  <div className="stat">
                    <small>
                      Prize
                    </small>

                    <strong
                      style={{
                        color: "#15803d",
                      }}
                    >
                      {money(
                        tournament.prize_pool
                      )}
                    </strong>
                  </div>

                  <div className="stat">
                    <small>
                      Players
                    </small>

                    <strong>
                      {participants.length}/
                      {tournament.max_players ||
                        48}
                    </strong>
                  </div>

                </div>

              </section>

              {/* QUICK ACTIONS */}
              <section className="card">

                <h2>
                  ⚡ Quick Actions
                </h2>

                <div className="quick">

                  <button
                    onClick={() =>
                      router.push(
                        `/admin/tournaments/${id}/participants`
                      )
                    }
                  >
                    👥 Open Full Participants Page →
                  </button>

                  <button
                    onClick={() =>
                      router.push(
                        `/admin/tournaments/${id}/results`
                      )
                    }
                  >
                    🏆 Enter / Update Results →
                  </button>

                  <button
                    onClick={() =>
                      setTab("edit")
                    }
                  >
                    ✏️ Edit Full Tournament →
                  </button>

                </div>

              </section>

            </aside>

          </div>
        )}

      </div>
    </main>
  );
}