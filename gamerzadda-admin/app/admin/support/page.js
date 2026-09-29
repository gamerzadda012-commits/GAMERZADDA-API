"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://api.gamerzadda.in";

export default function Page() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const selectedId = selected?.id;

  async function loadConversations(silent = false) {
    try {
      if (!silent) setLoading(true);
      setError("");

      const res = await fetch(
        `${API_BASE}/api/admin/support`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Unable to load support conversations."
        );
      }

      setConversations(data.conversations || []);

      if (selectedId) {
        const updated = (data.conversations || []).find(
          (item) => String(item.id) === String(selectedId)
        );

        if (updated) {
          setSelected(updated);
        }
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

      const res = await fetch(
        `${API_BASE}/api/admin/support/${conversationId}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Unable to load messages."
        );
      }

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
      return;
    }

    loadMessages(selectedId);

    const timer = setInterval(() => {
      loadMessages(selectedId, true);
    }, 5000);

    return () => clearInterval(timer);
  }, [selectedId]);

  async function sendReply() {
    const text = reply.trim();

    if (!text || !selectedId || sending) return;

    try {
      setSending(true);
      setError("");

      const res = await fetch(
        `${API_BASE}/api/admin/support/${selectedId}/message`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: text,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Unable to send reply."
        );
      }

      setReply("");

      if (data.message) {
        setMessages((prev) => [
          ...prev,
          data.message,
        ]);
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

      const res = await fetch(
        `${API_BASE}/api/admin/support/${selectedId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Unable to update conversation."
        );
      }

      setSelected(data.conversation);

      setConversations((prev) =>
        prev.map((item) =>
          String(item.id) === String(selectedId)
            ? data.conversation
            : item
        )
      );
    } catch (err) {
      setError(err.message || "Unable to update status.");
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

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        <div className="support-layout">

          {/* LEFT */}
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
                <p>
                  New user conversations will appear here.
                </p>
              </div>
            ) : (
              <div className="conversation-list">
                {conversations.map((conversation) => {
                  const active =
                    String(conversation.id) ===
                    String(selectedId);

                  return (
                    <button
                      key={conversation.id}
                      className={
                        "conversation-item " +
                        (active ? "active" : "")
                      }
                      onClick={() => {
                        setSelected(conversation);
                        setMessages([]);
                      }}
                    >
                      <div className="avatar">
                        🎧
                      </div>

                      <div className="conversation-info">
                        <strong>
                          User{" "}
                          {String(
                            conversation.user_id || ""
                          ).slice(0, 12)}
                        </strong>

                        <span>
                          {conversation.updated_at
                            ? new Date(
                                conversation.updated_at
                              ).toLocaleString()
                            : "Support conversation"}
                        </span>
                      </div>

                      <span
                        className={
                          "status-dot " +
                          (conversation.status ===
                          "open"
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

          {/* RIGHT */}
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

                  <div>
                    <strong>
                      User Support
                    </strong>

                    <span>
                      User ID: {selected.user_id}
                    </span>
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
                        onClick={() =>
                          changeStatus("open")
                        }
                      >
                        Reopen
                      </button>
                    )}

                  </div>
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
                        message.sender_type ===
                        "admin";

                      const attachment =
                        message.attachment_url;

                      return (
                        <div
                          key={message.id}
                          className={
                            "message-row " +
                            (admin
                              ? "admin"
                              : "user")
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
                                  message.attachment_type ||
                                    ""
                                ).startsWith(
                                  "image/"
                                ) ? (
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
                              {message.created_at
                                ? new Date(
                                    message.created_at
                                  ).toLocaleString()
                                : ""}
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
                    {sending
                      ? "Sending..."
                      : "Send"}
                  </button>

                </div>
              </>
            )}

          </div>
        </div>

        <style jsx>{`
          .support-page {
            padding: 20px;
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
          }

          .support-top p {
            margin: 5px 0 0;
            color: #777;
            font-size: 13px;
          }

          .refresh-btn {
            border: 0;
            background: #ff174f;
            color: white;
            padding: 10px 16px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 700;
          }

          .stats-row {
            display: grid;
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 18px;
          }

          .stat-card {
            background: white;
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
            grid-template-columns: 330px 1fr;
            height: calc(100vh - 260px);
            min-height: 520px;
            background: white;
            border: 1px solid #eee;
            border-radius: 18px;
            overflow: hidden;
          }

          .conversation-panel {
            border-right: 1px solid #eee;
            overflow: hidden;
          }

          .panel-title {
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            border-bottom: 1px solid #eee;
            font-weight: 800;
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
            background: white;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 13px;
            cursor: pointer;
            text-align: left;
          }

          .conversation-item:hover,
          .conversation-item.active {
            background: #fff1f4;
          }

          .avatar {
            width: 42px;
            height: 42px;
            border-radius: 13px;
            background: #f4f4f5;
            display: grid;
            place-items: center;
            flex-shrink: 0;
          }

          .conversation-info {
            min-width: 0;
            flex: 1;
          }

          .conversation-info strong {
            display: block;
            font-size: 13px;
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
          }

          .chat-header {
            min-height: 68px;
            padding: 12px 16px;
            border-bottom: 1px solid #eee;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }

          .chat-header strong {
            display: block;
          }

          .chat-header span {
            display: block;
            color: #888;
            font-size: 10px;
            margin-top: 4px;
            word-break: break-all;
          }

          .chat-actions {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .chat-actions button {
            border: 0;
            background: #ff174f;
            color: white;
            padding: 8px 12px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 700;
          }

          .status-pill {
            padding: 6px 10px !important;
            border-radius: 20px;
            font-size: 10px !important;
            margin: 0 !important;
          }

          .status-open {
            background: #e9f9ef;
            color: #16803c;
          }

          .status-closed {
            background: #f1f1f1;
            color: #777;
          }

          .messages {
            flex: 1;
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
            background: white;
            box-shadow:
              0 2px 8px rgba(0, 0, 0, .04);
          }

          .message-row.admin
            .message-bubble {
            background: #ff174f;
            color: white;
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
            opacity: .6;
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
            background: white;
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
            color: white;
            font-weight: 800;
            cursor: pointer;
          }

          .reply-box button:disabled {
            opacity: .5;
            cursor: not-allowed;
          }

          .empty-state,
          .chat-empty,
          .message-loading {
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
          }

          .empty-icon,
          .chat-empty > div {
            font-size: 45px;
            margin-bottom: 10px;
          }

          .empty-state strong,
          .chat-empty h2 {
            color: #222;
          }

          .empty-state p,
          .chat-empty p {
            font-size: 12px;
          }

          @media (max-width: 800px) {
            .support-layout {
              grid-template-columns: 1fr;
              height: auto;
            }

            .conversation-panel {
              height: 280px;
              border-right: 0;
              border-bottom: 1px solid #eee;
            }

            .chat-panel {
              height: 600px;
            }

            .stats-row {
              grid-template-columns: 1fr;
            }

            .support-top {
              align-items: flex-start;
              gap: 10px;
            }

            .message-bubble {
              max-width: 85%;
            }
          }
        `}</style>
      </div>
    </AdminShell>
  );
}