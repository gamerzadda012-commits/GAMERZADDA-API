import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import fs from "fs";
import path from "path";

import {
  getApps,
  initializeApp,
  cert,
} from "firebase-admin/app";

import {
  getMessaging,
} from "firebase-admin/messaging";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* =========================================================
   HELPERS
========================================================= */

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function unauthorized() {
  return json(
    {
      success: false,
      error: "Unauthorized",
    },
    401
  );
}

function apiError(error) {
  console.error(
    "NOTIFICATION API ERROR:",
    error
  );

  return json(
    {
      success: false,
      error:
        error?.message ||
        String(error) ||
        "Internal server error",
    },
    500
  );
}

/* =========================================================
   SUPABASE SERVICE ROLE CLIENT
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
        hasServiceRoleKey: Boolean(
          serviceKey
        ),
      }
    );

    return null;
  }

  return createClient(
    url,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
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

  /* -------------------------------------------------------
     SERVICE ACCOUNT JSON FILE
  ------------------------------------------------------- */

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
      serviceAccount =
        JSON.parse(
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

  /* -------------------------------------------------------
     ENV FALLBACK
  ------------------------------------------------------- */

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
    privateKey =
      privateKey.slice(1, -1);
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
   ADMIN AUTH
========================================================= */

async function getAdmin() {
  const cookieStore =
    await cookies();

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase environment variables are missing."
    );
  }

  const supabase =
    createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },

          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(
                ({
                  name,
                  value,
                  options,
                }) => {
                  cookieStore.set(
                    name,
                    value,
                    options
                  );
                }
              );
            } catch {
              // Ignore cookie write errors
            }
          },
        },
      }
    );

  const {
    data: authData,
    error: authError,
  } =
    await supabase.auth.getUser();

  if (authError) {
    console.error(
      "AUTH ERROR:",
      authError
    );
  }

  const user =
    authData?.user || null;

  if (!user) {
    return {
      supabase,
      adminSupabase: null,
      user: null,
      adminUser: null,
    };
  }

  const adminSupabase =
    getSupabaseAdminClient();

  let adminUser = null;

  /* -------------------------------------------------------
     ADMIN ROLE CHECK
  ------------------------------------------------------- */

  if (adminSupabase) {
    const {
      data,
      error,
    } =
      await adminSupabase
        .from("users")
        .select("id,role")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
      console.error(
        "ADMIN LOOKUP ERROR:",
        error
      );
    }

    adminUser = data || null;
  }

  /* -------------------------------------------------------
     FALLBACK ROLE CHECK
  ------------------------------------------------------- */

  if (!adminUser) {
    const {
      data,
      error,
    } =
      await supabase
        .from("users")
        .select("id,role")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
      console.error(
        "ROLE LOOKUP ERROR:",
        error
      );
    }

    adminUser = data || null;
  }

  return {
    supabase,
    adminSupabase,
    user,
    adminUser,
  };
}

/* =========================================================
   GET
========================================================= */

export async function GET() {
  try {
    const {
      supabase,
      adminSupabase,
      user,
      adminUser,
    } =
      await getAdmin();

    if (!user || !adminUser) {
      return unauthorized();
    }

    const role =
      String(
        adminUser.role || ""
      )
        .trim()
        .toLowerCase();

    if (role !== "admin") {
      return unauthorized();
    }

    const db =
      adminSupabase || supabase;

    /* -------------------------------------------------------
       USERS
    ------------------------------------------------------- */

    const {
      data: users,
      error: usersError,
    } =
      await db
        .from("users")
        .select(
          "id,full_name,phone,email,fcm_token,role"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(5000);

    if (usersError) {
      console.error(
        "USERS FETCH ERROR:",
        usersError
      );

      throw new Error(
        `Failed to load users: ${usersError.message}`
      );
    }

    /* -------------------------------------------------------
       HISTORY
    ------------------------------------------------------- */

    let history = [];

    const {
      data: historyData,
      error: historyError,
    } =
      await db
        .from("notifications")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(100);

    if (!historyError) {
      history =
        historyData || [];
    } else {
      console.error(
        "HISTORY FETCH ERROR:",
        historyError
      );
    }

    return json({
      success: true,
      users: users || [],
      history,
    });
  } catch (error) {
    return apiError(error);
  }
}

/* =========================================================
   POST
========================================================= */

export async function POST(request) {
  try {
    const {
      supabase,
      adminSupabase,
      user,
      adminUser,
    } =
      await getAdmin();

    /* -------------------------------------------------------
       AUTH
    ------------------------------------------------------- */

    if (!user || !adminUser) {
      return unauthorized();
    }

    const role =
      String(
        adminUser.role || ""
      )
        .trim()
        .toLowerCase();

    if (role !== "admin") {
      return unauthorized();
    }

    /*
     * Notification sending must use
     * service-role Supabase.
     */

    if (!adminSupabase) {
      return json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing. Notification sending requires the service-role client.",
        },
        500
      );
    }

    const db =
      adminSupabase;

    /* -------------------------------------------------------
       REQUEST BODY
    ------------------------------------------------------- */

    const body =
      await request.json();

    const title =
      String(
        body.title || ""
      ).trim();

    const message =
      String(
        body.message || ""
      ).trim();

    const type =
      String(
        body.type || "general"
      )
        .trim()
        .toLowerCase();

    const target =
      String(
        body.target || "all"
      )
        .trim()
        .toLowerCase();

    const userId =
      body.user_id
        ? String(
            body.user_id
          ).trim()
        : null;

    const redirectUrl =
      body.redirect_url
        ? String(
            body.redirect_url
          ).trim()
        : "";

    /* -------------------------------------------------------
       VALIDATION
    ------------------------------------------------------- */

    if (!title) {
      return json(
        {
          success: false,
          error:
            "Notification title is required.",
        },
        400
      );
    }

    if (!message) {
      return json(
        {
          success: false,
          error:
            "Notification message is required.",
        },
        400
      );
    }

    if (
      ![
        "general",
        "tournament",
        "wallet",
        "support",
        "important",
      ].includes(type)
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid notification type.",
        },
        400
      );
    }

    if (
      target !== "all" &&
      target !== "user"
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid notification target.",
        },
        400
      );
    }

    if (
      target === "user" &&
      !userId
    ) {
      return json(
        {
          success: false,
          error:
            "Please select a user.",
        },
        400
      );
    }

    /* =====================================================
       TARGET USERS
    ===================================================== */

    let selectedUsers = [];

    /*
     * targetCount = actual users selected by admin.
     *
     * This is intentionally separate from
     * totalTokens because a user may exist
     * without an FCM token.
     */

    let targetCount = 0;

    if (target === "user") {
      /* ---------------------------------------------------
         SPECIFIC USER
      --------------------------------------------------- */

      console.log(
        "NOTIFICATION SPECIFIC USER ID:",
        userId
      );

      const {
        data: selectedUser,
        error: selectedUserError,
      } =
        await db
          .from("users")
          .select(
            "id,phone,full_name,fcm_token"
          )
          .eq("id", userId)
          .maybeSingle();

      if (selectedUserError) {
        console.error(
          "SPECIFIC USER FETCH ERROR:",
          selectedUserError
        );

        throw new Error(
          `Failed to get selected user: ${selectedUserError.message}`
        );
      }

      if (!selectedUser) {
        console.error(
          "SPECIFIC USER NOT FOUND:",
          userId
        );

        return json(
          {
            success: false,
            error:
              "Selected user was not found.",
          },
          404
        );
      }

      console.log(
        "SPECIFIC USER FOUND:",
        selectedUser.id
      );

      /*
       * IMPORTANT:
       * Target count means selected user,
       * NOT number of FCM tokens.
       */

      targetCount = 1;

      selectedUsers = [
        selectedUser,
      ];

      const hasToken =
        Boolean(
          String(
            selectedUser.fcm_token ||
              ""
          ).trim()
        );

      console.log(
        "SPECIFIC USER HAS FCM:",
        hasToken
      );
    } else {
      /* ---------------------------------------------------
         ALL USERS
      --------------------------------------------------- */

      const {
        data: allUsers,
        error: allUsersError,
      } =
        await db
          .from("users")
          .select(
            "id,phone,full_name,fcm_token"
          )
          .limit(5000);

      if (allUsersError) {
        console.error(
          "ALL USERS FETCH ERROR:",
          allUsersError
        );

        throw new Error(
          `Failed to load users: ${allUsersError.message}`
        );
      }

      /*
       * All users are the target audience.
       */

      selectedUsers =
        allUsers || [];

      targetCount =
        selectedUsers.length;
    }

    console.log(
      "NOTIFICATION TARGET USERS:",
      targetCount
    );

    /* =====================================================
       FCM TOKENS
    ===================================================== */

    const tokenSet =
      new Set();

    for (
      const selectedUser of
        selectedUsers
    ) {
      const token =
        String(
          selectedUser.fcm_token ||
            ""
        ).trim();

      if (token.length > 0) {
        tokenSet.add(token);
      }
    }

    const tokens =
      Array.from(tokenSet);

    console.log(
      "NOTIFICATION FCM TOKENS:",
      tokens.length
    );

    /* =====================================================
       SAVE HISTORY
       
       Only known-safe columns are inserted.
    ===================================================== */

    let historyId = null;

    try {
      const {
        data: history,
        error,
      } =
        await db
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
              redirectUrl ||
              null,
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

    /* =====================================================
       NO FCM TOKEN
    ===================================================== */

    if (tokens.length === 0) {
      return json({
        success: true,

        message:
          target === "user"
            ? "Selected user was found, but this user has no FCM token."
            : "No FCM tokens were found.",

        target,

        /*
         * IMPORTANT:
         * Specific user = 1 even when
         * token is missing.
         */

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

    /* =====================================================
       FCM SEND
    ===================================================== */

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
          await messaging.sendEachForMulticast(
            {
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
            }
          );

        /*
         * These are the actual Firebase
         * delivery results.
         */

        sent +=
          Number(
            result.successCount || 0
          );

        failed +=
          Number(
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
       FINAL COUNTS
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

    /* =====================================================
       FINAL RESPONSE
    ===================================================== */

    return json({
      success: true,

      message:
        sent > 0
          ? "Notification sent successfully."
          : "Notification processed, but delivery failed.",

      target,

      /*
       * Number of actual users selected.
       *
       * Specific user = 1
       * All users = number of users selected
       */

      targetUsers:
        targetCount,

      /*
       * Number of unique FCM tokens
       * actually attempted.
       */

      totalTokens:
        tokens.length,

      /*
       * Actual Firebase result.
       */

      sent,

      failed,

      invalidTokens:
        uniqueInvalidTokens.length,

      historyId,

      redirectUrl:
        redirectUrl || null,
    });
  } catch (error) {
    return apiError(error);
  }
}