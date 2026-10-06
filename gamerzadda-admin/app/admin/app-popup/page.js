 "use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../../../components/AdminShell";
import { supabase } from "../../../lib/supabase.js";

const RED = "#ff174f";

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function niceDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function AppPopupPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    title: "",
    image_url: "",
    click_url: "",
    display_mode: "once_per_day",
    starts_at: toLocalInput(new Date().toISOString()),
    ends_at: toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    priority: 0,
    is_active: true,
  });
  const [selectedFile, setSelectedFile] = useState(null);

  const activeCount = useMemo(
    () => items.filter((x) => x.is_active).length,
    [items]
  );

  async function load() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("app_popups")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setItems([]);
    } else {
      setItems(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function chooseFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Please select an image.");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage("Image must be 10 MB or smaller.");
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
    setField("image_url", "");
    setMessage(`Selected: ${file.name}`);
  }

  async function createPopup(e) {
    e.preventDefault();
    setMessage("");
    setSaving(true);

    let storagePath = null;

    try {
      let imageUrl = form.image_url.trim();

      if (selectedFile) {
        const safe = selectedFile.name
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");

        storagePath =
          `app-popups/${Date.now()}-${crypto.randomUUID()}-${safe || "popup"}`;

        const { error: uploadError } = await supabase.storage
          .from("banners")
          .upload(storagePath, selectedFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: selectedFile.type,
          });

        if (uploadError) {
          throw new Error(`Image upload failed: ${uploadError.message}`);
        }

        const { data: publicData } = supabase.storage
          .from("banners")
          .getPublicUrl(storagePath);

        imageUrl = publicData.publicUrl;
      } else {
        const parsed = new URL(imageUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Image URL must use http/https.");
        }
      }

      if (!imageUrl) {
        throw new Error("Upload an image or enter an image URL.");
      }

      const clickUrl = form.click_url.trim();
      if (clickUrl) {
        const parsedClick = new URL(clickUrl);
        if (!["http:", "https:"].includes(parsedClick.protocol)) {
          throw new Error("Link must use http/https.");
        }
      }

      const startsAt = toIso(form.starts_at);
      const endsAt = toIso(form.ends_at);

      if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
        throw new Error("End time must be after start time.");
      }

      const { error } = await supabase.from("app_popups").insert({
        title: form.title.trim() || null,
        image_url: imageUrl,
        storage_path: storagePath,
        click_url: clickUrl || null,
        display_mode: form.display_mode,
        starts_at: startsAt,
        ends_at: endsAt,
        priority: Number(form.priority) || 0,
        is_active: !!form.is_active,
      });

      if (error) {
        if (storagePath) {
          await supabase.storage.from("banners").remove([storagePath]);
        }
        throw new Error(error.message);
      }

      setForm({
        title: "",
        image_url: "",
        click_url: "",
        display_mode: "once_per_day",
        starts_at: toLocalInput(new Date().toISOString()),
        ends_at: toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
        priority: 0,
        is_active: true,
      });
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";

      setMessage("Popup created successfully.");
      await load();
    } catch (err) {
      setMessage(err?.message || "Could not create popup.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item) {
    const { error } = await supabase
      .from("app_popups")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);

    if (error) setMessage(error.message);
    else await load();
  }

  async function deletePopup(item) {
    if (!window.confirm("Delete this app popup?")) return;

    if (item.storage_path) {
      await supabase.storage.from("banners").remove([item.storage_path]);
    }

    const { error } = await supabase
      .from("app_popups")
      .delete()
      .eq("id", item.id);

    if (error) setMessage(error.message);
    else {
      setMessage("Popup deleted.");
      await load();
    }
  }

  return (
    <AdminShell>
      <main className="min-h-screen bg-[#f6f7fb] p-5 md:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-black tracking-[2px]" style={{ color: RED }}>
                GAMERZADDA • APP CONTROL
              </div>
              <h1 className="mt-1 text-3xl font-black text-slate-900">
                App Open Popup
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Show an image popup whenever the app opens, or once per day.
              </p>
            </div>

            <div className="rounded-2xl bg-white px-5 py-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Active
              </div>
              <div className="text-xl font-black text-slate-900">
                {activeCount}
              </div>
            </div>
          </div>

          <section className="mb-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-5 text-lg font-black">Create Popup</h2>

            <form onSubmit={createPopup} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  Title
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="Diwali Tournament"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#ff174f]"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  Click Link
                </label>
                <input
                  value={form.click_url}
                  onChange={(e) => setField("click_url", e.target.value)}
                  placeholder="https://gamerzadda.in/offer"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#ff174f]"
                />
              </div>

              <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="mb-2 block text-xs font-bold text-slate-500">
                    Upload Image
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={chooseFile}
                    className="block w-full text-sm"
                  />
                  <p className="mt-2 text-[11px] text-slate-400">
                    JPG/PNG/WebP • max 10 MB
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold text-slate-500">
                    Or Image URL
                  </label>
                  <input
                    value={form.image_url}
                    onChange={(e) => {
                      setField("image_url", e.target.value);
                      setSelectedFile(null);
                    }}
                    placeholder="https://..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-[#ff174f]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  Popup Frequency
                </label>
                <select
                  value={form.display_mode}
                  onChange={(e) => setField("display_mode", e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold outline-none"
                >
                  <option value="once_per_day">Once per day</option>
                  <option value="every_open">Every app open</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  Priority
                </label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setField("priority", e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  Start
                </label>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setField("starts_at", e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-slate-500">
                  End
                </label>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setField("ends_at", e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                />
              </div>

              <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setField("is_active", e.target.checked)}
                  className="h-5 w-5 accent-[#ff174f]"
                />
                Active immediately
              </label>

              <div className="flex items-end">
                <button
                  disabled={saving}
                  className="w-full rounded-2xl px-5 py-3 font-black text-white shadow-lg disabled:opacity-50"
                  style={{ background: RED }}
                >
                  {saving ? "Creating..." : "＋ Create Popup"}
                </button>
              </div>
            </form>

            {message && (
              <div className="mt-4 rounded-2xl bg-pink-50 px-4 py-3 text-sm font-bold text-pink-700">
                {message}
              </div>
            )}
          </section>

          <section className="space-y-4">
            {loading ? (
              <div className="rounded-3xl bg-white p-8 text-center text-slate-400">
                Loading popups...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 text-center text-slate-400">
                No app popups created.
              </div>
            ) : (
              items.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="grid gap-0 md:grid-cols-[240px_1fr]">
                    <img
                      src={item.image_url}
                      alt={item.title || "Popup"}
                      className="h-48 w-full object-cover md:h-full"
                    />

                    <div className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-black text-slate-900">
                            {item.title || "Untitled Popup"}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${
                              item.is_active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}>
                              {item.is_active ? "ACTIVE" : "OFF"}
                            </span>
                            <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-black text-pink-600">
                              {item.display_mode === "every_open"
                                ? "EVERY OPEN"
                                : "ONCE / DAY"}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => toggle(item)}
                            className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black"
                          >
                            {item.is_active ? "Disable" : "Enable"}
                          </button>
                          <button
                            onClick={() => deletePopup(item)}
                            className="rounded-xl bg-red-50 px-4 py-2 text-xs font-black text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <b className="block text-xs text-slate-400">START</b>
                          {niceDate(item.starts_at)}
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <b className="block text-xs text-slate-400">END</b>
                          {niceDate(item.ends_at)}
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <b className="block text-xs text-slate-400">PRIORITY</b>
                          {item.priority}
                        </div>
                      </div>

                      {item.click_url && (
                        <div className="mt-3 truncate rounded-2xl bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700">
                          🔗 {item.click_url}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
        </div>
      </main>
    </AdminShell>
  );
}
