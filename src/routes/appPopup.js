const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// =====================================================
// SUPABASE ADMIN CLIENT
// =====================================================

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
    console.error(
        "APP POPUP ERROR: SUPABASE URL is missing."
    );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        "APP POPUP ERROR: SUPABASE_SERVICE_ROLE_KEY is missing."
    );
}

const supabaseAdmin =
    SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
              SUPABASE_URL,
              SUPABASE_SERVICE_ROLE_KEY,
              {
                  auth: {
                      autoRefreshToken: false,
                      persistSession: false
                  }
              }
          )
        : null;

// =====================================================
// HELPERS
// =====================================================

function hashValue(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");
}

function getBearerToken(req) {
    const authorization =
        req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
        return "";
    }

    return authorization
        .slice(7)
        .trim();
}

// =====================================================
// ADMIN AUTH
// =====================================================

async function requireAdmin(req) {
    if (!supabaseAdmin) {
        return {
            ok: false,
            status: 500,
            error: "Supabase server configuration is missing."
        };
    }

    // -------------------------------------------------
    // 1. Supabase Auth Bearer token
    // -------------------------------------------------

    const bearerToken =
        getBearerToken(req);

    if (bearerToken) {
        try {
            const {
                data,
                error
            } =
                await supabaseAdmin.auth.getUser(
                    bearerToken
                );

            if (
                !error &&
                data?.user?.id
            ) {
                let {
                    data: admin,
                    error: adminError
                } =
                    await supabaseAdmin
                        .from("users")
                        .select(
                            "id, role, email"
                        )
                        .eq(
                            "id",
                            data.user.id
                        )
                        .maybeSingle();

                // Some installations have
                // auth.users.id different from users.id.
                if (
                    admin?.role !== "admin" &&
                    data.user.email
                ) {
                    const result =
                        await supabaseAdmin
                            .from("users")
                            .select(
                                "id, role, email"
                            )
                            .ilike(
                                "email",
                                data.user.email
                                    .trim()
                                    .toLowerCase()
                            )
                            .maybeSingle();

                    admin = result.data;
                    adminError =
                        result.error;
                }

                if (
                    !adminError &&
                    admin?.role === "admin"
                ) {
                    return {
                        ok: true,
                        userId: admin.id
                    };
                }

                return {
                    ok: false,
                    status: 403,
                    error:
                        "Access denied. Admin only."
                };
            }
        } catch (error) {
            console.warn(
                "APP POPUP AUTH TOKEN CHECK:",
                error?.message || error
            );
        }
    }

    // -------------------------------------------------
    // 2. Gamerzadda custom session cookie
    // -------------------------------------------------

    const cookies =
        req.headers.cookie || "";

    const sessionMatch =
        cookies.match(
            /(?:^|;\s*)gamerzadda_session=([^;]+)/
        );

    if (!sessionMatch) {
        return {
            ok: false,
            status: 401,
            error:
                "Admin login required."
        };
    }

    const rawToken =
        sessionMatch[1];

    let decodedToken =
        rawToken;

    try {
        decodedToken =
            decodeURIComponent(
                rawToken
            );
    } catch (_) {}

    const candidates = [
        ...new Set([
            decodedToken,
            rawToken,
            hashValue(
                decodedToken
            ),
            hashValue(rawToken)
        ])
    ];

    let session = null;
    let sessionError = null;

    for (
        const candidate of candidates
    ) {
        try {
            const result =
                await supabaseAdmin
                    .from(
                        "user_sessions"
                    )
                    .select(
                        "user_id, expires_at"
                    )
                    .eq(
                        "token_hash",
                        candidate
                    )
                    .maybeSingle();

            if (
                result.data?.user_id
            ) {
                session =
                    result.data;
                sessionError =
                    null;
                break;
            }

            sessionError =
                result.error;
        } catch (error) {
            sessionError =
                error;
        }
    }

    if (
        sessionError ||
        !session?.user_id
    ) {
        return {
            ok: false,
            status: 401,
            error:
                "Invalid session."
        };
    }

    if (
        session.expires_at &&
        new Date(
            session.expires_at
        ).getTime() <= Date.now()
    ) {
        return {
            ok: false,
            status: 401,
            error:
                "Session expired."
        };
    }

    const {
        data: admin,
        error: adminError
    } =
        await supabaseAdmin
            .from("users")
            .select(
                "id, role"
            )
            .eq(
                "id",
                session.user_id
            )
            .maybeSingle();

    if (
        adminError ||
        admin?.role !== "admin"
    ) {
        return {
            ok: false,
            status: 403,
            error:
                "Access denied. Admin only."
        };
    }

    return {
        ok: true,
        userId: admin.id
    };
}

// =====================================================
// NORMALIZE POPUP
// =====================================================

function normalizePopup(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        title: row.title || "",
        image_url:
            row.image_url || "",
        imageUrl:
            row.image_url || "",
        storage_path:
            row.storage_path || "",
        storagePath:
            row.storage_path || "",
        click_url:
            row.click_url || "",
        clickUrl:
            row.click_url || "",
        display_mode:
            row.display_mode ||
            "every_open",
        displayMode:
            row.display_mode ||
            "every_open",
        starts_at:
            row.starts_at,
        startsAt:
            row.starts_at,
        ends_at:
            row.ends_at,
        endsAt:
            row.ends_at,
        is_active:
            Boolean(row.is_active),
        isActive:
            Boolean(row.is_active),
        priority:
            Number(row.priority || 0),
        created_at:
            row.created_at,
        createdAt:
            row.created_at,
        updated_at:
            row.updated_at,
        updatedAt:
            row.updated_at
    };
}

// =====================================================
// PUBLIC
// GET /api/app-popup/active
//
// Android uses this endpoint.
// NO ADMIN AUTH REQUIRED.
// =====================================================

router.get(
    "/active",
    async (req, res) => {
        try {
            if (!supabaseAdmin) {
                return res.status(500).json({
                    success: false,
                    error:
                        "Popup backend is not configured."
                });
            }

            const now =
                new Date().toISOString();

            const {
                data,
                error
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .select(
                        [
                            "id",
                            "title",
                            "image_url",
                            "storage_path",
                            "click_url",
                            "display_mode",
                            "starts_at",
                            "ends_at",
                            "is_active",
                            "priority",
                            "created_at",
                            "updated_at"
                        ].join(",")
                    )
                    .eq(
                        "is_active",
                        true
                    )
                    .lte(
                        "starts_at",
                        now
                    )
                    .gt(
                        "ends_at",
                        now
                    )
                    .order(
                        "priority",
                        {
                            ascending:
                                false
                        }
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    )
                    .limit(1)
                    .maybeSingle();

            if (error) {
                console.error(
                    "APP POPUP ACTIVE DB ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        error.message ||
                        "Unable to load active popup."
                });
            }

            return res.status(200).json({
                success: true,
                popup:
                    normalizePopup(
                        data
                    )
            });
        } catch (error) {
            console.error(
                "APP POPUP ACTIVE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Unable to load popup."
            });
        }
    }
);

// =====================================================
// ADMIN
// GET /api/app-popup
// =====================================================

router.get(
    "/",
    async (req, res) => {
        try {
            const auth =
                await requireAdmin(req);

            if (!auth.ok) {
                return res.status(
                    auth.status || 401
                ).json({
                    success: false,
                    error: auth.error
                });
            }

            const {
                data,
                error
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .select("*")
                    .order(
                        "priority",
                        {
                            ascending:
                                false
                        }
                    )
                    .order(
                        "created_at",
                        {
                            ascending:
                                false
                        }
                    );

            if (error) {
                throw error;
            }

            return res.status(200).json({
                success: true,
                popups:
                    (data || []).map(
                        normalizePopup
                    )
            });
        } catch (error) {
            console.error(
                "APP POPUP LIST ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Unable to load popups."
            });
        }
    }
);

// =====================================================
// ADMIN
// GET /api/app-popup/:id
// =====================================================

router.get(
    "/:id",
    async (req, res) => {
        try {
            const auth =
                await requireAdmin(req);

            if (!auth.ok) {
                return res.status(
                    auth.status || 401
                ).json({
                    success: false,
                    error: auth.error
                });
            }

            const id =
                String(
                    req.params.id || ""
                ).trim();

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Popup ID is required."
                });
            }

            const {
                data,
                error
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .select("*")
                    .eq("id", id)
                    .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Popup not found."
                });
            }

            return res.status(200).json({
                success: true,
                popup:
                    normalizePopup(
                        data
                    )
            });
        } catch (error) {
            console.error(
                "APP POPUP GET ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Unable to load popup."
            });
        }
    }
);

// =====================================================
// ADMIN
// POST /api/app-popup
// =====================================================

router.post(
    "/",
    async (req, res) => {
        try {
            const auth =
                await requireAdmin(req);

            if (!auth.ok) {
                return res.status(
                    auth.status || 401
                ).json({
                    success: false,
                    error: auth.error
                });
            }

            const body =
                req.body || {};

            const title =
                String(
                    body.title || ""
                ).trim();

            const imageUrl =
                String(
                    body.image_url ??
                        body.imageUrl ??
                        ""
                ).trim();

            const storagePath =
                String(
                    body.storage_path ??
                        body.storagePath ??
                        ""
                ).trim();

            const clickUrl =
                String(
                    body.click_url ??
                        body.clickUrl ??
                        ""
                ).trim();

            const displayMode =
                String(
                    body.display_mode ??
                        body.displayMode ??
                        "every_open"
                ).trim();

            const startsAt =
                body.starts_at ??
                body.startsAt;

            const endsAt =
                body.ends_at ??
                body.endsAt;

            const isActive =
                body.is_active ??
                body.isActive ??
                true;

            const priority =
                Number(
                    body.priority ?? 0
                );

            // -----------------------------
            // Validation
            // -----------------------------

            if (!title) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Popup title is required."
                });
            }

            if (!imageUrl) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Popup image URL is required."
                });
            }

            if (
                ![
                    "every_open",
                    "once_per_day"
                ].includes(
                    displayMode
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Invalid popup frequency."
                });
            }

            if (!startsAt || !endsAt) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Start and end time are required."
                });
            }

            const startDate =
                new Date(startsAt);

            const endDate =
                new Date(endsAt);

            if (
                Number.isNaN(
                    startDate.getTime()
                ) ||
                Number.isNaN(
                    endDate.getTime()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Invalid popup date/time."
                });
            }

            if (
                endDate.getTime() <=
                startDate.getTime()
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "End time must be after start time."
                });
            }

            const safePriority =
                Number.isFinite(
                    priority
                )
                    ? Math.max(
                          0,
                          Math.floor(
                              priority
                          )
                      )
                    : 0;

            // -----------------------------
            // Insert
            // -----------------------------

            const {
                data,
                error
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .insert({
                        title,
                        image_url:
                            imageUrl,
                        storage_path:
                            storagePath ||
                            null,
                        click_url:
                            clickUrl ||
                            null,
                        display_mode:
                            displayMode,
                        starts_at:
                            startDate.toISOString(),
                        ends_at:
                            endDate.toISOString(),
                        is_active:
                            Boolean(
                                isActive
                            ),
                        priority:
                            safePriority
                    })
                    .select("*")
                    .single();

            if (error) {
                throw error;
            }

            console.log(
                "APP POPUP CREATED:",
                data?.id
            );

            return res.status(201).json({
                success: true,
                popup:
                    normalizePopup(
                        data
                    )
            });
        } catch (error) {
            console.error(
                "APP POPUP CREATE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Unable to create popup."
            });
        }
    }
);

// =====================================================
// ADMIN
// PUT /api/app-popup/:id
// =====================================================

router.put(
    "/:id",
    async (req, res) => {
        try {
            const auth =
                await requireAdmin(req);

            if (!auth.ok) {
                return res.status(
                    auth.status || 401
                ).json({
                    success: false,
                    error: auth.error
                });
            }

            const id =
                String(
                    req.params.id || ""
                ).trim();

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Popup ID is required."
                });
            }

            const body =
                req.body || {};

            const updates = {};

            if (
                body.title !== undefined
            ) {
                const title =
                    String(
                        body.title || ""
                    ).trim();

                if (!title) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "Popup title cannot be empty."
                    });
                }

                updates.title =
                    title;
            }

            if (
                body.image_url !==
                    undefined ||
                body.imageUrl !==
                    undefined
            ) {
                updates.image_url =
                    String(
                        body.image_url ??
                            body.imageUrl ??
                            ""
                    ).trim();
            }

            if (
                body.storage_path !==
                    undefined ||
                body.storagePath !==
                    undefined
            ) {
                updates.storage_path =
                    String(
                        body.storage_path ??
                            body.storagePath ??
                            ""
                    ).trim() || null;
            }

            if (
                body.click_url !==
                    undefined ||
                body.clickUrl !==
                    undefined
            ) {
                updates.click_url =
                    String(
                        body.click_url ??
                            body.clickUrl ??
                            ""
                    ).trim() || null;
            }

            if (
                body.display_mode !==
                    undefined ||
                body.displayMode !==
                    undefined
            ) {
                const mode =
                    String(
                        body.display_mode ??
                            body.displayMode ??
                            ""
                    ).trim();

                if (
                    ![
                        "every_open",
                        "once_per_day"
                    ].includes(mode)
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "Invalid popup frequency."
                    });
                }

                updates.display_mode =
                    mode;
            }

            if (
                body.starts_at !==
                    undefined ||
                body.startsAt !==
                    undefined
            ) {
                const value =
                    body.starts_at ??
                    body.startsAt;

                const date =
                    new Date(value);

                if (
                    Number.isNaN(
                        date.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "Invalid start date/time."
                    });
                }

                updates.starts_at =
                    date.toISOString();
            }

            if (
                body.ends_at !==
                    undefined ||
                body.endsAt !==
                    undefined
            ) {
                const value =
                    body.ends_at ??
                    body.endsAt;

                const date =
                    new Date(value);

                if (
                    Number.isNaN(
                        date.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "Invalid end date/time."
                    });
                }

                updates.ends_at =
                    date.toISOString();
            }

            if (
                body.is_active !==
                    undefined ||
                body.isActive !==
                    undefined
            ) {
                updates.is_active =
                    Boolean(
                        body.is_active ??
                            body.isActive
                    );
            }

            if (
                body.priority !==
                    undefined
            ) {
                const priority =
                    Number(
                        body.priority
                    );

                if (
                    !Number.isFinite(
                        priority
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "Invalid priority."
                    });
                }

                updates.priority =
                    Math.max(
                        0,
                        Math.floor(
                            priority
                        )
                    );
            }

            if (
                Object.keys(
                    updates
                ).length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        "No popup changes supplied."
                });
            }

            // If both dates are available after update,
            // verify the final window.
            if (
                updates.starts_at ||
                updates.ends_at
            ) {
                const {
                    data: existing,
                    error: existingError
                } =
                    await supabaseAdmin
                        .from(
                            "app_popups"
                        )
                        .select(
                            "starts_at, ends_at"
                        )
                        .eq(
                            "id",
                            id
                        )
                        .maybeSingle();

                if (existingError) {
                    throw existingError;
                }

                if (!existing) {
                    return res.status(404).json({
                        success: false,
                        error:
                            "Popup not found."
                    });
                }

                const finalStart =
                    updates.starts_at ||
                    existing.starts_at;

                const finalEnd =
                    updates.ends_at ||
                    existing.ends_at;

                if (
                    new Date(
                        finalEnd
                    ).getTime() <=
                    new Date(
                        finalStart
                    ).getTime()
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            "End time must be after start time."
                    });
                }
            }

            const {
                data,
                error
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .update(
                        updates
                    )
                    .eq(
                        "id",
                        id
                    )
                    .select("*")
                    .single();

            if (error) {
                throw error;
            }

            return res.status(200).json({
                success: true,
                popup:
                    normalizePopup(
                        data
                    )
            });
        } catch (error) {
            console.error(
                "APP POPUP UPDATE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Unable to update popup."
            });
        }
    }
);

// =====================================================
// ADMIN
// PATCH /api/app-popup/:id/toggle
// =====================================================

router.patch(
    "/:id/toggle",
    async (req, res) => {
        try {
            const auth =
                await requireAdmin(req);

            if (!auth.ok) {
                return res.status(
                    auth.status || 401
                ).json({
                    success: false,
                    error: auth.error
                });
            }

            const id =
                String(
                    req.params.id || ""
                ).trim();

            const {
                data: existing,
                error: existingError
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .select(
                        "id, is_active"
                    )
                    .eq(
                        "id",
                        id
                    )
                    .maybeSingle();

            if (existingError) {
                throw existingError;
            }

            if (!existing) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Popup not found."
                });
            }

            const {
                data,
                error
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .update({
                        is_active:
                            !Boolean(
                                existing.is_active
                            )
                    })
                    .eq(
                        "id",
                        id
                    )
                    .select("*")
                    .single();

            if (error) {
                throw error;
            }

            return res.status(200).json({
                success: true,
                popup:
                    normalizePopup(
                        data
                    )
            });
        } catch (error) {
            console.error(
                "APP POPUP TOGGLE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Unable to toggle popup."
            });
        }
    }
);

// =====================================================
// ADMIN
// DELETE /api/app-popup/:id
// =====================================================

router.delete(
    "/:id",
    async (req, res) => {
        try {
            const auth =
                await requireAdmin(req);

            if (!auth.ok) {
                return res.status(
                    auth.status || 401
                ).json({
                    success: false,
                    error: auth.error
                });
            }

            const id =
                String(
                    req.params.id || ""
                ).trim();

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Popup ID is required."
                });
            }

            const {
                data: existing,
                error: existingError
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .select(
                        "id, storage_path"
                    )
                    .eq(
                        "id",
                        id
                    )
                    .maybeSingle();

            if (existingError) {
                throw existingError;
            }

            if (!existing) {
                return res.status(404).json({
                    success: false,
                    error:
                        "Popup not found."
                });
            }

            const {
                error: deleteError
            } =
                await supabaseAdmin
                    .from("app_popups")
                    .delete()
                    .eq(
                        "id",
                        id
                    );

            if (deleteError) {
                throw deleteError;
            }

            // -----------------------------------------
            // Delete associated storage image when
            // storage_path exists.
            // -----------------------------------------

            if (
                existing.storage_path
            ) {
                try {
                    await supabaseAdmin
                        .storage
                        .from("banners")
                        .remove([
                            existing.storage_path
                        ]);
                } catch (
                    storageError
                ) {
                    console.warn(
                        "APP POPUP STORAGE DELETE WARNING:",
                        storageError
                    );
                }
            }

            return res.status(200).json({
                success: true,
                message:
                    "Popup deleted successfully."
            });
        } catch (error) {
            console.error(
                "APP POPUP DELETE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Unable to delete popup."
            });
        }
    }
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;