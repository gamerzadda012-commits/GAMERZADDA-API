"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

const DEFAULT_FORM = {
  latest_version: "1.0",
  minimum_version: "1.0",
  version_code: 1,
  apk_url: "",
  force_update: false,
  update_title: "New Update Available",
  update_message:
    "A new version of GamerzAdda is available. Please update to continue.",
};

export default function AppVersionPage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadVersion = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("app_version_control")
        .select("*")
        .eq("platform", "android")
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (!data) {
        setError("Android version configuration not found.");
        return;
      }

      setForm({
        latest_version: data.latest_version || "1.0",
        minimum_version: data.minimum_version || "1.0",
        version_code: Number(data.version_code || 1),
        apk_url: data.apk_url || "",
        force_update: Boolean(data.force_update),
        update_title:
          data.update_title || "New Update Available",
        update_message:
          data.update_message ||
          "A new version of GamerzAdda is available. Please update to continue.",
      });
    } catch (err) {
      console.error("VERSION LOAD ERROR:", err);
      setError(err?.message || "Failed to load version settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersion();
  }, []);

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setMessage("");
    setError("");
  };

  const saveVersion = async () => {
    try {
      setSaving(true);
      setMessage("");
      setError("");

      const latestVersion = form.latest_version.trim();
      const minimumVersion = form.minimum_version.trim();
      const versionCode = Number(form.version_code);

      if (!latestVersion) {
        setError("Latest version is required.");
        return;
      }

      if (!minimumVersion) {
        setError("Minimum supported version is required.");
        return;
      }

      if (
        !Number.isInteger(versionCode) ||
        versionCode < 1
      ) {
        setError("Version code must be a valid number.");
        return;
      }

      const { data, error: updateError } = await supabase
        .from("app_version_control")
        .update({
          latest_version: latestVersion,
          minimum_version: minimumVersion,
          version_code: versionCode,
          apk_url: form.apk_url.trim() || null,
          force_update: Boolean(form.force_update),
          update_title:
            form.update_title.trim() ||
            "New Update Available",
          update_message:
            form.update_message.trim() ||
            "A new version of GamerzAdda is available. Please update to continue.",
          updated_at: new Date().toISOString(),
        })
        .eq("platform", "android")
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      if (!data) {
        throw new Error(
          "Version configuration was not updated."
        );
      }

      setMessage(
        `Version settings saved successfully. Android ${data.latest_version}`
      );
    } catch (err) {
      console.error("VERSION SAVE ERROR:", err);
      setError(
        err?.message ||
          "Failed to save version settings."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <strong>Loading version settings...</strong>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        {/* HEADER */}
        <div style={styles.header}>
          <div>
            <div style={styles.eyebrow}>
              GAMERZADDA ADMIN
            </div>

            <h1 style={styles.title}>
              App Version Control
            </h1>

            <p style={styles.subtitle}>
              Control Android releases and force updates.
            </p>
          </div>

          <div style={styles.versionBadge}>
            Android
          </div>
        </div>

        {/* STATUS */}
        <div style={styles.statusCard}>
          <div>
            <div style={styles.statusLabel}>
              CURRENT RELEASE
            </div>

            <div style={styles.currentVersion}>
              Android {form.latest_version}
            </div>

            <div style={styles.statusText}>
              Minimum supported:{" "}
              <strong>
                {form.minimum_version}
              </strong>
            </div>
          </div>

          <div
            style={{
              ...styles.forceBadge,
              ...(form.force_update
                ? styles.forceOn
                : styles.forceOff),
            }}
          >
            {form.force_update
              ? "FORCE UPDATE ON"
              : "FORCE UPDATE OFF"}
          </div>
        </div>

        {/* FORM */}
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>
                Android Release
              </h2>

              <p style={styles.cardDescription}>
                Change these values when publishing a
                new APK.
              </p>
            </div>
          </div>

          <div style={styles.grid}>
            <Field
              label="Latest Version"
              value={form.latest_version}
              placeholder="1.0"
              onChange={(value) =>
                updateField(
                  "latest_version",
                  value
                )
              }
            />

            <Field
              label="Minimum Supported Version"
              value={form.minimum_version}
              placeholder="1.0"
              onChange={(value) =>
                updateField(
                  "minimum_version",
                  value
                )
              }
            />

            <Field
              label="Version Code"
              type="number"
              value={form.version_code}
              placeholder="1"
              onChange={(value) =>
                updateField(
                  "version_code",
                  value
                )
              }
            />

            <div style={styles.field}>
              <label style={styles.label}>
                APK Download URL
              </label>

              <input
                type="url"
                value={form.apk_url}
                placeholder="https://..."
                onChange={(event) =>
                  updateField(
                    "apk_url",
                    event.target.value
                  )
                }
                style={styles.input}
              />

              <small style={styles.help}>
                URL where users can download the
                new APK.
              </small>
            </div>
          </div>

          {/* FORCE UPDATE */}
          <div style={styles.forceSection}>
            <div>
              <div style={styles.forceTitle}>
                Force Update
              </div>

              <div style={styles.forceDescription}>
                Block older versions when the minimum
                supported version is higher.
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                updateField(
                  "force_update",
                  !form.force_update
                )
              }
              style={{
                ...styles.switch,
                ...(form.force_update
                  ? styles.switchActive
                  : styles.switchInactive),
              }}
            >
              <span
                style={{
                  ...styles.switchKnob,
                  ...(form.force_update
                    ? styles.knobActive
                    : styles.knobInactive),
                }}
              />
            </button>
          </div>
        </section>

        {/* UPDATE MESSAGE */}
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>
                Update Message
              </h2>

              <p style={styles.cardDescription}>
                This message will be shown to users
                when an update is required.
              </p>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Update Title
            </label>

            <input
              type="text"
              value={form.update_title}
              placeholder="New Update Available"
              onChange={(event) =>
                updateField(
                  "update_title",
                  event.target.value
                )
              }
              style={styles.input}
            />
          </div>

          <div
            style={{
              ...styles.field,
              marginTop: 18,
            }}
          >
            <label style={styles.label}>
              Update Message
            </label>

            <textarea
              value={form.update_message}
              placeholder="Please update GamerzAdda to continue."
              onChange={(event) =>
                updateField(
                  "update_message",
                  event.target.value
                )
              }
              rows={5}
              style={styles.textarea}
            />
          </div>
        </section>

        {/* PREVIEW */}
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>
                Update Preview
              </h2>

              <p style={styles.cardDescription}>
                Preview of what an old-version user
                will see.
              </p>
            </div>
          </div>

          <div style={styles.preview}>
            <div style={styles.previewIcon}>
              ↻
            </div>

            <div style={styles.previewTitle}>
              {form.update_title ||
                "New Update Available"}
            </div>

            <div style={styles.previewVersion}>
              GamerzAdda {form.latest_version}
            </div>

            <div style={styles.previewMessage}>
              {form.update_message ||
                "Please update GamerzAdda to continue."}
            </div>

            <button
              type="button"
              style={styles.previewButton}
              disabled
            >
              UPDATE NOW
            </button>
          </div>
        </section>

        {/* MESSAGES */}
        {error && (
          <div style={styles.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {message && (
          <div style={styles.success}>
            ✓ {message}
          </div>
        )}

        {/* SAVE */}
        <div style={styles.saveRow}>
          <button
            type="button"
            onClick={saveVersion}
            disabled={saving}
            style={{
              ...styles.saveButton,
              ...(saving
                ? styles.saveDisabled
                : {}),
            }}
          >
            {saving
              ? "SAVING..."
              : "SAVE VERSION SETTINGS"}
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>
        {label}
      </label>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
        style={styles.input}
      />
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f7f9",
    padding: "32px 20px 60px",
    color: "#111827",
  },

  container: {
    width: "100%",
    maxWidth: 1050,
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 24,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.14em",
    color: "#ff174f",
    marginBottom: 7,
  },

  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.15,
    fontWeight: 850,
    letterSpacing: "-0.03em",
  },

  subtitle: {
    margin: "8px 0 0",
    color: "#6b7280",
    fontSize: 14,
  },

  versionBadge: {
    padding: "10px 16px",
    borderRadius: 999,
    background: "#fff0f3",
    color: "#ff174f",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  statusCard: {
    background: "#111827",
    color: "#fff",
    borderRadius: 24,
    padding: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    marginBottom: 18,
    boxShadow:
      "0 12px 35px rgba(17,24,39,0.12)",
  },

  statusLabel: {
    fontSize: 10,
    letterSpacing: "0.14em",
    fontWeight: 800,
    opacity: 0.55,
  },

  currentVersion: {
    fontSize: 27,
    fontWeight: 850,
    marginTop: 5,
  },

  statusText: {
    marginTop: 5,
    fontSize: 13,
    color: "#d1d5db",
  },

  forceBadge: {
    borderRadius: 999,
    padding: "9px 13px",
    fontSize: 10,
    fontWeight: 850,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
  },

  forceOn: {
    background: "#fee2e2",
    color: "#b91c1c",
  },

  forceOff: {
    background: "#dcfce7",
    color: "#15803d",
  },

  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 22,
    padding: 24,
    marginBottom: 18,
    boxShadow:
      "0 5px 18px rgba(17,24,39,0.04)",
  },

  cardHeader: {
    marginBottom: 22,
  },

  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
  },

  cardDescription: {
    margin: "5px 0 0",
    color: "#6b7280",
    fontSize: 13,
  },

  grid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 18,
  },

  field: {
    display: "flex",
    flexDirection: "column",
  },

  label: {
    fontSize: 12,
    fontWeight: 750,
    color: "#374151",
    marginBottom: 8,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    height: 46,
    border: "1px solid #dfe3e8",
    borderRadius: 13,
    padding: "0 13px",
    outline: "none",
    fontSize: 14,
    color: "#111827",
    background: "#fff",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #dfe3e8",
    borderRadius: 13,
    padding: "13px",
    outline: "none",
    resize: "vertical",
    fontSize: 14,
    lineHeight: 1.5,
    color: "#111827",
    background: "#fff",
  },

  help: {
    marginTop: 6,
    color: "#9ca3af",
    fontSize: 11,
  },

  forceSection: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #edf0f3",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
  },

  forceTitle: {
    fontSize: 14,
    fontWeight: 800,
  },

  forceDescription: {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 12,
  },

  switch: {
    width: 58,
    height: 32,
    border: 0,
    borderRadius: 999,
    padding: 3,
    cursor: "pointer",
    position: "relative",
    flexShrink: 0,
  },

  switchActive: {
    background: "#ff174f",
  },

  switchInactive: {
    background: "#d1d5db",
  },

  switchKnob: {
    display: "block",
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#fff",
    transition: "transform 0.2s ease",
    boxShadow:
      "0 2px 5px rgba(0,0,0,0.15)",
  },

  knobActive: {
    transform: "translateX(26px)",
  },

  knobInactive: {
    transform: "translateX(0)",
  },

  preview: {
    maxWidth: 390,
    margin: "0 auto",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 24,
    padding: 25,
    textAlign: "center",
    boxShadow:
      "0 10px 30px rgba(17,24,39,0.08)",
  },

  previewIcon: {
    width: 58,
    height: 58,
    margin: "0 auto 14px",
    borderRadius: "50%",
    background: "#fff0f3",
    color: "#ff174f",
    display: "grid",
    placeItems: "center",
    fontSize: 27,
    fontWeight: 800,
  },

  previewTitle: {
    fontSize: 20,
    fontWeight: 850,
  },

  previewVersion: {
    marginTop: 5,
    color: "#ff174f",
    fontSize: 13,
    fontWeight: 750,
  },

  previewMessage: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 13,
    lineHeight: 1.5,
  },

  previewButton: {
    width: "100%",
    height: 45,
    marginTop: 20,
    border: 0,
    borderRadius: 13,
    background: "#ff174f",
    color: "#fff",
    fontSize: 12,
    fontWeight: 850,
  },

  saveRow: {
    display: "flex",
    justifyContent: "flex-end",
  },

  saveButton: {
    minWidth: 220,
    height: 48,
    border: 0,
    borderRadius: 14,
    background: "#ff174f",
    color: "#fff",
    padding: "0 22px",
    fontSize: 12,
    fontWeight: 850,
    cursor: "pointer",
    boxShadow:
      "0 8px 20px rgba(255,23,79,0.2)",
  },

  saveDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },

  success: {
    marginBottom: 16,
    padding: 13,
    borderRadius: 13,
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#047857",
    fontSize: 13,
    fontWeight: 650,
  },

  error: {
    marginBottom: 16,
    padding: 13,
    borderRadius: 13,
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#be123c",
    fontSize: 13,
  },

  loadingCard: {
    minHeight: "70vh",
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 14,
  },

  spinner: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "3px solid #e5e7eb",
    borderTopColor: "#ff174f",
    animation:
      "versionSpin 0.8s linear infinite",
  },
};