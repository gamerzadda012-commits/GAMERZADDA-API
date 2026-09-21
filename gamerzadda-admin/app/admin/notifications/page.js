"use client";



import { useEffect, useState } from "react";



export default function AdminNotificationsPage() {

  const [title, setTitle] = useState("");

  const [message, setMessage] = useState("");

  const [type, setType] = useState("general");

  const [target, setTarget] = useState("all");

  const [userId, setUserId] = useState("");

    const [userSearch, setUserSearch] = useState("");

  const [redirectUrl, setRedirectUrl] = useState("");



  const [users, setUsers] = useState([]);

  const [history, setHistory] = useState([]);



  const [loading, setLoading] = useState(true);

  const [sending, setSending] = useState(false);

  const [status, setStatus] = useState("");



  async function loadData() {

    try {

      setLoading(true);



      const response = await fetch("/api/admin/notifications", {

        method: "GET",

        credentials: "include",

        cache: "no-store",

      });



      const data = await response.json();



      if (!response.ok) {

        setStatus(data.message || "Failed to load notifications.");

        return;

      }



      setUsers(Array.isArray(data.users) ? data.users : []);

      setHistory(
        Array.isArray(data.history)
          ? data.history
          : Array.isArray(data.notifications)
            ? data.notifications
            : []
      );

    } catch (error) {

      console.error("NOTIFICATION LOAD ERROR:", error);

      setStatus("❌ Network error while loading notifications.");

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    loadData();

  }, []);



  async function handleSend(e) {

    e.preventDefault();



    if (sending) return;



    setStatus("");



    const cleanTitle = title.trim();

    const cleanMessage = message.trim();

    const cleanRedirect = redirectUrl.trim();



    if (!cleanTitle) {

      setStatus("⚠️ Please enter notification title.");

      return;

    }



    if (!cleanMessage) {

      setStatus("⚠️ Please enter notification message.");

      return;

    }



    if (target === "user" && !userId) {

      setStatus("⚠️ Please select a user.");

      return;

    }



    setSending(true);



    try {

      const response = await fetch("/api/admin/notifications", {

        method: "POST",

        credentials: "include",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify({

          title: cleanTitle,

          message: cleanMessage,

          type,

          target,

          user_id: target === "user" ? userId : null,

          redirect_url: cleanRedirect || null,

        }),

      });



      const data = await response.json();



      if (!response.ok) {

        setStatus(

          `❌ ${data.message || "Failed to send notification."}`

        );

        return;

      }



      const sent = Number(data.sent ?? data.sent_count ?? 0);
      const failed = Number(data.failed ?? data.failed_count ?? 0);
      const targetCount = Number(
        data.targetUsers ?? data.target_count ?? 0
      );



      setStatus(

        `✅ Notification sent. Target: ${targetCount} | Sent: ${sent} | Failed: ${failed}`

      );



      setTitle("");

      setMessage("");

      setRedirectUrl("");

      setUserId("");
      setUserSearch("");

      setTarget("all");

      setType("general");



      await loadData();

    } catch (error) {

      console.error("NOTIFICATION SEND ERROR:", error);

      setStatus("❌ Network error while sending notification.");

    } finally {

      setSending(false);

    }

  }



  const normalizedUserSearch = userSearch.trim().toLowerCase();

  const filteredUsers = normalizedUserSearch
    ? users.filter((user) => {
        const name = String(user.full_name || "").toLowerCase();
        const email = String(user.email || "").toLowerCase();
        const phone = String(user.phone || "").toLowerCase();

        return (
          name.includes(normalizedUserSearch) ||
          email.includes(normalizedUserSearch) ||
          phone.includes(normalizedUserSearch)
        );
      })
    : users;

  return (

    <main className="notification-page">

      <style jsx>{`

        .notification-page {

          min-height: 100vh;

          padding: 22px;

          background:

            radial-gradient(

              circle at 85% 0%,

              rgba(255, 23, 79, 0.08),

              transparent 30%

            ),

            #070b12;

          color: #e9eef7;

        }



        .header {

          margin-bottom: 18px;

        }



        .eyebrow {

          color: #ff174f;

          font-size: 9px;

          font-weight: 900;

          letter-spacing: 1.8px;

        }



        h1 {

          margin: 5px 0 0;

          font-size: 25px;

          font-weight: 900;

        }



        .subtitle {

          margin-top: 5px;

          color: #718096;

          font-size: 11px;

        }



        .grid {

          display: grid;

          grid-template-columns:

            minmax(0, 1fr)

            minmax(320px, 0.8fr);

          gap: 14px;

        }



        .panel {

          padding: 16px;

          border: 1px solid #1d2a3b;

          border-radius: 12px;

          background: #0d1520;

        }



        .panel-title {

          margin: 0 0 14px;

          font-size: 13px;

          font-weight: 900;

        }



        .field {

          margin-bottom: 12px;

        }



        label {

          display: block;

          margin-bottom: 6px;

          color: #8a97aa;

          font-size: 9px;

          font-weight: 800;

          text-transform: uppercase;

          letter-spacing: 0.7px;

        }



        input,

        textarea,

        select {

          width: 100%;

          box-sizing: border-box;

          padding: 10px 11px;

          border: 1px solid #263448;

          border-radius: 8px;

          outline: none;

          background: #09111b;

          color: #eef3f9;

          font-size: 11px;

        }



        input:focus,

        textarea:focus,

        select:focus {

          border-color: #ff174f;

          box-shadow: 0 0 0 2px rgba(255, 23, 79, 0.08);

        }



        textarea {

          min-height: 110px;

          resize: vertical;

        }



        .targets {

          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 8px;

        }



        .target {

          padding: 11px;

          border: 1px solid #263448;

          border-radius: 8px;

          background: #09111b;

          color: #8e9bad;

          cursor: pointer;

          font-size: 10px;

          font-weight: 800;

          transition: 0.15s ease;

        }



        .target:hover {

          border-color: #52627a;

        }



        .target.active {

          border-color: #ff174f;

          background: rgba(255, 23, 79, 0.09);

          color: #fff;

        }



        .send {

          width: 100%;

          margin-top: 4px;

          padding: 12px;

          border: 0;

          border-radius: 9px;

          background: #ff174f;

          color: #fff;

          cursor: pointer;

          font-size: 11px;

          font-weight: 900;

          transition: 0.15s ease;

        }



        .send:hover {

          background: #e91447;

        }



        .send:disabled {

          opacity: 0.55;

          cursor: not-allowed;

        }



        .status {

          margin-top: 10px;

          padding: 9px 10px;

          border: 1px solid #243247;

          border-radius: 8px;

          background: #09111b;

          color: #b9c4d4;

          font-size: 10px;

          line-height: 1.5;

        }



        .history {

          display: grid;

          gap: 8px;

          max-height: 570px;

          overflow-y: auto;

          padding-right: 2px;

        }



        .history::-webkit-scrollbar {

          width: 4px;

        }



        .history::-webkit-scrollbar-track {

          background: transparent;

        }



        .history::-webkit-scrollbar-thumb {

          background: #263448;

          border-radius: 999px;

        }



        .notification {

          padding: 11px;

          border: 1px solid #1d2a3b;

          border-radius: 9px;

          background: #09111b;

        }



        .notification-top {

          display: flex;

          align-items: center;

          justify-content: space-between;

          gap: 8px;

        }



        .notification-title {

          min-width: 0;

          font-size: 11px;

          font-weight: 900;

          word-break: break-word;

        }



        .badge {

          flex-shrink: 0;

          padding: 3px 7px;

          border-radius: 999px;

          background: rgba(255, 23, 79, 0.1);

          color: #ff4964;

          font-size: 8px;

          font-weight: 900;

        }



        .notification-message {

          margin-top: 6px;

          color: #8d9aae;

          font-size: 10px;

          line-height: 1.5;

          white-space: pre-wrap;

          word-break: break-word;

        }



        .notification-date {

          margin-top: 7px;

          color: #59677b;

          font-size: 8px;

        }



        .notification-redirect {

          margin-top: 5px;

          color: #ff4964;

          font-size: 8px;

          word-break: break-all;

        }



        .empty {

          padding: 25px 0;

          color: #68778c;

          text-align: center;

          font-size: 10px;

        }



        .user-picker {
          position: relative;
        }

        .user-results {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 5px);
          z-index: 50;
          max-height: 250px;
          overflow-y: auto;
          border: 1px solid #263448;
          border-radius: 9px;
          background: #0b1420;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
        }

        .user-result {
          display: flex;
          width: 100%;
          flex-direction: column;
          gap: 3px;
          padding: 10px 11px;
          border: 0;
          border-bottom: 1px solid #1b2737;
          background: transparent;
          color: #eef3f9;
          text-align: left;
          cursor: pointer;
        }

        .user-result:last-child {
          border-bottom: 0;
        }

        .user-result:hover,
        .user-result.selected {
          background: rgba(255, 23, 79, 0.10);
        }

        .user-result-name {
          font-size: 10px;
          font-weight: 900;
        }

        .user-result-meta {
          color: #718096;
          font-size: 8px;
          word-break: break-word;
        }

        .user-no-results {
          padding: 12px;
          color: #718096;
          font-size: 9px;
          text-align: center;
        }

        .user-selected {
          margin-top: 6px;
          color: #43d17a;
          font-size: 8px;
          font-weight: 800;
        }

        .user-count {

          margin-top: 7px;

          color: #59677b;

          font-size: 8px;

        }



        @media (max-width: 850px) {

          .grid {

            grid-template-columns: 1fr;

          }

        }



        @media (max-width: 600px) {

          .notification-page {

            padding: 14px;

          }



          h1 {

            font-size: 21px;

          }



          .targets {

            grid-template-columns: 1fr;

          }

        }

      `}</style>



      <div className="header">

        <div className="eyebrow">

          GAMERZADDA CONTROL CENTER

        </div>



        <h1>Notifications</h1>



        <div className="subtitle">

          Send FCM notifications directly to GAMERZADDA users.

        </div>

      </div>



      <div className="grid">

        {/* SEND PANEL */}

        <section className="panel">

          <h2 className="panel-title">

            🔔 Send Notification

          </h2>



          <form onSubmit={handleSend}>

            <div className="field">

              <label>Notification Title</label>



              <input

                value={title}

                onChange={(e) => setTitle(e.target.value)}

                placeholder="New Tournament Available"

                maxLength={120}

                disabled={sending}

              />

            </div>



            <div className="field">

              <label>Message</label>



              <textarea

                value={message}

                onChange={(e) => setMessage(e.target.value)}

                placeholder="Write your notification message..."

                maxLength={1000}

                disabled={sending}

              />



              <div className="user-count">

                {message.length}/1000

              </div>

            </div>



            <div className="field">

              <label>Notification Type</label>



              <select

                value={type}

                onChange={(e) => setType(e.target.value)}

                disabled={sending}

              >

                <option value="general">

                  General

                </option>



                <option value="tournament">

                  Tournament

                </option>



                <option value="wallet">

                  Wallet

                </option>



                <option value="support">

                  Support

                </option>



                <option value="important">

                  Important

                </option>

              </select>

            </div>



            <div className="field">

              <label>Send To</label>



              <div className="targets">

                <button

                  type="button"

                  className={`target ${

                    target === "all" ? "active" : ""

                  }`}

                  onClick={() => {

                    if (sending) return;



                    setTarget("all");

                    setUserId("");

                  }}

                >

                  👥 All Users

                </button>



                <button

                  type="button"

                  className={`target ${

                    target === "user" ? "active" : ""

                  }`}

                  onClick={() => {

                    if (sending) return;



                    setTarget("user");

                  }}

                >

                  👤 Specific User

                </button>

              </div>

            </div>



            {target === "user" && (
              <div className="field">
                <label>Select User</label>

                <div className="user-picker">
                  <input
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      if (userId) setUserId("");
                    }}
                    placeholder="🔍 Search name, email or phone..."
                    disabled={sending}
                    autoComplete="off"
                  />

                  {userSearch.trim() && (
                    <div className="user-results">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.slice(0, 50).map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            className={`user-result ${user.id === userId ? "selected" : ""}`}
                            onClick={() => {
                              setUserId(user.id);
                              setUserSearch(
                                [user.full_name, user.email, user.phone]
                                  .filter(Boolean)
                                  .join(" • ") || user.id
                              );
                            }}
                            disabled={sending}
                          >
                            <span className="user-result-name">
                              👤 {user.full_name || "Unnamed User"}
                            </span>
                            <span className="user-result-meta">
                              {[user.email, user.phone]
                                .filter(Boolean)
                                .join(" • ") || user.id}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="user-no-results">
                          No user found for “{userSearch}”
                        </div>
                      )}
                    </div>
                  )}

                  {userId && (
                    <div className="user-selected">
                      ✓ User selected
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="field">

              <label>

                Redirect URL (Optional)

              </label>



              <input

                value={redirectUrl}

                onChange={(e) =>

                  setRedirectUrl(e.target.value)

                }

                placeholder="/freefire/tournaments"

                maxLength={500}

                disabled={sending}

              />



              <div className="user-count">

                Example: /freefire

                {" • "}

                /freefire/tournament/TOURNAMENT_ID

                {" • "}

                /wallet

              </div>

            </div>



            <button

              type="submit"

              className="send"

              disabled={sending}

            >

              {sending

                ? "⏳ SENDING..."

                : "🚀 SEND NOTIFICATION"}

            </button>



            {status && (

              <div className="status">

                {status}

              </div>

            )}

          </form>

        </section>



        {/* HISTORY PANEL */}

        <section className="panel">

          <h2 className="panel-title">

            📜 Sent Notifications

          </h2>



          {loading ? (

            <div className="empty">

              Loading...

            </div>

          ) : history.length === 0 ? (

            <div className="empty">

              No notifications sent yet.

            </div>

          ) : (

            <div className="history">

              {history.map((item) => (

                <div

                  className="notification"

                  key={item.id}

                >

                  <div className="notification-top">

                    <div className="notification-title">

                      {item.title}

                    </div>



                    <div className="badge">

                      {item.user_id

                        ? "USER"

                        : "ALL"}

                    </div>

                  </div>



                  <div className="notification-message">

                    {item.message}

                  </div>



                  {item.redirect_url && (

                    <div className="notification-redirect">

                      ↗ {item.redirect_url}

                    </div>

                  )}



                  <div className="notification-date">

                    {item.type || "general"}

                    {" · "}

                    {item.created_at

                      ? new Date(

                          item.created_at

                        ).toLocaleString("en-IN")

                      : ""}

                  </div>

                </div>

              ))}

            </div>

          )}

        </section>

      </div>

    </main>

  );

}