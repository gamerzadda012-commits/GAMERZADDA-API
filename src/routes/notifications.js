const express = require("express");
const fs = require("fs");
const path = require("path");

const {
  createClient,
} = require("@supabase/supabase-js");

const {
  getApps,
  initializeApp,
  cert,
} = require("firebase-admin/app");

const {
  getMessaging,
} = require("firebase-admin/messaging");

const router = express.Router();

/* =========================================================
   HELPERS
========================================================= */

function getSupabaseAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    console.error(
      "SUPABASE SERVICE ROLE CONFIG MISSING",
      {
        hasUrl: Boolean(url),
        hasServiceRoleKey: Boolean(serviceKey),
      }
    );

    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function errorResponse(res, error, status = 500) {
  console.error("NOTIFICATION API ERROR:", error);

  return res.status(status).json({
    success: false,
    error:
      error?.message ||
      String(error) ||
      "Internal server error",
    message:
      error?.message ||
      String(error) ||
      "Internal server error",
  });
}

/* =========================================================
   FIREBASE ADMIN
========================================================= */

function getFirebaseAdmin() {
  const existingApps = getApps();

  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  /*
   * -------------------------------------------------------
   * SERVICE ACCOUNT JSON FILE
   * -------------------------------------------------------
   */

  if (serviceAccountPath) {
    const fullPath = path.resolve(
      process.cwd(),
      serviceAccountPath
    );

    console.log(
      "Firebase service account path:",
      fullPath
    );

    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `Firebase service account file not found: ${fullPath}`
      );
    }

    let serviceAccount;

    try {
      serviceAccount = JSON.parse(
        fs.readFileSync(
          fullPath,
          "utf8"
        )
      );
    } catch (error) {
      throw new Error(
        `Firebase service account JSON is invalid: ${
          error?.message ||
          String(error)
        }`
      );
    }

    const projectId =
      String(
        serviceAccount.project_id || ""
      ).trim();

    const clientEmail =
      String(
        serviceAccount.client_email || ""
      ).trim();

    let privateKey =
      String(
        serviceAccount.private_key || ""
      );

    if (!projectId) {
      throw new Error(
        "Firebase JSON missing project_id."
      );
    }

    if (!clientEmail) {
      throw new Error(
        "Firebase JSON missing client_email."
      );
    }

    if (!privateKey) {
      throw new Error(
        "Firebase JSON missing private_key."
      );
    }

    privateKey = privateKey
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

    try {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (error) {
      console.error(
        "FIREBASE INITIALIZATION ERROR:",
        error
      );

      throw new Error(
        `Firebase initialization failed: ${
          error?.message ||
          String(error)
        }`
      );
    }
  }

  /*
   * -------------------------------------------------------
   * ENV FALLBACK
   * -------------------------------------------------------
   */

  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim();

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL?.trim();

  let privateKey =
    process.env.FIREBASE_PRIVATE_KEY || "";

  if (!projectId) {
    throw new Error(
      "FIREBASE_PROJECT_ID is missing."
    );
  }

  if (!clientEmail) {
    throw new Error(
      "FIREBASE_CLIENT_EMAIL is missing."
    );
  }

  if (!privateKey) {
    throw new Error(
      "Firebase credentials are missing."
    );
  }

  privateKey = String(privateKey)
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (
    privateKey.startsWith('"') &&
    privateKey.endsWith('"')
  ) {
    privateKey = privateKey.slice(1, -1);
  }

  try {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } catch (error) {
    console.error(
      "FIREBASE PRIVATE KEY ERROR:",
      error
    );

    throw new Error(
      `Firebase initialization failed: ${
        error?.message ||
        String(error)
      }`
    );
  }
}

/* =========================================================
   GET NOTIFICATIONS
   GET /api/notifications/:userId
========================================================= */

router.get("/:userId", async (req, res) => {
  try {
    const userId = String(
      req.params.userId || ""
    ).trim();

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required.",
      });
    }

    const db = getSupabaseAdminClient();

    if (!db) {
      return res.status(500).json({
        success: false,
        error:
          "Supabase service-role configuration is missing.",
      });
    }

    /*
     * Fetch:
     * 1. Specific-user notifications
     * 2. Global notifications (user_id IS NULL)
     */

    const {
      data,
      error,
    } = await db
      .from("notifications")
      .select("*")
      .or(
        `user_id.eq.${userId},user_id.is.null`
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(200);

    if (error) {
      console.error(
        "GET NOTIFICATIONS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const allNotifications = data || [];

    /*
     * Global notifications are shared rows.
     * Never delete those rows for one user.
     * Instead, check this user's deletion records.
     */

    const globalNotificationIds =
      allNotifications
        .filter((item) => !item.user_id)
        .map((item) => String(item.id));

    let deletedGlobalIds = new Set();

    if (globalNotificationIds.length > 0) {
      const {
        data: deletedRows,
        error: deletedError,
      } = await db
        .from("notification_user_deletions")
        .select("notification_id")
        .eq("user_id", userId)
        .in(
          "notification_id",
          globalNotificationIds
        );

      if (deletedError) {
        console.error(
          "GET USER NOTIFICATION DELETIONS ERROR:",
          deletedError
        );

        return res.status(500).json({
          success: false,
          error: deletedError.message,
        });
      }

      deletedGlobalIds = new Set(
        (deletedRows || []).map((row) =>
          String(row.notification_id)
        )
      );
    }

    /*
     * Hide only global notifications deleted
     * by THIS user.
     */

    const visibleNotifications =
      allNotifications.filter((item) => {
        if (item.user_id) {
          return true;
        }

        return !deletedGlobalIds.has(
          String(item.id)
        );
      });

    const notifications =
      visibleNotifications.map((item) => ({
        id: String(item.id),
        title: item.title || "",
        message: item.message || "",
        type: item.type || "general",
        is_read:
          item.is_read === true ||
          item.read === true,
        created_at:
          item.created_at || "",
        redirect_url:
          item.redirect_url || "",
      }));

    const unreadCount =
      notifications.filter(
        (item) => !item.is_read
      ).length;

    return res.json({
      success: true,
      notifications,
      unread_count: unreadCount,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
});

/* =========================================================
   MARK SINGLE NOTIFICATION READ
   PATCH /api/notifications/:userId/:notificationId/read
========================================================= */

router.patch(
  "/:userId/:notificationId/read",
  async (req, res) => {
    try {
      const userId = String(
        req.params.userId || ""
      ).trim();

      const notificationId = String(
        req.params.notificationId || ""
      ).trim();

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is required.",
        });
      }

      if (!notificationId) {
        return res.status(400).json({
          success: false,
          error:
            "Notification ID is required.",
        });
      }

      const db = getSupabaseAdminClient();

      if (!db) {
        return res.status(500).json({
          success: false,
          error:
            "Supabase service-role configuration is missing.",
        });
      }

      /*
       * IMPORTANT
       *
       * The current notifications table from the
       * supplied notification route does not show
       * a separate per-user notification/read table.
       *
       * Therefore we DO NOT update the notification
       * globally here. Doing so could mark the same
       * notification read for every user.
       *
       * Return a safe response instead.
       */

      const {
        data: notification,
        error,
      } = await db
        .from("notifications")
        .select("id,user_id")
        .eq("id", notificationId)
        .maybeSingle();

      if (error) {
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }

      if (!notification) {
        return res.status(404).json({
          success: false,
          error:
            "Notification not found.",
        });
      }

      /*
       * Security:
       * A user-specific notification must belong
       * to the requesting user.
       *
       * Global notification (user_id NULL) is valid.
       */

      if (
        notification.user_id &&
        String(notification.user_id) !== userId
      ) {
        return res.status(403).json({
          success: false,
          error: "Access denied.",
        });
      }

      return res.json({
        success: true,
        message:
          "Notification received. Per-user read state requires a notification read-state table.",
        notification_id: notificationId,
      });
    } catch (error) {
      return errorResponse(res, error);
    }
  }
);

/* =========================================================
   MARK ALL READ
   PATCH /api/notifications/:userId/read-all
========================================================= */

router.patch(
  "/:userId/read-all",
  async (req, res) => {
    try {
      const userId = String(
        req.params.userId || ""
      ).trim();

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is required.",
        });
      }

      /*
       * DO NOT globally modify notifications.
       *
       * The current DB structure supplied does not
       * contain a per-user read-state table.
       */

      return res.json({
        success: true,
        message:
          "All notifications acknowledged. Per-user read state requires a notification read-state table.",
      });
    } catch (error) {
      return errorResponse(res, error);
    }
  }
);

/* =========================================================
   DELETE NOTIFICATION
   DELETE /api/notifications/:userId/:notificationId

   IMPORTANT:
   - Specific-user notification:
       physically delete only if it belongs to that user.
   - Global / All Users notification:
       NEVER physically delete the shared row.
       Store a per-user deletion record instead.
========================================================= */

router.delete(
  "/:userId/:notificationId",
  async (req, res) => {
    try {
      const userId = String(
        req.params.userId || ""
      ).trim();

      const notificationId = String(
        req.params.notificationId || ""
      ).trim();

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is required.",
        });
      }

      if (!notificationId) {
        return res.status(400).json({
          success: false,
          error:
            "Notification ID is required.",
        });
      }

      const db = getSupabaseAdminClient();

      if (!db) {
        return res.status(500).json({
          success: false,
          error:
            "Supabase service-role configuration is missing.",
        });
      }

      const {
        data: notification,
        error: findError,
      } = await db
        .from("notifications")
        .select("id,user_id")
        .eq("id", notificationId)
        .maybeSingle();

      if (findError) {
        console.error(
          "FIND NOTIFICATION DELETE ERROR:",
          findError
        );

        return res.status(500).json({
          success: false,
          error: findError.message,
        });
      }

      if (!notification) {
        return res.status(404).json({
          success: false,
          error:
            "Notification not found.",
        });
      }

      /*
       * GLOBAL / ALL-USERS NOTIFICATION
       *
       * user_id IS NULL.
       * Do NOT delete the shared notification.
       * Record deletion only for this user.
       */

      if (!notification.user_id) {
        const {
          error: deletionError,
        } = await db
          .from("notification_user_deletions")
          .upsert(
            {
              user_id: userId,
              notification_id:
                notificationId,
            },
            {
              onConflict:
                "user_id,notification_id",
            }
          );

        if (deletionError) {
          console.error(
            "GLOBAL NOTIFICATION USER DELETE ERROR:",
            deletionError
          );

          return res.status(500).json({
            success: false,
            error:
              deletionError.message,
          });
        }

        return res.json({
          success: true,
          message:
            "Notification deleted for this user.",
          scope: "user",
        });
      }

      /*
       * SPECIFIC-USER NOTIFICATION
       *
       * Only the owner can delete it.
       */

      if (
        String(notification.user_id) !==
        userId
      ) {
        return res.status(403).json({
          success: false,
          error:
            "Access denied.",
        });
      }

      const {
        error: deleteError,
      } = await db
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", userId);

      if (deleteError) {
        console.error(
          "SPECIFIC NOTIFICATION DELETE ERROR:",
          deleteError
        );

        return res.status(500).json({
          success: false,
          error:
            deleteError.message,
        });
      }

      return res.json({
        success: true,
        message:
          "Notification deleted successfully.",
        scope: "user",
      });
    } catch (error) {
      return errorResponse(
        res,
        error
      );
    }
  }
);

/* =========================================================
   SAVE / UPDATE FCM TOKEN
   POST /api/notifications/fcm-token
========================================================= */

router.post(
  "/fcm-token",
  async (req, res) => {
    try {
      const body = req.body || {};

      const userId = String(
        body.userId ||
        body.user_id ||
        ""
      ).trim();

      const token = String(
        body.fcmToken ||
        body.fcm_token ||
        body.token ||
        ""
      ).trim();

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID is required.",
        });
      }

      if (!token) {
        return res.status(400).json({
          success: false,
          error: "FCM token is required.",
        });
      }

      const db = getSupabaseAdminClient();

      if (!db) {
        return res.status(500).json({
          success: false,
          error:
            "Supabase service-role configuration is missing.",
        });
      }

      /*
       * Verify user exists.
       */

      const {
        data: user,
        error: userError,
      } = await db
        .from("users")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (userError) {
        return res.status(500).json({
          success: false,
          error: userError.message,
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found.",
        });
      }

      /*
       * Save FCM token.
       */

      const {
        error: updateError,
      } = await db
        .from("users")
        .update({
          fcm_token: token,
        })
        .eq("id", userId);

      if (updateError) {
        console.error(
          "FCM TOKEN UPDATE ERROR:",
          updateError
        );

        return res.status(500).json({
          success: false,
          error: updateError.message,
        });
      }

      console.log(
        "FCM TOKEN SAVED FOR USER:",
        userId
      );

      return res.json({
        success: true,
        message:
          "FCM token saved successfully.",
      });
    } catch (error) {
      return errorResponse(res, error);
    }
  }
);

/* =========================================================
   ADMIN / SEND NOTIFICATION
   POST /api/notifications/send
========================================================= */

router.post(
  "/send",
  async (req, res) => {
    try {
      const db = getSupabaseAdminClient();

      if (!db) {
        return res.status(500).json({
          success: false,
          error:
            "SUPABASE SERVICE_ROLE configuration is missing.",
        });
      }

      const body = req.body || {};

      const title = String(
        body.title || ""
      ).trim();

      const message = String(
        body.message || ""
      ).trim();

      const type = String(
        body.type || "general"
      )
        .trim()
        .toLowerCase();

      const target = String(
        body.target || "all"
      )
        .trim()
        .toLowerCase();

      const userId = body.user_id
        ? String(body.user_id).trim()
        : null;

      const redirectUrl = body.redirect_url
        ? String(body.redirect_url).trim()
        : "";

      if (!title) {
        return res.status(400).json({
          success: false,
          error:
            "Notification title is required.",
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          error:
            "Notification message is required.",
        });
      }

      const allowedTypes = [
        "general",
        "tournament",
        "wallet",
        "support",
        "important",
      ];

      if (!allowedTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid notification type.",
        });
      }

      if (
        target !== "all" &&
        target !== "user"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid notification target.",
        });
      }

      if (
        target === "user" &&
        !userId
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Please select a user.",
        });
      }

      /* =====================================================
         TARGET USERS
      ===================================================== */

      let selectedUsers = [];
      let targetCount = 0;

      if (target === "user") {
        const {
          data: selectedUser,
          error,
        } = await db
          .from("users")
          .select(
            "id,phone,full_name,email,fcm_token"
          )
          .eq("id", userId)
          .maybeSingle();

        if (error) {
          throw new Error(
            `Failed to get selected user: ${error.message}`
          );
        }

        if (!selectedUser) {
          return res.status(404).json({
            success: false,
            error:
              "Selected user was not found.",
          });
        }

        selectedUsers = [
          selectedUser,
        ];

        targetCount = 1;
      } else {
        const {
          data: allUsers,
          error,
        } = await db
          .from("users")
          .select(
            "id,phone,full_name,email,fcm_token"
          )
          .limit(5000);

        if (error) {
          throw new Error(
            `Failed to load users: ${error.message}`
          );
        }

        selectedUsers =
          allUsers || [];

        targetCount =
          selectedUsers.length;
      }

      /* =====================================================
         FCM TOKENS
      ===================================================== */

      const tokenSet = new Set();

      for (
        const selectedUser of
        selectedUsers
      ) {
        const token = String(
          selectedUser.fcm_token || ""
        ).trim();

        if (token) {
          tokenSet.add(token);
        }
      }

      const tokens =
        Array.from(tokenSet);

      /* =====================================================
         SAVE NOTIFICATION HISTORY
      ===================================================== */

      let historyId = null;

      try {
        const {
          data: history,
          error,
        } = await db
          .from("notifications")
          .insert({
            title,
            message,
            type,
            user_id:
              target === "user"
                ? userId
                : null,
            redirect_url:
              redirectUrl || null,
          })
          .select("id")
          .single();

        if (error) {
          console.error(
            "NOTIFICATION HISTORY INSERT ERROR:",
            error
          );
        } else {
          historyId =
            history?.id || null;
        }
      } catch (error) {
        console.error(
          "HISTORY INSERT ERROR:",
          error
        );
      }

      /*
       * No FCM tokens.
       */

      if (tokens.length === 0) {
        return res.json({
          success: true,
          message:
            target === "user"
              ? "Selected user was found, but this user has no FCM token."
              : "No FCM tokens were found.",
          target,
          targetUsers:
            targetCount,
          totalTokens: 0,
          sent: 0,
          failed: 0,
          invalidTokens: 0,
          historyId,
          redirectUrl:
            redirectUrl || null,
        });
      }

      /* =====================================================
         FIREBASE
      ===================================================== */

      const firebaseApp =
        getFirebaseAdmin();

      const messaging =
        getMessaging(
          firebaseApp
        );

      const CHUNK_SIZE = 500;

      let sent = 0;
      let failed = 0;

      const invalidTokens = [];

      for (
        let i = 0;
        i < tokens.length;
        i += CHUNK_SIZE
      ) {
        const chunk =
          tokens.slice(
            i,
            i + CHUNK_SIZE
          );

        try {
          console.log(
            `FCM SENDING CHUNK: ${i + 1}-${i + chunk.length}`
          );

          const result =
            await messaging.sendEachForMulticast({
              tokens: chunk,

              notification: {
                title,
                body: message,
              },

              data: {
                title,
                body: message,
                type,
                redirect_url:
                  redirectUrl || "",
              },

              android: {
                priority: "high",

                notification: {
                  channelId:
                    "gamerzadda_notifications",
                  sound: "default",
                },
              },
            });

          sent += Number(
            result.successCount || 0
          );

          failed += Number(
            result.failureCount || 0
          );

          result.responses.forEach(
            (
              sendResponse,
              index
            ) => {
              if (
                sendResponse.success
              ) {
                return;
              }

              const code =
                sendResponse
                  .error?.code || "";

              const errorMessage =
                sendResponse
                  .error?.message || "";

              console.error(
                "FCM SEND ERROR:",
                code,
                errorMessage
              );

              if (
                code ===
                  "messaging/registration-token-not-registered" ||
                code ===
                  "messaging/invalid-registration-token"
              ) {
                invalidTokens.push(
                  chunk[index]
                );
              }
            }
          );
        } catch (error) {
          console.error(
            "FCM CHUNK ERROR:",
            error
          );

          failed +=
            chunk.length;
        }
      }

      /* =====================================================
         REMOVE INVALID TOKENS
      ===================================================== */

      const uniqueInvalidTokens =
        Array.from(
          new Set(
            invalidTokens
          )
        );

      for (
        const invalidToken of
        uniqueInvalidTokens
      ) {
        try {
          await db
            .from("users")
            .update({
              fcm_token: null,
            })
            .eq(
              "fcm_token",
              invalidToken
            );
        } catch (error) {
          console.error(
            "INVALID TOKEN CLEANUP ERROR:",
            error
          );
        }
      }

      /* =====================================================
         FINAL RESPONSE
      ===================================================== */

      console.log(
        "NOTIFICATION COMPLETE:",
        {
          target,
          targetUsers:
            targetCount,
          totalTokens:
            tokens.length,
          sent,
          failed,
          invalidTokens:
            uniqueInvalidTokens.length,
        }
      );

      return res.json({
        success: true,

        message:
          sent > 0
            ? "Notification sent successfully."
            : "Notification processed, but delivery failed.",

        target,

        targetUsers:
          targetCount,

        totalTokens:
          tokens.length,

        sent,

        failed,

        invalidTokens:
          uniqueInvalidTokens.length,

        historyId,

        redirectUrl:
          redirectUrl || null,
      });
    } catch (error) {
      return errorResponse(
        res,
        error
      );
    }
  }
);

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;