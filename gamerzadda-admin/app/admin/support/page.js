 "use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://api.gamerzadda.in";

export default function Page() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [member, setMember] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [conversationProfiles, setConversationProfiles] = useState({});

  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const selectedId = selected?.id;

  async function api(url, options = {}) {
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      credentials: "include",
      cache: "no-store",
      headers: {
        ...(options.headers || {}),
        "Content-Type": "application/json",
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  async function loadConversations(silent = false) {
    try {
      if (!silent) setLoading(true);
      setError("");

      const data = await api("/api/admin/support");
      const list = data.conversations || [];
      setConversations(list);

      // Load real profile data for the conversation list so each chat shows
      // the user's real name and profile photo instead of the fallback User/UID.
      const profileEntries = await Promise.all(
        list.map(async (conversation) => {
          const userId = conversation.user_id;
          if (!userId) return [String(conversation.id), null];

          try {
            const profile = await api(
              `/api/admin/members?userId=${encodeURIComponent(userId)}`
            );
            return [String(conversation.id), profile.member || null];
          } catch {
            return [String(conversation.id), null];
          }
        })
      );

      setConversationProfiles((prev) => ({
        ...prev,
        ...Object.fromEntries(profileEntries),
      }));

      if (selectedId) {
        const updated = list.find(
          (item) => String(item.id) === String(selectedId)
        );
        if (updated) setSelected(updated);
      }
    } catch (err) {
      setError(err.message || "Unable to load support.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadMessages(conversationId, silent = false) {
    if (!conversationId) return;

    try {
      if (!silent) setMessagesLoading(true);

      const data = await api(
        `/api/admin/support/${conversationId}`
      );

      setMessages(data.messages || []);

      if (data.conversation) {
        setSelected(data.conversation);
      }
    } catch (err) {
      setError(err.message || "Unable to load messages.");
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }

  async function loadMember(userId) {
    if (!userId) return;

    setMemberLoading(true);
    setMember(null);
    setWallet(null);

    try {
      // Load the exact member profile for this support conversation.
      // Do not call /api/admin/members without userId here because the
      // profile drawer needs the single real user record.
      const data = await api(
        `/api/admin/members?userId=${encodeURIComponent(userId)}`
      );

      setMember(data.member || null);
      setWallet(
        data.wallet || {
          deposit_balance: 0,
          bonus_balance: 0,
          winning_balance: 0,
        }
      );
    } catch (err) {
      console.error("SUPPORT MEMBER LOAD:", err);
    } finally {
      setMemberLoading(false);
    }
  }

  useEffect(() => {
    loadConversations();

    const timer = setInterval(() => {
      loadConversations(true);
    }, 8000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setMember(null);
      setWallet(null);
      return;
    }

    loadMessages(selectedId);
    loadMember(selected?.user_id);

    const timer = setInterval(() => {
      loadMessages(selectedId, true);
    }, 5000);

    return () => clearInterval(timer);
  }, [selectedId]);

  async function selectConversation(conversation) {
    setSelected(conversation);
    setMessages([]);
    setMobileChatOpen(true);
    setProfileOpen(false);
    setError("");
  }

  async function sendReply() {
    const text = reply.trim();
    if (!text || !selectedId || sending) return;

    try {
      setSending(true);
      setError("");

      const data = await api(
        `/api/admin/support/${selectedId}/message`,
        {
          method: "POST",
          body: JSON.stringify({ message: text }),
        }
      );

      setReply("");

      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      }

      await loadConversations(true);
    } catch (err) {
      setError(err.message || "Unable to send reply.");
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status) {
    if (!selectedId) return;

    try {
      setError("");

      const data = await api(
        `/api/admin/support/${selectedId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );

      setSelected(data.conversation);

      setConversations((prev) =>
        prev.map((item) =>
          String(item.id) === String(selectedId)
            ? data.conversation
            : item
        )
      );
    } catch (err) {
      setError(err.message || "Unable to update conversation.");
    }
  }

  const openCount = useMemo(
    () =>
      conversations.filter(
        (item) => item.status === "open"
      ).length,
    [conversations]
  );

  const closedCount = useMemo(
    () =>
      conversations.filter(
        (item) => item.status === "closed"
      ).length,
    [conversations]
  );

  function formatDate(value) {
    if (!value) return "—";

    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function money(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
  }

  function shortId(value) {
    const id = String(value || "");
    if (!id) return "—";
    return `${id.slice(0, 8)}...${id.slice(-6)}`;
  }

  return (
    <AdminShell title="Support">
      <div className="support-page">
        <div className="support-top">
          <div>
            <h1>Support Center</h1>
            <p>
              Manage GAMERZADDA user support conversations.
            </p>
          </div>

          <button
            className="refresh-btn"
            onClick={() => loadConversations()}
          >
            ↻ Refresh
          </button>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <span>🎧</span>
            <div>
              <small>Total Chats</small>
              <strong>{conversations.length}</strong>
            </div>
          </div>

          <div className="stat-card">
            <span>🟢</span>
            <div>
              <small>Open</small>
              <strong>{openCount}</strong>
            </div>
          </div>

          <div className="stat-card">
            <span>⚪</span>
            <div>
              <small>Closed</small>
              <strong>{closedCount}</strong>
            </div>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div
          className={
            "support-layout " +
            (mobileChatOpen ? "mobile-chat-active" : "")
          }
        >
          <div className="conversation-panel">
            <div className="panel-title">
              <span>Conversations</span>
              <b>{conversations.length}</b>
            </div>

            {loading ? (
              <div className="empty-state">
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎧</div>
                <strong>No support chats</strong>
                <p>New user conversations will appear here.</p>
              </div>
            ) : (
              <div className="conversation-list">
                {conversations.map((conversation) => {
                  const active =
                    String(conversation.id) ===
                    String(selectedId);

                  const profile = conversationProfiles[String(conversation.id)] || {};
                  const name =
                    profile.full_name ||
                    conversation.full_name ||
                    conversation.user_name ||
                    profile.game_name ||
                    conversation.game_name ||
                    `User ${shortId(conversation.user_id)}`;

                  const profilePhoto =
                    profile.profile_pic ||
                    profile.profile_image ||
                    profile.avatar_url ||
                    profile.photo_url ||
                    profile.photo ||
                    conversation.profile_pic ||
                    conversation.profile_image ||
                    conversation.avatar_url ||
                    conversation.photo_url ||
                    null;

                  return (
                    <button
                      key={conversation.id}
                      className={
                        "conversation-item " +
                        (active ? "active" : "")
                      }
                      onClick={() =>
                        selectConversation(conversation)
                      }
                    >
                      <div className="avatar">
                        {profilePhoto ? (
                          <img
                            src={profilePhoto}
                            alt={name}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          String(name).charAt(0).toUpperCase()
                        )}
                      </div>

                      <div className="conversation-info">
                        <strong>{name}</strong>
                        <span>
                          {conversation.updated_at
                            ? formatDate(
                                conversation.updated_at
                              )
                            : "Support conversation"}
                        </span>
                      </div>

                      <span
                        className={
                          "status-dot " +
                          (conversation.status === "open"
                            ? "open"
                            : "closed")
                        }
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="chat-panel">
            {!selected ? (
              <div className="chat-empty">
                <div>🎧</div>
                <h2>Select a conversation</h2>
                <p>
                  Choose a support chat from the left.
                </p>
              </div>
            ) : (
              <>
                <div className="chat-header">
                  <div className="chat-user-heading">
                    <button
                      className="back-mobile"
                      onClick={() => setMobileChatOpen(false)}
                    >
                      ‹
                    </button>

                    <button
                      className="profile-trigger"
                      onClick={() => setProfileOpen(true)}
                    >
                      <span className="header-avatar">
                        {(
                          member?.full_name ||
                          member?.game_name ||
                          "U"
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </span>

                      <span className="header-user-text">
                        <strong>
                          {member?.full_name ||
                            member?.game_name ||
                            "User Support"}
                        </strong>

                        <span>
                          {member?.phone ||
                            `ID: ${shortId(selected.user_id)}`}
                        </span>
                      </span>
                    </button>
                  </div>

                  <div className="chat-actions">
                    <span
                      className={
                        "status-pill " +
                        (selected.status === "open"
                          ? "status-open"
                          : "status-closed")
                      }
                    >
                      {selected.status}
                    </span>

                    {selected.status === "open" ? (
                      <button
                        onClick={() =>
                          changeStatus("closed")
                        }
                      >
                        Close
                      </button>
                    ) : (
                      <button
                        onClick={() => changeStatus("open")}
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>

                <div className="quick-user-strip">
                  <div>
                    <span>UID</span>
                    <strong>
                      {member?.free_fire_uid || "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Wallet</span>
                    <strong>
                      {money(
                        Number(wallet?.deposit_balance || 0) +
                          Number(wallet?.bonus_balance || 0) +
                          Number(wallet?.winning_balance || 0)
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>
                      {member?.status || "active"}
                    </strong>
                  </div>
                  <button
                    onClick={() => setProfileOpen(true)}
                  >
                    View full profile →
                  </button>
                </div>

                <div className="messages">
                  {messagesLoading &&
                  messages.length === 0 ? (
                    <div className="message-loading">
                      Loading messages...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="message-loading">
                      No messages yet.
                    </div>
                  ) : (
                    messages.map((message) => {
                      const admin =
                        message.sender_type === "admin";
                      const attachment =
                        message.attachment_url;

                      return (
                        <div
                          key={message.id}
                          className={
                            "message-row " +
                            (admin ? "admin" : "user")
                          }
                        >
                          <div className="message-bubble">
                            {message.message &&
                              message.message !==
                                "[Attachment]" && (
                                <div className="message-text">
                                  {message.message}
                                </div>
                              )}

                            {attachment && (
                              <div className="attachment-box">
                                {String(
                                  message.attachment_type || ""
                                ).startsWith("image/") ? (
                                  <img
                                    src={attachment}
                                    alt={
                                      message.attachment_name ||
                                      "Attachment"
                                    }
                                    onClick={() =>
                                      window.open(
                                        attachment,
                                        "_blank"
                                      )
                                    }
                                  />
                                ) : (
                                  <a
                                    href={attachment}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    📎{" "}
                                    {message.attachment_name ||
                                      "Open attachment"}
                                  </a>
                                )}
                              </div>
                            )}

                            <small>
                              {formatDate(
                                message.created_at
                              )}
                            </small>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="reply-box">
                  <textarea
                    value={reply}
                    onChange={(e) =>
                      setReply(e.target.value)
                    }
                    placeholder="Type your reply..."
                    disabled={
                      sending ||
                      selected.status !== "open"
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey
                      ) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                  />

                  <button
                    onClick={sendReply}
                    disabled={
                      sending ||
                      !reply.trim() ||
                      selected.status !== "open"
                    }
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {profileOpen && selected && (
          <>
            <button
              className="profile-backdrop"
              aria-label="Close profile"
              onClick={() => setProfileOpen(false)}
            />

            <aside className="profile-drawer">
              <div className="profile-drawer-header">
                <div>
                  <h2>
                    {member?.full_name ||
                      member?.game_name ||
                      "Member"}
                  </h2>
                  <p>Member details & wallet</p>
                </div>

                <button
                  className="drawer-close"
                  onClick={() => setProfileOpen(false)}
                >
                  ×
                </button>
              </div>

              {memberLoading ? (
                <div className="profile-loading">
                  Loading member details...
                </div>
              ) : (
                <>
                  <div className="profile-hero">
                    <div className="profile-avatar">
                      {(
                        member?.full_name ||
                        member?.game_name ||
                        "U"
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div>
                      <strong>
                        {member?.full_name ||
                          member?.game_name ||
                          "Unknown User"}
                      </strong>
                      <span>
                        {member?.phone || "Phone not available"}
                      </span>
                      <span>
                        {member?.email || "Email not available"}
                      </span>
                    </div>
                  </div>

                  <section className="profile-section">
                    <div className="profile-section-title">
                      Member Information
                    </div>

                    <div className="info-grid">
                      <Info
                        label="Member ID"
                        value={member?.id}
                        full
                      />
                      <Info
                        label="Full Name"
                        value={member?.full_name}
                      />
                      <Info
                        label="Game Name"
                        value={member?.game_name}
                      />
                      <Info
                        label="Phone"
                        value={member?.phone}
                      />
                      <Info
                        label="Email"
                        value={member?.email}
                      />
                      <Info
                        label="Free Fire UID"
                        value={member?.free_fire_uid}
                      />
                      <Info
                        label="Role"
                        value={member?.role || "user"}
                      />
                      <Info
                        label="Status"
                        value={member?.status || "active"}
                      />
                      <Info
                        label="IP Address"
                        value={
                          member?.ip_address ||
                          "Not recorded"
                        }
                      />
                      <Info
                        label="Joined"
                        value={formatDate(
                          member?.created_at
                        )}
                        full
                      />
                    </div>
                  </section>

                  <section className="profile-section">
                    <div className="profile-section-title">
                      Wallet Balance
                    </div>

                    <div className="wallet-grid">
                      <WalletCard
                        label="Deposit"
                        value={money(
                          wallet?.deposit_balance
                        )}
                      />
                      <WalletCard
                        label="Bonus"
                        value={money(
                          wallet?.bonus_balance
                        )}
                      />
                      <WalletCard
                        label="Winning"
                        value={money(
                          wallet?.winning_balance
                        )}
                      />
                    </div>

                    <div className="wallet-total-card">
                      <span>Total Wallet</span>
                      <strong>
                        {money(
                          Number(
                            wallet?.deposit_balance || 0
                          ) +
                            Number(
                              wallet?.bonus_balance || 0
                            ) +
                            Number(
                              wallet?.winning_balance || 0
                            )
                        )}
                      </strong>
                    </div>
                  </section>

                  <section className="profile-section">
                    <div className="profile-section-title">
                      Support Conversation
                    </div>

                    <div className="support-meta">
                      <div>
                        <span>Conversation ID</span>
                        <strong>{selected.id}</strong>
                      </div>
                      <div>
                        <span>Conversation Status</span>
                        <strong>{selected.status}</strong>
                      </div>
                      <div>
                        <span>Last Updated</span>
                        <strong>
                          {formatDate(
                            selected.updated_at
                          )}
                        </strong>
                      </div>
                    </div>
                  </section>
                </>
              )}
            </aside>
          </>
        )}

        <style jsx>{`
          .support-page {
            padding: 20px;
            min-height: 100vh;
            box-sizing: border-box;
          }

          .support-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }

          .support-top h1 {
            margin: 0;
            font-size: 25px;
            font-weight: 900;
          }

          .support-top p {
            margin: 5px 0 0;
            color: #777;
            font-size: 13px;
          }

          .refresh-btn,
          .chat-actions button {
            border: 0;
            background: #ff174f;
            color: #fff;
            padding: 10px 16px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 800;
          }

          .stats-row {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 18px;
          }

          .stat-card {
            background: #fff;
            border: 1px solid #eee;
            border-radius: 16px;
            padding: 16px;
            display: flex;
            gap: 12px;
            align-items: center;
          }

          .stat-card > span {
            font-size: 25px;
          }

          .stat-card small {
            display: block;
            color: #777;
          }

          .stat-card strong {
            display: block;
            font-size: 22px;
            margin-top: 3px;
          }

          .error-box {
            background: #fff1f3;
            color: #d60032;
            border: 1px solid #ffd0da;
            padding: 12px 14px;
            border-radius: 12px;
            margin-bottom: 15px;
            font-size: 13px;
          }

          .support-layout {
            display: grid;
            grid-template-columns: 350px minmax(0, 1fr);
            height: calc(100vh - 260px);
            min-height: 560px;
            background: #fff;
            border: 1px solid #e9e9ed;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 8px 35px rgba(0, 0, 0, 0.05);
          }

          .conversation-panel {
            border-right: 1px solid #eee;
            overflow: hidden;
            min-width: 0;
          }

          .panel-title {
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            border-bottom: 1px solid #eee;
            font-weight: 900;
          }

          .panel-title b {
            background: #ff174f;
            color: white;
            border-radius: 20px;
            padding: 4px 9px;
            font-size: 11px;
          }

          .conversation-list {
            height: calc(100% - 60px);
            overflow-y: auto;
          }

          .conversation-item {
            width: 100%;
            border: 0;
            border-bottom: 1px solid #f1f1f1;
            background: #fff;
            display: flex;
            align-items: center;
            gap: 11px;
            padding: 13px;
            cursor: pointer;
            text-align: left;
            transition: background 0.18s ease,
              transform 0.18s ease;
          }

          .conversation-item:hover {
            background: #fff6f8;
          }

          .conversation-item.active {
            background: #fff0f4;
            box-shadow: inset 3px 0 0 #ff174f;
          }

          .avatar,
          .header-avatar,
          .profile-avatar {
            flex-shrink: 0;
            display: grid;
            place-items: center;
            font-weight: 900;
          }

          .avatar {
            width: 43px;
            height: 43px;
            border-radius: 50%;
            background: #ffe8ee;
            color: #ff174f;
            overflow: hidden;
          }

          .avatar img {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: cover;
          }

          .conversation-info {
            min-width: 0;
            flex: 1;
          }

          .conversation-info strong {
            display: block;
            font-size: 13px;
            overflow: hidden;      
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .conversation-info span {
            display: block;
            color: #888;
            font-size: 10px;
            margin-top: 4px;
          }

          .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
          }

          .status-dot.open {
            background: #22c55e;
          }

          .status-dot.closed {
            background: #aaa;
          }

          .chat-panel {
            display: flex;
            flex-direction: column;
            min-width: 0;
            min-height: 0;
            position: relative;
          }

          .chat-header {
            min-height: 70px;
            padding: 10px 16px;
            border-bottom: 1px solid #eee;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            background: #fff;
          }

          .chat-user-heading {
            min-width: 0;
            display: flex;
            align-items: center;
          }

          .profile-trigger {
            border: 0;
            background: transparent;
            padding: 4px;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            text-align: left;
            min-width: 0;
          }

          .header-avatar {
            width: 42px;
            height: 42px;
            border-radius: 14px;
            background: #ffe8ee;
            color: #ff174f;
          }

          .header-user-text {
            min-width: 0;
          }

          .header-user-text strong,
          .header-user-text span {
            display: block;
          }

          .header-user-text strong {
            font-size: 14px;
            color: #171717;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 320px;
          }

          .header-user-text span {
            color: #888;
            font-size: 10px;
            margin-top: 4px;
          }

          .chat-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
          }

          .chat-actions button {
            padding: 8px 12px;
            border-radius: 10px;
          }

          .status-pill {
            padding: 6px 10px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: 800;
            text-transform: capitalize;
          }

          .status-open {
            background: #e9f9ef;
            color: #16803c;
          }

          .status-closed {
            background: #f1f1f1;
            color: #777;
          }

          .quick-user-strip {
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 8px 16px;
            border-bottom: 1px solid #eee;
            background: #fff;
          }

          .quick-user-strip > div {
            min-width: 0;
          }

          .quick-user-strip span {
            display: block;
            color: #8a8a8a;
            font-size: 8px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
          }

          .quick-user-strip strong {
            display: block;
            margin-top: 3px;
            font-size: 11px;
          }

          .quick-user-strip button {
            margin-left: auto;
            border: 0;
            background: #fff0f4;
            color: #e6003f;
            border-radius: 9px;
            padding: 7px 10px;
            font-size: 10px;
            font-weight: 800;
            cursor: pointer;
          }

          .messages {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 20px;
            background: #f7f7f8;
          }

          .message-row {
            display: flex;
            margin-bottom: 10px;
          }

          .message-row.user {
            justify-content: flex-start;
          }

          .message-row.admin {
            justify-content: flex-end;
          }

          .message-bubble {
            max-width: 70%;
            padding: 10px 12px;
            border-radius: 15px;
            background: #fff;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          }

          .message-row.admin .message-bubble {
            background: #ff174f;
            color: #fff;
          }

          .message-text {
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 13px;
            line-height: 1.45;
          }

          .message-bubble small {
            display: block;
            margin-top: 5px;
            opacity: 0.6;
            font-size: 9px;
          }

          .attachment-box {
            margin-top: 7px;
          }

          .attachment-box img {
            max-width: 260px;
            max-height: 220px;
            border-radius: 10px;
            display: block;
            cursor: pointer;
            object-fit: contain;
            background: #111;
          }

          .attachment-box a {
            color: inherit;
            text-decoration: none;
            font-size: 12px;
            font-weight: 700;
          }

          .reply-box {
            display: flex;
            gap: 8px;
            padding: 12px;
            border-top: 1px solid #eee;
            background: #fff;
          }

          .reply-box textarea {
            flex: 1;
            min-height: 46px;
            max-height: 130px;
            resize: vertical;
            border: 1px solid #ddd;
            border-radius: 13px;
            padding: 12px;
            outline: none;
            font-family: inherit;
          }

          .reply-box textarea:focus {
            border-color: #ff174f;
          }

          .reply-box button {
            width: 90px;
            border: 0;
            border-radius: 13px;
            background: #ff174f;
            color: #fff;
            font-weight: 800;
            cursor: pointer;
          }

          .reply-box button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .empty-state,
          .chat-empty,
          .message-loading,
          .profile-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            color: #777;
            text-align: center;
            padding: 40px 20px;
          }

          .empty-state {
            height: calc(100% - 60px);
            box-sizing: border-box;
          }

          .empty-icon,
          .chat-empty > div {
            font-size: 45px;
            margin-bottom: 10px;
          }

          .chat-empty {
            flex: 1;
          }

          .back-mobile {
            display: none;
            border: 0;
            background: #f5f5f5;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            font-size: 25px;
            line-height: 1;
            cursor: pointer;
            margin-right: 5px;
          }

          .profile-backdrop {
            position: fixed;
            inset: 0;
            z-index: 90;
            border: 0;
            background: rgba(0, 0, 0, 0.42);
            backdrop-filter: blur(2px);
          }

          .profile-drawer {
            position: fixed;
            top: 0;
            right: 0;
            z-index: 100;
            width: min(440px, 92vw);
            height: 100vh;
            overflow-y: auto;
            box-sizing: border-box;
            background: #070b12;
            color: #e9eef7;
            padding: 22px;
            box-shadow: -18px 0 45px rgba(0, 0, 0, 0.2);
            animation: profileSlide 0.24s ease-out;
          }

          @keyframes profileSlide {
            from {
              transform: translateX(100%);
            }
            to {
              transform: translateX(0);
            }
          }

          .profile-drawer-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 15px;
            margin-bottom: 22px;
          }

          .profile-drawer-header h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 900;
          }

          .profile-drawer-header p {
            margin: 5px 0 0;
            color: #738197;
            font-size: 10px;
          }

          .drawer-close {
            width: 34px;
            height: 34px;
            border: 1px solid #263448;
            border-radius: 9px;
            background: #101925;
            color: #fff;
            cursor: pointer;
            font-size: 18px;
          }

          .profile-hero {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px;
            border: 1px solid #1d2a3b;
            border-radius: 14px;
            background: #0e1723;
          }

          .profile-avatar {
            width: 54px;
            height: 54px;
            border-radius: 17px;
            background: #ff174f;
            color: #fff;
            font-size: 20px;
          }

          .profile-hero strong,
          .profile-hero span {
            display: block;
          }

          .profile-hero strong {
            font-size: 14px;
          }

          .profile-hero span {
            margin-top: 4px;
            color: #8794a8;
            font-size: 10px;
            word-break: break-word;
          }

          .profile-section {
            margin-top: 20px;
          }

          .profile-section-title {
            margin-bottom: 9px;
            color: #66758a;
            font-size: 8px;
            letter-spacing: 1.4px;
            text-transform: uppercase;
            font-weight: 900;
          }

          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }

          .info {
            padding: 11px;
            border: 1px solid #1d2a3b;
            border-radius: 9px;
            background: #0e1723;
          }

          .info.full {
            grid-column: 1 / -1;
          }

          .info-label {
            color: #647186;
            font-size: 8px;
            margin-bottom: 5px;
          }

          .info-value {
            color: #edf2f8;
            font-size: 10px;
            font-weight: 700;
            word-break: break-word;
          }

          .wallet-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
          }

          .wallet-card {
            padding: 12px 8px;
            border: 1px solid #1d2a3b;
            border-radius: 9px;
            background: #0e1723;
            text-align: center;
          }

          .wallet-label {
            color: #647186;
            font-size: 7px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
          }

          .wallet-value {
            margin-top: 7px;
            color: #fff;
            font-size: 12px;
            font-weight: 900;
          }

          .wallet-total-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 8px;
            padding: 12px;
            border: 1px solid #3b2230;
            border-radius: 9px;
            background: #1a0e15;
          }

          .wallet-total-card span {
            color: #9f7d8b;
            font-size: 9px;
          }

          .wallet-total-card strong {
            color: #ff6a8c;
            font-size: 15px;
          }

          .support-meta {
            display: grid;
            gap: 8px;
          }

          .support-meta > div {
            padding: 11px;
            border: 1px solid #1d2a3b;
            border-radius: 9px;
            background: #0e1723;
          }

          .support-meta span,
          .support-meta strong {
            display: block;
          }

          .support-meta span {
            color: #647186;
            font-size: 8px;
            margin-bottom: 5px;
          }

          .support-meta strong {
            color: #edf2f8;
            font-size: 10px;
            word-break: break-all;
          }

          @media (max-width: 900px) {
            .support-layout {
              grid-template-columns: 300px minmax(0, 1fr);
            }

            .quick-user-strip {
              gap: 10px;
            }

            .quick-user-strip > div:nth-child(3) {
              display: none;
            }
          }

          @media (max-width: 700px) {
            .support-page {
              padding: 12px;
              overflow-x: hidden;
            }

            .support-top {
              align-items: flex-start;
              gap: 10px;
            }

            .support-top h1 {
              font-size: 21px;
            }

            .stats-row {
              grid-template-columns: 1fr 1fr 1fr;
              gap: 7px;
            }

            .stat-card {
              padding: 10px;
              border-radius: 12px;
            }

            .stat-card > span {
              font-size: 18px;
            }

            .stat-card strong {
              font-size: 17px;
            }

            .stat-card small {
              font-size: 9px;
            }

            .support-layout {
              display: block;
              position: relative;
              height: calc(100vh - 235px);
              min-height: 500px;
              overflow: hidden;
            }

            .conversation-panel,
            .chat-panel {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              border: 0;
              transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
              background: #fff;
            }

            .conversation-panel {
              transform: translateX(0);
            }

            .chat-panel {
              transform: translateX(100%);
            }

            .mobile-chat-active .conversation-panel {
              transform: translateX(-100%);
            }

            .mobile-chat-active .chat-panel {
              transform: translateX(0);
            }

            .back-mobile {
              display: block;
            }

            .chat-header {
              padding: 8px 10px;
            }

            .header-user-text strong {
              max-width: 150px;
            }

            .chat-actions .status-pill {
              display: none;
            }

            .chat-actions button {
              padding: 8px 10px;
              font-size: 10px;
            }

            .quick-user-strip {
              overflow-x: auto;
              gap: 15px;
            }

            .quick-user-strip button {
              flex-shrink: 0;
            }

            .message-bubble {
              max-width: 84%;
            }

            .profile-drawer {
              width: 94vw;
            }

            .info-grid {
              grid-template-columns: 1fr;
            }

            .info.full {
              grid-column: auto;
            }

            .wallet-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </AdminShell>
  );
}

function Info({ label, value, full = false }) {
  return (
    <div className={"info" + (full ? " full" : "")}>
      <div className="info-label">{label}</div>
      <div className="info-value">
        {value || "—"}
      </div>
    </div>
  );
}

function WalletCard({ label, value }) {
  return (
    <div className="wallet-card">
      <div className="wallet-label">{label}</div>
      <div className="wallet-value">{value}</div>
    </div>
  );
}
