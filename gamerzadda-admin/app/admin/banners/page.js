"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";
import { supabase } from "../../../lib/supabase.js";

const PINK = "#ff174f";

const GAME_TYPES = [
  { value: "all", label: "All Games" },
  { value: "home", label: "Home" },
  { value: "freefire", label: "Free Fire" },
  { value: "freefiremax", label: "Free Fire MAX" },
  { value: "lonewolf", label: "Lone Wolf" },
  { value: "clashsquad", label: "Clash Squad" },
];

function getGameName(value) {
  return (
    GAME_TYPES.find((game) => game.value === value)?.label ||
    value ||
    "Home"
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M7 7l1 14h8l1-14" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function Toggle({ active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 38,
        height: 21,
        border: 0,
        padding: 0,
        borderRadius: 30,
        background: active ? PINK : "#d0d0d0",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: active ? 20 : 3,
          width: 15,
          height: 15,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.18)",
          transition: "left .18s",
        }}
      />
    </button>
  );
}

export default function BannersPage() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [form, setForm] = useState({
    title: "",
    image_url: "",
    click_url: "",
    game_type: "home",
    sort_order: 1,
    is_active: true,
  });

  useEffect(() => {
    loadBanners();
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => {
      setToast("");
    }, 3000);

    return () => clearTimeout(timer);
  }, [toast]);

  async function loadBanners() {
    setLoading(true);

    const { data, error } = await supabase
      .from("banners")
      .select(
        "id,image_url,click_url,title,is_active,sort_order,created_at,game_type"
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Banner load error:", error);
      setToast("Failed to load banners");
      setBanners([]);
    } else {
      setBanners(data || []);
    }

    setLoading(false);
  }

  async function createBanner(e) {
    e.preventDefault();

    if (!form.image_url.trim()) {
      setToast("Image URL is required");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("banners")
      .insert({
        title: form.title.trim() || "Untitled Banner",
        image_url: form.image_url.trim(),
        click_url: form.click_url.trim() || null,
        game_type: form.game_type,
        sort_order: Number(form.sort_order) || 1,
        is_active: form.is_active,
      })
      .select(
        "id,image_url,click_url,title,is_active,sort_order,created_at,game_type"
      )
      .single();

    if (error) {
      console.error("Create banner error:", error);
      setToast(error.message || "Failed to create banner");
      setSaving(false);
      return;
    }

    setBanners((prev) => [...prev, data]);

    setForm({
      title: "",
      image_url: "",
      click_url: "",
      game_type: "home",
      sort_order: 1,
      is_active: true,
    });

    setShowModal(false);
    setSaving(false);
    setToast("Banner created successfully");
  }

  async function toggleBanner(id, currentStatus) {
    const { error } = await supabase
      .from("banners")
      .update({
        is_active: !currentStatus,
      })
      .eq("id", id);

    if (error) {
      console.error("Toggle error:", error);
      setToast("Failed to update banner");
      return;
    }

    setBanners((prev) =>
      prev.map((banner) =>
        banner.id === id
          ? {
              ...banner,
              is_active: !currentStatus,
            }
          : banner
      )
    );
  }

  async function deleteBanner(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this banner?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("banners")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete error:", error);
      setToast("Failed to delete banner");
      return;
    }

    setBanners((prev) =>
      prev.filter((banner) => banner.id !== id)
    );

    setToast("Banner deleted successfully");
  }

  function openLink(url) {
    if (!url) return;

    let target = url;

    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`;
    }

    window.open(target, "_blank", "noopener,noreferrer");
  }

  const filteredBanners = useMemo(() => {
    const query = search.trim().toLowerCase();

    return banners.filter((banner) => {
      const matchesSearch =
        !query ||
        String(banner.title || "")
          .toLowerCase()
          .includes(query) ||
        String(banner.image_url || "")
          .toLowerCase()
          .includes(query) ||
        String(banner.click_url || "")
          .toLowerCase()
          .includes(query);

      const matchesGame =
        gameFilter === "all" ||
        banner.game_type === gameFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && banner.is_active) ||
        (statusFilter === "inactive" && !banner.is_active);

      return (
        matchesSearch &&
        matchesGame &&
        matchesStatus
      );
    });
  }, [banners, search, gameFilter, statusFilter]);

  return (
    <AdminShell title="Banners">
      <div
        style={{
          width: "100%",
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        {/* PAGE HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            marginBottom: 22,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: "#18181b",
                letterSpacing: "-.3px",
              }}
            >
              Banner Management
            </h2>

            <p
              style={{
                margin: "5px 0 0",
                fontSize: 11,
                color: "#9a9a9a",
              }}
            >
              Manage banners displayed across GamerzAdda
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              height: 40,
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              gap: 7,
              border: 0,
              borderRadius: 6,
              background: PINK,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow:
                "0 5px 15px rgba(255,23,79,.18)",
              whiteSpace: "nowrap",
            }}
          >
            <PlusIcon />
            Add New Banner
          </button>
        </div>

        {/* FILTER BAR */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e7e7e7",
            borderRadius: 8,
            padding: 13,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(240px,1fr) 190px 160px",
              gap: 11,
            }}
          >
            {/* SEARCH */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 5,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#555",
                }}
              >
                Search
              </label>

              <div style={{ position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 11,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#aaa",
                  }}
                >
                  <SearchIcon />
                </div>

                <input
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  placeholder="Search banner..."
                  style={{
                    width: "100%",
                    height: 38,
                    boxSizing: "border-box",
                    border: "1px solid #ddd",
                    borderRadius: 5,
                    outline: "none",
                    padding: "0 10px 0 34px",
                    fontSize: 11,
                    color: "#333",
                  }}
                />
              </div>
            </div>

            {/* GAME */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 5,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#555",
                }}
              >
                Game
              </label>

              <select
                value={gameFilter}
                onChange={(e) =>
                  setGameFilter(e.target.value)
                }
                style={{
                  width: "100%",
                  height: 38,
                  border: "1px solid #ddd",
                  borderRadius: 5,
                  background: "#fff",
                  padding: "0 10px",
                  fontSize: 11,
                  color: "#555",
                  outline: "none",
                }}
              >
                {GAME_TYPES.map((game) => (
                  <option
                    key={game.value}
                    value={game.value}
                  >
                    {game.label}
                  </option>
                ))}
              </select>
            </div>

            {/* STATUS */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 5,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#555",
                }}
              >
                Status
              </label>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value)
                }
                style={{
                  width: "100%",
                  height: 38,
                  border: "1px solid #ddd",
                  borderRadius: 5,
                  background: "#fff",
                  padding: "0 10px",
                  fontSize: 11,
                  color: "#555",
                  outline: "none",
                }}
              >
                <option value="all">Any Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* TABLE */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e5e5",
            borderRadius: 8,
            overflow: "hidden",
            boxShadow:
              "0 2px 8px rgba(0,0,0,.025)",
          }}
        >
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: 900,
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom:
                      "1px solid #e8e8e8",
                  }}
                >
                  <th style={thStyle(65)}>Order</th>
                  <th style={thStyle(115)}>Preview</th>
                  <th style={thStyle(210)}>Banner</th>
                  <th style={thStyle(190)}>
                    Routing Link
                  </th>
                  <th style={thStyle(125)}>Game</th>
                  <th style={thStyle(145)}>Status</th>
                  <th style={thStyle(70)}>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: "60px 20px",
                        textAlign: "center",
                        color: "#999",
                        fontSize: 11,
                      }}
                    >
                      Loading banners...
                    </td>
                  </tr>
                ) : filteredBanners.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: "65px 20px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#666",
                        }}
                      >
                        No banners found
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: "#aaa",
                        }}
                      >
                        Create a banner or change the
                        filters.
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredBanners.map(
                    (banner, index) => (
                      <tr
                        key={banner.id}
                        style={{
                          borderBottom:
                            "1px solid #eeeeee",
                        }}
                      >
                        {/* ORDER */}
                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                            }}
                          >
                            <span
                              style={{
                                color: "#c8c8c8",
                                letterSpacing: "-3px",
                                fontSize: 13,
                              }}
                            >
                              ⋮⋮
                            </span>

                            <span
                              style={{
                                fontSize: 11,
                                color: "#555",
                              }}
                            >
                              {banner.sort_order ||
                                index + 1}
                            </span>
                          </div>
                        </td>

                        {/* PREVIEW */}
                        <td style={tdStyle}>
                          <div
                            style={{
                              width: 82,
                              height: 43,
                              overflow: "hidden",
                              borderRadius: 4,
                              border:
                                "1px solid #e5e5e5",
                              background: "#f5f5f5",
                            }}
                          >
                            <img
                              src={banner.image_url}
                              alt={
                                banner.title ||
                                "Banner"
                              }
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                          </div>
                        </td>

                        {/* BANNER */}
                        <td style={tdStyle}>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#444",
                              overflow: "hidden",
                              textOverflow:
                                "ellipsis",
                              whiteSpace:
                                "nowrap",
                              maxWidth: 210,
                            }}
                          >
                            {banner.title ||
                              "Untitled Banner"}
                          </div>

                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 9,
                              color: "#aaa",
                              overflow: "hidden",
                              textOverflow:
                                "ellipsis",
                              whiteSpace:
                                "nowrap",
                              maxWidth: 210,
                            }}
                          >
                            {banner.image_url}
                          </div>
                        </td>

                        {/* ROUTING */}
                        <td style={tdStyle}>
                          {banner.click_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                openLink(
                                  banner.click_url
                                )
                              }
                              style={{
                                border: 0,
                                background:
                                  "transparent",
                                padding: 0,
                                color: "#3478a9",
                                fontSize: 10,
                                cursor: "pointer",
                                textDecoration:
                                  "underline",
                                maxWidth: 175,
                                overflow: "hidden",
                                textOverflow:
                                  "ellipsis",
                                whiteSpace:
                                  "nowrap",
                                display: "block",
                              }}
                            >
                              {banner.click_url}
                            </button>
                          ) : (
                            <span
                              style={{
                                fontSize: 10,
                                color: "#aaa",
                              }}
                            >
                              No link
                            </span>
                          )}
                        </td>

                        {/* GAME */}
                        <td style={tdStyle}>
                          <span
                            style={{
                              display:
                                "inline-block",
                              padding:
                                "5px 8px",
                              borderRadius: 4,
                              background:
                                "#f5f5f5",
                              color: "#666",
                              fontSize: 9,
                              fontWeight: 600,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {getGameName(
                              banner.game_type
                            )}
                          </span>
                        </td>

                        {/* STATUS */}
                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              alignItems:
                                "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                padding:
                                  "5px 9px",
                                borderRadius: 20,
                                background:
                                  banner.is_active
                                    ? "#ffe8ef"
                                    : "#eeeeee",
                                color:
                                  banner.is_active
                                    ? PINK
                                    : "#999",
                                fontSize: 9,
                                fontWeight: 700,
                              }}
                            >
                              {banner.is_active
                                ? "Active"
                                : "Inactive"}
                            </span>

                            <Toggle
                              active={
                                banner.is_active
                              }
                              onClick={() =>
                                toggleBanner(
                                  banner.id,
                                  banner.is_active
                                )
                              }
                            />
                          </div>
                        </td>

                        {/* ACTION */}
                        <td style={tdStyle}>
                          <button
                            type="button"
                            onClick={() =>
                              deleteBanner(
                                banner.id
                              )
                            }
                            style={{
                              width: 29,
                              height: 29,
                              display: "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              border: 0,
                              borderRadius: 5,
                              background:
                                "#fff1f4",
                              color: PINK,
                              cursor: "pointer",
                            }}
                          >
                            <TrashIcon />
                          </button>
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER */}
          <div
            style={{
              height: 47,
              padding: "0 14px",
              borderTop:
                "1px solid #eeeeee",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <span
              style={{
                marginRight: 12,
                fontSize: 10,
                color: "#999",
              }}
            >
              Showing {filteredBanners.length} of{" "}
              {banners.length}
            </span>

            <button
              type="button"
              style={pageButton}
            >
              ‹
            </button>

            <button
              type="button"
              style={{
                ...pageButton,
                background: PINK,
                color: "#fff",
                borderRadius: 4,
              }}
            >
              1
            </button>

            <button
              type="button"
              style={pageButton}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ADD BANNER MODAL */}
      {showModal && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowModal(false);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 500,
              background: "#fff",
              borderRadius: 9,
              overflow: "hidden",
              boxShadow:
                "0 25px 70px rgba(0,0,0,.25)",
            }}
          >
            {/* MODAL HEADER */}
            <div
              style={{
                padding: "17px 20px",
                borderBottom:
                  "1px solid #eee",
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#222",
                  }}
                >
                  Add New Banner
                </h3>

                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 10,
                    color: "#999",
                  }}
                >
                  Create a new promotional banner
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowModal(false)
                }
                style={{
                  border: 0,
                  background:
                    "transparent",
                  color: "#999",
                  fontSize: 23,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={createBanner}>
              <div
                style={{
                  padding: "18px 20px",
                }}
              >
                <div style={{ marginBottom: 13 }}>
                  <label style={labelStyle}>
                    Banner Name
                  </label>

                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        title: e.target.value,
                      })
                    }
                    placeholder="Enter banner name"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 13 }}>
                  <label style={labelStyle}>
                    Image URL *
                  </label>

                  <input
                    required
                    value={form.image_url}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        image_url:
                          e.target.value,
                      })
                    }
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 13 }}>
                  <label style={labelStyle}>
                    Routing / Click URL
                  </label>

                  <input
                    value={form.click_url}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        click_url:
                          e.target.value,
                      })
                    }
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label style={labelStyle}>
                      Game
                    </label>

                    <select
                      value={form.game_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          game_type:
                            e.target.value,
                        })
                      }
                      style={inputStyle}
                    >
                      {GAME_TYPES.filter(
                        (g) =>
                          g.value !== "all"
                      ).map((g) => (
                        <option
                          key={g.value}
                          value={g.value}
                        >
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>
                      Display Order
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={form.sort_order}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sort_order:
                            e.target.value,
                        })
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>

                {form.image_url && (
                  <div
                    style={{
                      marginTop: 14,
                      height: 100,
                      overflow: "hidden",
                      borderRadius: 5,
                      border:
                        "1px solid #eee",
                    }}
                  >
                    <img
                      src={form.image_url}
                      alt="Banner preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                )}

                <div
                  style={{
                    marginTop: 13,
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "#fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent:
                      "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#555",
                      }}
                    >
                      Active Banner
                    </div>

                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 9,
                        color: "#aaa",
                      }}
                    >
                      Display this banner in the
                      app
                    </div>
                  </div>

                  <Toggle
                    active={form.is_active}
                    onClick={() =>
                      setForm({
                        ...form,
                        is_active:
                          !form.is_active,
                      })
                    }
                  />
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div
                style={{
                  padding: "13px 20px",
                  borderTop:
                    "1px solid #eee",
                  display: "flex",
                  justifyContent:
                    "flex-end",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setShowModal(false)
                  }
                  style={{
                    height: 37,
                    padding: "0 16px",
                    border:
                      "1px solid #ddd",
                    borderRadius: 5,
                    background: "#fff",
                    color: "#666",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    height: 37,
                    padding: "0 18px",
                    border: 0,
                    borderRadius: 5,
                    background: PINK,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: saving
                      ? "not-allowed"
                      : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving
                    ? "Creating..."
                    : "Create Banner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 10000,
            padding: "11px 15px",
            background: "#292929",
            color: "#fff",
            borderRadius: 6,
            boxShadow:
              "0 8px 30px rgba(0,0,0,.2)",
            fontSize: 10,
          }}
        >
          {toast}
        </div>
      )}
    </AdminShell>
  );
}

const thStyle = (width) => ({
  width,
  height: 45,
  padding: "0 10px",
  textAlign: "left",
  borderBottom: "1px solid #e8e8e8",
  color: "#555",
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
});

const tdStyle = {
  height: 64,
  padding: "8px 10px",
  borderBottom: "1px solid #eeeeee",
  verticalAlign: "middle",
};

const pageButton = {
  width: 27,
  height: 27,
  border: 0,
  background: "transparent",
  color: "#999",
  fontSize: 11,
  cursor: "pointer",
};

const labelStyle = {
  display: "block",
  marginBottom: 5,
  fontSize: 10,
  fontWeight: 600,
  color: "#555",
};

const inputStyle = {
  width: "100%",
  height: 39,
  boxSizing: "border-box",
  border: "1px solid #ddd",
  borderRadius: 5,
  background: "#fff",
  padding: "0 11px",
  fontSize: 11,
  color: "#444",
  outline: "none",
};