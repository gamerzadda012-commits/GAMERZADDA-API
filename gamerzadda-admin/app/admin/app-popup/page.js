"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../AdminShell";
import { supabase } from "../../../lib/supabase.js";

const RED = "#ff174f";

const EMPTY_FORM = {
  title: "",
  clickUrl: "",
  imageUrl: "",
  displayMode: "once_per_day",
  priority: "0",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

function pad(v) {
  return String(v).padStart(2, "0");
}

function formatDate(value) {
  if (!value) return "Not set";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "Not set";

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isLive(item) {
  const now = Date.now();
  const start = new Date(item.starts_at).getTime();
  const end = new Date(item.ends_at).getTime();

  return (
    item.is_active &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= now &&
    end > now
  );
}

function FieldIcon({ children, color = RED, bg = "#fff0f4" }) {
  return (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        background: bg,
        color,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 950,
        fontSize: 17,
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  subtitle,
  background,
  iconBackground,
  titleColor,
}) {
  return (
    <div
      style={{
        minHeight: 112,
        borderRadius: 22,
        padding: 17,
        background,
        border: "1px solid rgba(255,255,255,.95)",
        boxShadow: "0 12px 30px rgba(15,23,42,.055)",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: 16,
          background: iconBackground,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 23,
          boxShadow: "0 8px 18px rgba(0,0,0,.08)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: titleColor,
            fontSize: 13,
            fontWeight: 850,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: 3,
            color: "#111827",
            fontSize: 20,
            fontWeight: 950,
            lineHeight: 1.2,
          }}
        >
          {value}
        </div>

        <div
          style={{
            marginTop: 4,
            color: "#87909f",
            fontSize: 11,
            fontWeight: 650,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function FormField({
  icon,
  label,
  hint,
  children,
  color = RED,
  bg = "#fff0f4",
}) {
  return (
    <div
      style={{
        border: "1px solid #edf0f5",
        borderRadius: 20,
        padding: 14,
        background:
          "linear-gradient(180deg,#ffffff 0%,#fafbfe 100%)",
        boxShadow: "0 8px 22px rgba(15,23,42,.035)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <FieldIcon color={color} bg={bg}>
          {icon}
        </FieldIcon>

        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 900,
              color: "#172033",
            }}
          >
            {label}
          </div>

          {hint && (
            <div
              style={{
                marginTop: 3,
                color: "#929aaa",
                fontSize: 10,
                fontWeight: 650,
              }}
            >
              {hint}
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  height: 48,
  border: "1px solid #e3e7ef",
  borderRadius: 15,
  outline: "none",
  padding: "0 14px",
  background: "#fff",
  color: "#172033",
  fontSize: 13,
  fontWeight: 750,
  boxSizing: "border-box",
};

function PopupImage({ src, title }) {
  return src ? (
    <img
      src={src}
      alt={title || "Popup"}
      style={{
        width: 76,
        height: 60,
        objectFit: "cover",
        borderRadius: 14,
        display: "block",
        background: "#f3f4f6",
      }}
    />
  ) : (
    <div
      style={{
        width: 76,
        height: 60,
        borderRadius: 14,
        background:
          "linear-gradient(135deg,#fff0f4,#f3edff,#edf8ff)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 25,
      }}
    >
      🖼️
    </div>
  );
}

export default function Page() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [popups, setPopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const setField = (name, value) => {
    setForm((old) => ({
      ...old,
      [name]: value,
    }));
  };

  async function loadPopups() {
    setLoading(true);

    try {
      const { data, error: loadError } = await supabase
        .from("app_popups")
        .select(
          "id,title,image_url,storage_path,click_url,display_mode,starts_at,ends_at,is_active,priority,created_at,updated_at"
        )
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

      if (loadError) throw loadError;

      setPopups(data || []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to load popups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPopups();
  }, []);

  const activeCount = useMemo(
    () => popups.filter((item) => isLive(item)).length,
    [popups]
  );

  const frequency = useMemo(() => {
    const item =
      popups.find((p) => p.is_active) || popups[0];

    if (!item) return "Once per day";

    return item.display_mode === "every_open"
      ? "Every app open"
      : "Once per day";
  }, [popups]);

  const nextSchedule = useMemo(() => {
    const now = Date.now();

    const next = popups
      .filter((item) => {
        const start = new Date(item.starts_at).getTime();

        return (
          item.is_active &&
          Number.isFinite(start) &&
          start > now
        );
      })
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() -
          new Date(b.starts_at).getTime()
      )[0];

    return next ? formatDate(next.starts_at) : "Not Set";
  }, [popups]);

  function validateFile(file) {
    if (!file) return false;

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowed.includes(file.type)) {
      setError("Only JPG, PNG and WebP images are allowed.");
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image size must be 10 MB or less.");
      return false;
    }

    setError("");
    return true;
  }

  function selectFile(file) {
    if (!validateFile(file)) return;

    setSelectedFile(file);

    const localUrl = URL.createObjectURL(file);

    setField("imageUrl", localUrl);
  }

  async function uploadImage(file) {
    const extension =
      file.name.split(".").pop()?.toLowerCase() || "jpg";

    const safeName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .slice(0, 50);

    const path =
      `app-popups/${Date.now()}-${safeName || "popup"}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("banners")
      .upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("banners")
      .getPublicUrl(path);

    return {
      url: data.publicUrl,
      path,
    };
  }

  async function createPopup(e) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!form.title.trim()) {
      setError("Please enter popup title.");
      return;
    }

    if (!selectedFile && !form.imageUrl.trim()) {
      setError("Please upload an image or enter image URL.");
      return;
    }

    if (!form.startsAt || !form.endsAt) {
      setError("Please select start and end date/time.");
      return;
    }

    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);

    if (end <= start) {
      setError("End date/time must be after start date/time.");
      return;
    }

    setCreating(true);

    try {
      let imageUrl = selectedFile
        ? ""
        : form.imageUrl.trim();

      let storagePath = null;

      if (selectedFile) {
        setUploading(true);

        const uploaded = await uploadImage(selectedFile);

        imageUrl = uploaded.url;
        storagePath = uploaded.path;

        setUploading(false);
      }

      const { error: insertError } = await supabase
        .from("app_popups")
        .insert({
          title: form.title.trim(),
          image_url: imageUrl,
          storage_path: storagePath,
          click_url: form.clickUrl.trim() || null,
          display_mode: form.displayMode,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          is_active: form.isActive,
          priority:
            Number.parseInt(form.priority || "0", 10) || 0,
        });

      if (insertError) throw insertError;

      setMessage("Popup created successfully.");

      setForm(EMPTY_FORM);
      setSelectedFile(null);

      if (fileRef.current) {
        fileRef.current.value = "";
      }

      await loadPopups();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not create popup.");
    } finally {
      setUploading(false);
      setCreating(false);
    }
  }

  async function togglePopup(item) {
    setError("");
    setMessage("");

    try {
      const { error: updateError } = await supabase
        .from("app_popups")
        .update({
          is_active: !item.is_active,
        })
        .eq("id", item.id);

      if (updateError) throw updateError;

      setMessage(
        item.is_active
          ? "Popup disabled."
          : "Popup enabled."
      );

      await loadPopups();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not update popup.");
    }
  }

  async function deletePopup(item) {
    const ok = window.confirm(
      `Delete "${item.title || "this popup"}"?`
    );

    if (!ok) return;

    setError("");
    setMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("app_popups")
        .delete()
        .eq("id", item.id);

      if (deleteError) throw deleteError;

      if (item.storage_path) {
        await supabase.storage
          .from("banners")
          .remove([item.storage_path]);
      }

      setMessage("Popup deleted.");

      await loadPopups();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not delete popup.");
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setMessage("");
    setError("");

    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  return (
    <AdminShell>
      <div className="popup-page">
        <style jsx>{`
          .popup-page {
            min-height: 100%;
            padding: 30px 34px 50px;
            background:
              linear-gradient(
                180deg,
                #f8f9fc 0%,
                #f4f6fa 100%
              );
          }

          .container {
            max-width: 1500px;
            margin: 0 auto;
          }

          .hero {
            position: relative;
            overflow: hidden;
            min-height: 188px;
            padding: 28px 30px;
            border-radius: 28px;
            background:
              radial-gradient(
                circle at 78% 28%,
                rgba(255,255,255,.75) 0 5px,
                transparent 6px
              ),
              radial-gradient(
                circle at 84% 68%,
                rgba(255,255,255,.7) 0 4px,
                transparent 5px
              ),
              linear-gradient(
                115deg,
                #fff2f6 0%,
                #ffe8ef 50%,
                #ffdbe7 100%
              );
            border: 1px solid white;
            box-shadow:
              0 18px 40px rgba(236,72,153,.09);
          }

          .hero-copy {
            position: relative;
            z-index: 3;
            max-width: 680px;
          }

          .kicker {
            color: ${RED};
            font-size: 14px;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: .02em;
          }

          .hero h1 {
            margin: 7px 0 5px;
            color: #111827;
            font-size: clamp(34px,4vw,53px);
            line-height: 1;
            letter-spacing: -.045em;
            font-weight: 950;
          }

          .hero h1 span {
            color: ${RED};
          }

          .subtitle {
            color: #687386;
            font-size: 16px;
            line-height: 1.5;
            font-weight: 650;
          }

          .phone {
            position: absolute;
            z-index: 2;
            right: 255px;
            bottom: -58px;
            width: 138px;
            height: 226px;
            padding: 9px;
            border: 7px solid #202632;
            border-radius: 30px;
            transform: rotate(6deg);
            background:
              linear-gradient(
                145deg,
                #ff2160,
                #882bff 60%,
                #174ed1
              );
            box-shadow:
              0 22px 40px rgba(34,24,67,.2);
          }

          .phone-screen {
            width: 100%;
            height: 100%;
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 52px;
            background:
              radial-gradient(
                circle at 50% 35%,
                #ffd96b 0 13%,
                transparent 14%
              ),
              linear-gradient(
                180deg,
                #3d146f,
                #fa2470 60%,
                #ffb11f
              );
          }

          .hero-note {
            position: absolute;
            z-index: 4;
            right: 24px;
            top: 31px;
            width: 190px;
            min-height: 116px;
            padding: 15px;
            border-radius: 22px;
            background: rgba(255,255,255,.66);
            border: 1px solid rgba(255,255,255,.9);
            backdrop-filter: blur(12px);
            color: #d51d52;
            font-size: 13px;
            font-weight: 850;
            line-height: 1.5;
          }

          .summary {
            display: grid;
            grid-template-columns:
              repeat(3,minmax(0,1fr));
            gap: 14px;
            margin-top: 16px;
          }

          .card {
            margin-top: 16px;
            padding: 22px;
            border-radius: 26px;
            background: rgba(255,255,255,.95);
            border: 1px solid white;
            box-shadow:
              0 15px 38px rgba(15,23,42,.055);
          }

          .section-title {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 17px;
            font-size: 19px;
            font-weight: 950;
          }

          .section-icon {
            width: 38px;
            height: 38px;
            border-radius: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 22px;
            background:
              linear-gradient(
                135deg,
                #ff174f,
                #ff4777
              );
            box-shadow:
              0 9px 20px rgba(255,23,79,.2);
          }

          .form-grid {
            display: grid;
            grid-template-columns:
              repeat(4,minmax(0,1fr));
            gap: 12px;
          }

          .bottom {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            margin-top: 14px;
          }

          .switch-row {
            display: flex;
            align-items: center;
            gap: 11px;
          }

          .switch {
            width: 58px;
            height: 32px;
            padding: 4px;
            border: 0;
            border-radius: 999px;
            cursor: pointer;
            background: #d8dde7;
          }

          .switch.on {
            background:
              linear-gradient(
                135deg,
                #ff174f,
                #ff4a79
              );
          }

          .knob {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: white;
            box-shadow:
              0 2px 7px rgba(0,0,0,.16);
            transition: transform .18s;
          }

          .switch.on .knob {
            transform: translateX(26px);
          }

          .actions {
            display: flex;
            gap: 9px;
            align-items: center;
          }

          .reset {
            height: 50px;
            padding: 0 17px;
            border-radius: 15px;
            border: 1px solid #e3e7ef;
            background: white;
            color: #667085;
            font-weight: 850;
            cursor: pointer;
          }

          .create {
            height: 50px;
            min-width: 220px;
            padding: 0 22px;
            border: 0;
            border-radius: 16px;
            color: white;
            background:
              linear-gradient(
                135deg,
                #ff174f,
                #ff3c6d
              );
            box-shadow:
              0 12px 25px rgba(255,23,79,.22);
            font-size: 14px;
            font-weight: 950;
            cursor: pointer;
          }

          .create:disabled {
            opacity: .6;
            cursor: not-allowed;
          }

          .notice {
            margin-top: 12px;
            padding: 12px 14px;
            border-radius: 14px;
            font-size: 13px;
            font-weight: 800;
          }

          .success {
            color: #137346;
            background: #edfff5;
            border: 1px solid #c8f3dc;
          }

          .error {
            color: #b4234f;
            background: #fff0f4;
            border: 1px solid #ffd2de;
          }

          .list-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 14px;
          }

          .list {
            display: grid;
            gap: 12px;
          }

          .row {
            display: grid;
            grid-template-columns:
              76px minmax(0,1fr) auto;
            align-items: center;
            gap: 14px;
            padding: 13px;
            border: 1px solid #edf0f5;
            border-radius: 19px;
            background:
              linear-gradient(
                180deg,
                #fff,
                #fafbfc
              );
          }

          .title {
            color: #172033;
            font-size: 15px;
            font-weight: 950;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .info {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 7px;
            margin-top: 5px;
            color: #8a93a3;
            font-size: 11px;
            font-weight: 700;
          }

          .pill {
            display: inline-flex;
            align-items: center;
            min-height: 26px;
            padding: 0 10px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 900;
            white-space: nowrap;
          }

          .green {
            color: #13834e;
            background: #eafff2;
          }

          .red {
            color: #d51d52;
            background: #fff0f4;
          }

          .purple {
            color: #7440bb;
            background: #f2ecff;
          }

          .row-actions {
            display: flex;
            gap: 7px;
          }

          .action {
            height: 36px;
            padding: 0 11px;
            border-radius: 11px;
            border: 1px solid #e5e8ee;
            background: white;
            color: #596273;
            font-size: 11px;
            font-weight: 900;
            cursor: pointer;
          }

          .delete {
            color: #d51d52;
            border-color: #ffd5df;
            background: #fff5f7;
          }

          .empty {
            padding: 38px 18px;
            text-align: center;
            border: 1px dashed #dfe4ed;
            border-radius: 20px;
            color: #929aaa;
            font-size: 13px;
            font-weight: 750;
            background: #fbfcfe;
          }

          @media(max-width:1200px) {
            .form-grid {
              grid-template-columns:
                repeat(2,minmax(0,1fr));
            }

            .phone {
              right: 230px;
            }
          }

          @media(max-width:900px) {
            .summary {
              grid-template-columns: 1fr;
            }

            .phone {
              display: none;
            }

            .bottom {
              flex-direction: column;
              align-items: stretch;
            }

            .create {
              width: 100%;
            }

            .actions {
              width: 100%;
            }

            .reset {
              flex: 1;
            }
          }

          @media(max-width:680px) {
            .popup-page {
              padding: 18px 14px 35px;
            }

            .form-grid {
              grid-template-columns: 1fr;
            }

            .hero-note {
              display: none;
            }

            .row {
              grid-template-columns:
                76px minmax(0,1fr);
            }

            .row-actions {
              grid-column: 1 / -1;
              justify-content: flex-end;
            }
          }
        `}</style>

        <div className="container">

          {/* HERO */}

          <section className="hero">
            <div className="hero-copy">
              <div className="kicker">
                GAMERZADDA • APP CONTROL
              </div>

              <h1>
                App Open <span>Popup</span>
              </h1>

              <div className="subtitle">
                Show an image popup whenever the app opens,
                or once per day.
              </div>
            </div>

            <div className="phone">
              <div className="phone-screen">
                🎁
              </div>
            </div>

            <div className="hero-note">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: RED,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 9,
                  fontSize: 17,
                }}
              >
                👁
              </div>

              This popup will be shown to users
              when they open the app.
            </div>
          </section>

          {/* SUMMARY */}

          <section className="summary">

            <SummaryCard
              icon="⚡"
              title="Active Popups"
              value={activeCount}
              subtitle="Currently active"
              background="linear-gradient(135deg,#effff6,#e8fff2)"
              iconBackground="#26c978"
              titleColor="#19684a"
            />

            <SummaryCard
              icon="▣"
              title="Popup Frequency"
              value={frequency}
              subtitle="How often to show"
              background="linear-gradient(135deg,#f0f9ff,#eaf5ff)"
              iconBackground="#249eea"
              titleColor="#275e89"
            />

            <SummaryCard
              icon="◷"
              title="Next Schedule"
              value={nextSchedule}
              subtitle="Start time for popup"
              background="linear-gradient(135deg,#fbf5ff,#f4edff)"
              iconBackground="#8b4de8"
              titleColor="#69418f"
            />

          </section>

          {/* CREATE */}

          <section className="card">

            <div className="section-title">
              <span className="section-icon">
                ＋
              </span>

              Create New Popup
            </div>

            <form onSubmit={createPopup}>

              <div className="form-grid">

                <FormField
                  icon="T"
                  label="Title"
                >
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setField("title", e.target.value)
                    }
                    placeholder="Diwali Tournament"
                    style={inputStyle}
                  />
                </FormField>

                <FormField
                  icon="↗"
                  label="Click Link (Optional)"
                  color="#8b5cf6"
                  bg="#f4efff"
                >
                  <input
                    value={form.clickUrl}
                    onChange={(e) =>
                      setField(
                        "clickUrl",
                        e.target.value
                      )
                    }
                    placeholder="https://gamerzadda.in/offer"
                    style={inputStyle}
                  />
                </FormField>

                <FormField
                  icon="▧"
                  label="Upload Image"
                  hint="JPG / PNG / WebP • Max 10 MB"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file =
                        e.target.files?.[0];

                      if (!file) return;

                      if (!validateFile(file)) {
                        e.target.value = "";
                        return;
                      }

                      selectFile(file);
                    }}
                    style={{
                      width: "100%",
                      height: 48,
                      border: "1px dashed #d9dfea",
                      borderRadius: 15,
                      padding: "5px 8px",
                      background: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#687386",
                      boxSizing: "border-box",
                    }}
                  />
                </FormField>

                <FormField
                  icon="↗"
                  label="Or Image URL (Optional)"
                  color="#8b5cf6"
                  bg="#f4efff"
                >
                  <input
                    value={
                      selectedFile
                        ? ""
                        : form.imageUrl
                    }
                    onChange={(e) => {
                      setSelectedFile(null);

                      if (fileRef.current) {
                        fileRef.current.value = "";
                      }

                      setField(
                        "imageUrl",
                        e.target.value
                      );
                    }}
                    placeholder="https://..."
                    style={inputStyle}
                  />
                </FormField>

                <FormField
                  icon="▣"
                  label="Popup Frequency"
                >
                  <select
                    value={form.displayMode}
                    onChange={(e) =>
                      setField(
                        "displayMode",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  >
                    <option value="once_per_day">
                      Once per day
                    </option>

                    <option value="every_open">
                      Every app open
                    </option>
                  </select>
                </FormField>

                <FormField
                  icon="★"
                  label="Priority"
                  hint="Higher number = higher priority"
                  color="#f59e0b"
                  bg="#fff8e8"
                >
                  <input
                    type="number"
                    min="0"
                    value={form.priority}
                    onChange={(e) =>
                      setField(
                        "priority",
                        e.target.value
                      )
                    }
                    placeholder="0"
                    style={inputStyle}
                  />
                </FormField>

                <FormField
                  icon="▣"
                  label="Start Date & Time"
                >
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) =>
                      setField(
                        "startsAt",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />
                </FormField>

                <FormField
                  icon="▣"
                  label="End Date & Time"
                >
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) =>
                      setField(
                        "endsAt",
                        e.target.value
                      )
                    }
                    style={inputStyle}
                  />
                </FormField>

              </div>

              {selectedFile && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 16,
                    background:
                      "linear-gradient(135deg,#fff7fa,#f8f4ff)",
                    border: "1px solid #f0e9ee",
                  }}
                >
                  <PopupImage
                    src={form.imageUrl}
                    title={form.title}
                  />

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: "#172033",
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      Image selected
                    </div>

                    <div
                      style={{
                        marginTop: 3,
                        color: "#7b8493",
                        fontSize: 11,
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selectedFile.name}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="reset"
                    style={{
                      height: 38,
                      marginLeft: "auto",
                    }}
                    onClick={() => {
                      setSelectedFile(null);
                      setField("imageUrl", "");

                      if (fileRef.current) {
                        fileRef.current.value = "";
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}

              <div className="bottom">

                <div className="switch-row">

                  <button
                    type="button"
                    className={`switch ${
                      form.isActive ? "on" : ""
                    }`}
                    onClick={() =>
                      setField(
                        "isActive",
                        !form.isActive
                      )
                    }
                  >
                    <div className="knob" />
                  </button>

                  <div>
                    <div
                      style={{
                        color: "#172033",
                        fontSize: 14,
                        fontWeight: 900,
                      }}
                    >
                      Active immediately
                    </div>

                    <div
                      style={{
                        marginTop: 2,
                        color: "#8a93a3",
                        fontSize: 11,
                        fontWeight: 650,
                      }}
                    >
                      Show popup as soon as it&apos;s created
                    </div>
                  </div>

                </div>

                <div className="actions">

                  <button
                    type="button"
                    className="reset"
                    onClick={resetForm}
                    disabled={creating}
                  >
                    Reset
                  </button>

                  <button
                    type="submit"
                    className="create"
                    disabled={creating}
                  >
                    {creating
                      ? uploading
                        ? "Uploading..."
                        : "Creating..."
                      : "＋ Create Popup"}
                  </button>

                </div>

              </div>

            </form>

            {message && (
              <div className="notice success">
                {message}
              </div>
            )}

            {error && (
              <div className="notice error">
                {error}
              </div>
            )}

          </section>

          {/* EXISTING POPUPS */}

          <section className="card">

            <div className="list-head">

              <div>
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 950,
                    color: "#172033",
                  }}
                >
                  Popup Campaigns
                </div>

                <div
                  style={{
                    marginTop: 3,
                    color: "#8a93a3",
                    fontSize: 12,
                    fontWeight: 650,
                  }}
                >
                  Manage existing app-open promotions.
                </div>
              </div>

              <span className="pill purple">
                {popups.length} Total
              </span>

            </div>

            {loading ? (
              <div className="empty">
                Loading popups...
              </div>
            ) : popups.length === 0 ? (
              <div className="empty">
                No app popups created.
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 11,
                    fontWeight: 650,
                  }}
                >
                  Create your first popup using the form above.
                </div>
              </div>
            ) : (
              <div className="list">

                {popups.map((item) => {

                  const live = isLive(item);

                  return (
                    <div
                      className="row"
                      key={item.id}
                    >

                      <PopupImage
                        src={item.image_url}
                        title={item.title}
                      />

                      <div
                        style={{
                          minWidth: 0,
                        }}
                      >

                        <div className="title">
                          {item.title ||
                            "Untitled popup"}
                        </div>

                        <div className="info">

                          <span
                            className={`pill ${
                              item.is_active
                                ? "green"
                                : "red"
                            }`}
                          >
                            {item.is_active
                              ? live
                                ? "LIVE"
                                : "ENABLED"
                              : "DISABLED"}
                          </span>

                          <span className="pill purple">
                            {item.display_mode ===
                            "every_open"
                              ? "Every open"
                              : "Once per day"}
                          </span>

                          <span>
                            Priority{" "}
                            {item.priority ?? 0}
                          </span>

                          <span>
                            Start{" "}
                            {formatDate(
                              item.starts_at
                            )}
                          </span>

                          <span>
                            End{" "}
                            {formatDate(
                              item.ends_at
                            )}
                          </span>

                        </div>

                      </div>

                      <div className="row-actions">

                        <button
                          type="button"
                          className="action"
                          onClick={() =>
                            togglePopup(item)
                          }
                        >
                          {item.is_active
                            ? "Disable"
                            : "Enable"}
                        </button>

                        <button
                          type="button"
                          className="action delete"
                          onClick={() =>
                            deletePopup(item)
                          }
                        >
                          Delete
                        </button>

                      </div>

                    </div>
                  );
                })}

              </div>
            )}

          </section>

        </div>
      </div>
    </AdminShell>
  );
}