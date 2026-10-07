import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
/* =========================================================
   HELPERS
\\========================================================= */
function jsonError(message, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status }
  );
}
async function requireAdmin(request) {
  try {
    const sessionCookie =
      request.cookies.get("gamerzadda_admin_session")?.value || "";
    if (!sessionCookie) {
      console.log("RESULTS AUTH: No admin session cookie");
      return null;
    }
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL ||
      "https\\://api.gamerzadda.in";
    const response = await fetch(
      \`${apiBase}/api/admin/session\`,
      {
        method: "GET",
        headers: {
          Cookie: \`gamerzadda_admin_session=${sessionCookie}\`,
        },
        cache: "no-store",
      }
    );
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.authenticated || !data?.admin) {
      console.log(
        "RESULTS AUTH: Backend admin session rejected",
        {
          status: response.status,
          authenticated: data?.authenticated,
        }
      );
      return null;
    }
    const adminId = data.admin.id;
    console.log(
      "RESULTS AUTH: Admin session verified",
      adminId
    );
    return adminId;
  } catch (error) {
    console.error("RESULTS AUTH ERROR:", error);
    return null;
  }
}
async function getTournament(tournamentId) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("tournaments")
    .select(
      "id,title,game,mode,map,start_time,prize_pool,kill_reward,status"
    )
    .eq("id", tournamentId)
    .maybeSingle();
  return {
    data,
    error,
  };
}
/* =========================================================
   TOURNAMENT RESULT FCM
   Sends ONLY to users who joined this tournament.
\\========================================================= */
function getFirebaseAdmin() {
  const apps = getApps();
  if (apps.length > 0) return apps[0];
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (serviceAccountPath) {
    const fullPath = path.resolve(process.cwd(), serviceAccountPath);
    if (fs.existsSync(fullPath)) {
      const serviceAccount = JSON.parse(
        fs.readFileSync(fullPath, "utf8")
      );
      const privateKey = String(serviceAccount.private_key || "")
        .replace(/\n/g, "
")
        .trim();
      return initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey,
        }),
      });
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "")
    .replace(/\n/g, "
")
    .trim();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are missing.");
  }
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}
async function sendTournamentResultNotifications({
  tournamentId,
  tournamentTitle,
  resultRows,
}) {
  try {
    // IMPORTANT: only active entries from THIS tournament.
    const { data: entries, error: entriesError } =
      await supabaseAdmin
        .from("tournament_entries")
        .select("user_id")
        .eq("tournament_id", tournamentId)
        .eq("cancelled", false);
    if (entriesError) throw entriesError;
    const participantIds = [
      ...new Set(
        (entries || [])
          .map((entry) => String(entry.user_id || "").trim())
          .filter(Boolean)
      ),
    ];
    if (participantIds.length === 0) {
      console.log(
        "RESULT FCM: No participants for tournament:",
        tournamentId
      );
      return {
        participantCount: 0,
        tokenCount: 0,
        sentCount: 0,
      };
    }
    // Fetch FCM tokens ONLY for those participant IDs.
    const { data: users, error: usersError } =
      await supabaseAdmin
        .from("users")
        .select("id,fcm_token")
        .in("id", participantIds);
    if (usersError) throw usersError;
    const resultMap = new Map(
      (resultRows || []).map((row) => [
        String(row.user_id),
        Number(row.winning_amount || 0),
      ])
    );
    const notifications = (users || [])
      .map((user) => {
        const token = String(user.fcm_token || "").trim();
        if (!token) return null;
        const winningAmount =
          resultMap.get(String(user.id)) || 0;
        if (winningAmount > 0) {
          return {
            token,
            title: \`🏆 You Won ₹${winningAmount}!\`,
            body:
              \`Tournament results are out. You won ₹${winningAmount}. Check your results now!\`,
          };
        }
        return {
          token,
          title: "📊 Tournament Results Are Out",
          body:
            "Your tournament results are now available. Check your results now!",
        };
      })
      .filter(Boolean);
    if (notifications.length === 0) {
      console.log(
        "RESULT FCM: No participant has an FCM token.",
        participantIds.length
      );
      return {
        participantCount: participantIds.length,
        tokenCount: 0,
        sentCount: 0,
      };
    }
    const firebaseApp = getFirebaseAdmin();
    const messaging = getMessaging(firebaseApp);
    let sentCount = 0;
    const invalidTokens = [];
    // Each user can have a different winning amount.
    for (const notification of notifications) {
      try {
        await messaging.send({
          token: notification.token,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: {
            type: "tournament_result",
            tournament_id: String(tournamentId),
            tournament_title: String(tournamentTitle || ""),
          },
          android: {
            priority: "high",
          },
        });
        sentCount += 1;
      } catch (sendError) {
        const code = String(sendError?.code || "");
        console.error(
          "RESULT FCM SEND ERROR:",
          code,
          sendError?.message || sendError
        );
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token")
        ) {
          invalidTokens.push(notification.token);
        }
      }
    }
    // Remove stale tokens.
    if (invalidTokens.length > 0) {
      await supabaseAdmin
        .from("users")
        .update({ fcm_token: null })
        .in("fcm_token", invalidTokens);
    }
    console.log(
      "RESULT FCM COMPLETE:",
      JSON.stringify({
        tournamentId,
        participantCount: participantIds.length,
        tokenCount: notifications.length,
        sentCount,
        invalidTokenCount: invalidTokens.length,
      })
    );
    return {
      participantCount: participantIds.length,
      tokenCount: notifications.length,
      sentCount,
    };
  } catch (error) {
    // Result publication must remain successful even if FCM fails.
    console.error("RESULT FCM ERROR:", error);
    return {
      participantCount: 0,
      tokenCount: 0,
      sentCount: 0,
      error: error?.message || String(error),
    };
  }
}
/* =========================================================
   GET RESULTS
\\========================================================= */
export async function GET(request, context) {
  try {
    const adminId =
      await requireAdmin(request);
    if (!adminId) {
      return jsonError(
        "Unauthorized.",
        401
      );
    }
    const { id: tournamentId } =
      await context.params;
    if (!tournamentId) {
      return jsonError(
        "Tournament ID is required.",
        400
      );
    }
    /* -----------------------------------------
       Tournament
    ----------------------------------------- */
    const {
      data: tournament,
      error: tournamentError,
    } = await getTournament(
      tournamentId
    );
    if (tournamentError) {
      console.error(
        "RESULTS TOURNAMENT ERROR:",
        tournamentError
      );
      return jsonError(
        tournamentError.message
      );
    }
    if (!tournament) {
      return jsonError(
        "Tournament not found.",
        404
      );
    }
    /* -----------------------------------------
       Latest match
    ----------------------------------------- */
    const {
      data: match,
      error: matchError,
    } = await supabaseAdmin
      .from("matches")
      .select(
        "id,status,room_id,room_password,start_time,tournament_id"
      )
      .eq(
        "tournament_id",
        tournamentId
      )
      .order("id", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();
    if (matchError) {
      console.error(
        "RESULTS MATCH ERROR:",
        matchError
      );
      return jsonError(
        matchError.message
      );
    }
    /* -----------------------------------------
       Tournament entries
    ----------------------------------------- */
    const {
      data: entries,
      error: entriesError,
    } = await supabaseAdmin
      .from("tournament_entries")
      .select(
        "id,user_id,game_name,free_fire_uid,level,created_at,cancelled"
      )
      .eq(
        "tournament_id",
        tournamentId
      )
      .eq(
        "cancelled",
        false
      )
      .order("created_at", {
        ascending: true,
      });
    if (entriesError) {
      console.error(
        "RESULTS ENTRIES ERROR:",
        entriesError
      );
      return jsonError(
        entriesError.message
      );
    }
    const userIds = [
      ...new Set(
        (entries || [])
          .map(
            (entry) =>
              entry.user_id
          )
          .filter(Boolean)
          .map(String)
      ),
    ];
    /* -----------------------------------------
       Users
    ----------------------------------------- */
    let users = [];
    if (userIds.length) {
      const {
        data: userRows,
        error: usersError,
      } = await supabaseAdmin
        .from("users")
        .select("*")
        .in("id", userIds);
      if (usersError) {
        console.error(
          "RESULTS USERS ERROR:",
          usersError
        );
        return jsonError(
          usersError.message
        );
      }
      users = userRows || [];
    }
    /* -----------------------------------------
       Existing results
    ----------------------------------------- */
    const {
      data: resultRows,
      error: resultError,
    } = await supabaseAdmin
      .from("tournament_results")
      .select(
        "id,tournament_id,match_id,user_id,rank,kills,winning_amount"
      )
      .eq(
        "tournament_id",
        tournamentId
      )
      .order("rank", {
        ascending: true,
        nullsFirst: false,
      });
    if (resultError) {
      console.error(
        "RESULTS RESULT ROW ERROR:",
        resultError
      );
      return jsonError(
        resultError.message
      );
    }
    /* -----------------------------------------
       Maps
    ----------------------------------------- */
    const userMap = new Map(
      users.map((user) => [
        String(user.id),
        user,
      ])
    );
    const entryMap = new Map(
      (entries || []).map((entry) => [
        String(entry.user_id),
        entry,
      ])
    );
    const resultMap = new Map(
      (resultRows || []).map((result) => [
        String(result.user_id),
        result,
      ])
    );
    /* -----------------------------------------
       Participants
    ----------------------------------------- */
    /\* -----------------------------------------
       DUO / SQUAD TEAM DETAILS
       Service-role access keeps team metadata available even when
       the browser Supabase client is restricted by RLS.
    ----------------------------------------- \*/
    let teamMemberRows = [];
    let teamRows = [];
    const resultMode = String(tournament?.mode || "")
      .trim()
      .toUpperCase();
    if (["DUO", "SQUAD"].includes(resultMode) && userIds.length > 0) {
      const {
        data: loadedTeamMembers,
        error: teamMemberError,
      } = await supabaseAdmin
        .from("tournament_team_members")
        .select("user_id,entry_id,team_id,is_leader")
        .eq("tournament_id", tournamentId)
        .in(
          "entry_id",
          (entries || [])
            .map((entry) => String(entry.id || "").trim())
            .filter(Boolean)
        );
      if (teamMemberError) {
        console.error("RESULTS TEAM MEMBERS ERROR:", teamMemberError);
        return jsonError(teamMemberError.message);
      }
      teamMemberRows = loadedTeamMembers || [];
      const teamIds = [
        ...new Set(
          teamMemberRows
            .map((row) => String(row\.team_id || "").trim())
            .filter(Boolean)
        ),
      ];
      if (teamIds.length > 0) {
        const {
          data: loadedTeams,
          error: teamError,
        } = await supabaseAdmin
          .from("tournament_teams")
          .select("id,team_name,team_type,max_members,leader_user_id,team_code")
          .in("id", teamIds);
        if (teamError) {
          console.error("RESULTS TEAMS ERROR:", teamError);
          return jsonError(teamError.message);
        }
        teamRows = loadedTeams || [];
      }
    }
    const teamMemberMap = new Map(
      teamMemberRows.map((row) => [String(row.user_id), row])
    );
    const teamMap = new Map(
      teamRows.map((team) => [String(team.id), team])
    );
    const participants =
      userIds.map((userId) => {
        const id = String(userId);
        const user =
          userMap.get(id);
        const entry =
          entryMap.get(id);
        const result =
          resultMap.get(id);
        return {
          user_id: id,
          game_name:
            entry?.game_name ||
            user?.game_name ||
            "",
          free_fire_uid:
            entry?.free_fire_uid ||
            user?.free_fire_uid ||
            "",
          level:
            entry?.level ??
            user?.level ??
            null,
          created_at:
            entry?.created_at ||
            null,
          user: user || null,
          team_id: String(
            teamMemberMap.get(id)?.team_id || ""
          ),
          team_name: String(
            teamMap.get(
              String(teamMemberMap.get(id)?.team_id || "")
            )?.team_name || ""
          ).trim(),
          team_type: String(
            teamMap.get(
              String(teamMemberMap.get(id)?.team_id || "")
            )?.team_type || ""
          ).trim().toUpperCase(),
          team_max_members: Number(
            teamMap.get(
              String(teamMemberMap.get(id)?.team_id || "")
            )?.max_members || 0
          ),
          team_code: String(
            teamMap.get(
              String(teamMemberMap.get(id)?.team_id || "")
            )?.team_code || ""
          ).trim(),
          is_team_leader: Boolean(
            teamMemberMap.get(id)?.is_leader
          ),
          rank:
            result?.rank ?? 0,
          kills:
            Number(result?.kills || 0),
          winning_amount:
            Number(
              result?.winning_amount || 0
            ),
        };
      });
    /* -----------------------------------------
       Return
    ----------------------------------------- */
    return NextResponse.json({
      success: true,
      tournament,
      match:
        match || null,
      // Used by Results page
      participants,
      // Also expose results directly
      results:
        resultRows || [],
      data:
        resultRows || [],
    });
  } catch (error) {
    console.error(
      "ADMIN RESULTS GET ERROR:",
      error
    );
    return jsonError(
      error?.message ||
        "Unable to load tournament results."
    );
  }
}
/* =========================================================
   POST / SAVE RESULTS
\\========================================================= */
export async function POST(
  request,
  context
) {
  try {
    const adminId =
      await requireAdmin(request);
    if (!adminId) {
      return jsonError(
        "Unauthorized.",
        401
      );
    }
    const { id: tournamentId } =
      await context.params;
    if (!tournamentId) {
      return jsonError(
        "Tournament ID is required.",
        400
      );
    }
    /* -----------------------------------------
       Body
    ----------------------------------------- */
    let body = null;
    try {
      body = await request.json();
    } catch {
      return jsonError(
        "Invalid JSON body.",
        400
      );
    }
    const incoming =
      Array.isArray(body?.results)
        ? body.results
        : null;
    if (!incoming) {
      return jsonError(
        "Results array is required.",
        400
      );
    }
    if (incoming.length === 0) {
      return jsonError(
        "At least one result is required.",
        400
      );
    }
    /* -----------------------------------------
       Tournament
    ----------------------------------------- */
    const {
      data: tournament,
      error: tournamentError,
    } = await getTournament(
      tournamentId
    );
    if (tournamentError) {
      console.error(
        "RESULTS TOURNAMENT ERROR:",
        tournamentError
      );
      return jsonError(
        tournamentError.message
      );
    }
    if (!tournament) {
      return jsonError(
        "Tournament not found.",
        404
      );
    }
    /* -----------------------------------------
       Already completed check
    ----------------------------------------- */
    const tournamentStatus =
      String(
        tournament.status || ""
      )
        .trim()
        .toLowerCase();
    if (
      [
        "completed",
        "complete",
        "finished",
        "finish",
        "past",
        "closed",
        "ended",
      ].includes(tournamentStatus)
    ) {
      return jsonError(
        "Results are already published and locked.",
        409
      );
    }
    /* -----------------------------------------
       Existing results check
    ----------------------------------------- */
    const {
      data: existingResults,
      error: existingResultsError,
    } = await supabaseAdmin
      .from("tournament_results")
      .select("id")
      .eq(
        "tournament_id",
        tournamentId
      )
      .limit(1);
    if (existingResultsError) {
      console.error(
        "EXISTING RESULTS ERROR:",
        existingResultsError
      );
      return jsonError(
        existingResultsError.message
      );
    }
    if (
      (existingResults || []).length > 0
    ) {
      return jsonError(
        "Results are already published and locked.",
        409
      );
    }
    /* -----------------------------------------
       Latest match
    ----------------------------------------- */
    const {
      data: match,
      error: matchError,
    } = await supabaseAdmin
      .from("matches")
      .select(
        "id,tournament_id,status"
      )
      .eq(
        "tournament_id",
        tournamentId
      )
      .order("id", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();
    if (matchError) {
      console.error(
        "RESULTS MATCH ERROR:",
        matchError
      );
      return jsonError(
        matchError.message
      );
    }
    let resultMatch = match;

    // Results can be entered even when no room/match was created.
    // Create a minimal live match record so every result has a valid match_id.
    if (!resultMatch) {
      const {
        data: createdMatch,
        error: createMatchError,
      } = await supabaseAdmin
        .from("matches")
        .insert({
          tournament_id: tournamentId,
          status: "live",
        })
        .select("id,tournament_id,status")
        .single();

      if (createMatchError || !createdMatch) {
        console.error(
          "RESULTS MATCH CREATE ERROR:",
          createMatchError
        );
        return jsonError(
          createMatchError?.message ||
            "Unable to create a match for these results.",
          500
        );
      }

      resultMatch = createdMatch;
    }
    const matchStatus =
      String(
        resultMatch.status || ""
      )
        .trim()
        .toLowerCase();
    if (
      [
        "completed",
        "complete",
        "finished",
      ].includes(matchStatus)
    ) {
      return jsonError(
        "This match is already completed.",
        409
      );
    }
    /* -----------------------------------------
       Active participants
    ----------------------------------------- */
    const {
      data: entries,
      error: entriesError,
    } = await supabaseAdmin
      .from("tournament_entries")
      .select(
        "user_id,game_name,free_fire_uid"
      )
      .eq(
        "tournament_id",
        tournamentId
      )
      .eq(
        "cancelled",
        false
      );
    if (entriesError) {
      console.error(
        "RESULTS ENTRIES ERROR:",
        entriesError
      );
      return jsonError(
        entriesError.message
      );
    }
    const validUserIds =
      new Set(
        (entries || [])
          .map(
            (entry) =>
              String(entry.user_id)
          )
          .filter(Boolean)
      );
    /* -----------------------------------------
       Validate + clean results
    ----------------------------------------- */
    const rows = [];
    for (const item of incoming) {
      const userId =
        String(
          item?.user_id || ""
        ).trim();
      if (!userId) {
        continue;
      }
      if (!validUserIds.has(userId)) {
        return jsonError(
          \`User ${userId} is not a participant of this tournament.\`,
          400
        );
      }
      const rawRank =
        item?.rank;
      let rank = null;
      if (
        rawRank !== null &&
        rawRank !== undefined &&
        rawRank !== ""
      ) {
        rank = Math.max(
          1,
          Number(rawRank) || 1
        );
      }
      const kills = Math.max(
        0,
        Number(item?.kills) || 0
      );
      const winningAmount =
        Math.max(
          0,
          Number(
            item?.winning_amount
          ) || 0
        );
      rows.push({
        tournament_id:
          tournamentId,
        match_id:
          resultMatch.id,
        user_id:
          userId,
        rank,
        kills,
        winning_amount:
          winningAmount,
        updated_at:
          new Date().toISOString(),
      });
    }
    if (rows.length === 0) {
      return jsonError(
        "No valid participant results were provided.",
        400
      );
    }
    /* -----------------------------------------
       Duplicate user protection
    ----------------------------------------- */
    const uniqueUsers =
      new Set(
        rows.map(
          (row) =>
            String(row.user_id)
        )
      );
    if (
      uniqueUsers.size !==
      rows.length
    ) {
      return jsonError(
        "Duplicate users found in results.",
        400
      );
    }
    /* -----------------------------------------
       Save results
    ----------------------------------------- */
    const {
      data: savedRows,
      error: upsertError,
    } = await supabaseAdmin
      .from("tournament_results")
      .upsert(rows, {
        onConflict:
          "tournament_id,user_id",
      })
      .select(
        "id,tournament_id,match_id,user_id,rank,kills,winning_amount"
      );
    if (upsertError) {
      console.error(
        "RESULTS UPSERT ERROR:",
        upsertError
      );
      return jsonError(
        upsertError.message
      );
    }
    /* -----------------------------------------
       CREDIT TOURNAMENT WINNINGS
       reference_id MUST be a UUID because
       wallet_transactions.reference_id is UUID.
    ----------------------------------------- */
    const winningRows = (savedRows || []).filter(
      (row) =>
        Number(row?.winning_amount || 0) > 0 &&
        row?.id &&
        row?.user_id
    );
    const creditedWinners = [];
    const insertedWinningTransactions = [];
    try {
      for (const winner of winningRows) {
        const userId = String(winner.user_id);
        const amount = Number(winner.winning_amount || 0);
        const referenceId = String(winner.id);
        if (!amount || amount <= 0) {
          continue;
        }
        /* -----------------------------------------
           Idempotency guard
           If this exact result UUID was already
           credited, do not credit it again.
        ----------------------------------------- */
        const {
          data: existingTransaction,
          error: existingTransactionError,
        } = await supabaseAdmin
          .from("wallet_transactions")
          .select("id,user_id,amount,type,reference_id")
          .eq("reference_id", referenceId)
          .eq("user_id", userId)
          .eq("type", "tournament_winning")
          .maybeSingle();
        if (existingTransactionError) {
          throw new Error(
            \`Wallet transaction lookup failed for ${userId}: ${existingTransactionError.message}\`
          );
        }
        if (existingTransaction) {
          console.log(
            "RESULT WINNING ALREADY CREDITED:",
            JSON.stringify({
              tournamentId,
              userId,
              amount,
              referenceId,
            })
          );
          continue;
        }
        /* -----------------------------------------
           Read current winning balance
        ----------------------------------------- */
        const {
          data: wallet,
          error: walletError,
        } = await supabaseAdmin
          .from("wallet_balances")
          .select("user_id,winning_balance")
          .eq("user_id", userId)
          .maybeSingle();
        if (walletError) {
          throw new Error(
            \`Wallet lookup failed for ${userId}: ${walletError.message}\`
          );
        }
        if (!wallet) {
          throw new Error(
            \`Wallet not found for ${userId}.\`
          );
        }
        const oldWinning = Number(
          wallet.winning_balance || 0
        );
        const newWinning = oldWinning + amount;
        /* -----------------------------------------
           Conditional balance update
           Prevents concurrent overwrite.
        ----------------------------------------- */
        const {
          data: updatedWallet,
          error: walletUpdateError,
        } = await supabaseAdmin
          .from("wallet_balances")
          .update({
            winning_balance: newWinning,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("winning_balance", oldWinning)
          .select("user_id,winning_balance")
          .maybeSingle();
        if (
          walletUpdateError ||
          !updatedWallet
        ) {
          throw new Error(
            \`Wallet balance update failed for ${userId}: ${
              walletUpdateError?.message ||
              "balance changed concurrently"
            }\`
          );
        }
        /* -----------------------------------------
           Insert wallet transaction
           reference_id = tournament_results.id
           which is a real UUID.
        ----------------------------------------- */
        const {
          data: insertedTransaction,
          error: transactionError,
        } = await supabaseAdmin
          .from("wallet_transactions")
          .insert({
            user_id: userId,
            amount,
            type: "tournament_winning",
            description:
              \`Tournament winning ₹${amount} credited\`,
            reference_id: referenceId,
          })
          .select(
            "id,user_id,amount,type,reference_id"
          )
          .single();
        if (
          transactionError ||
          !insertedTransaction
        ) {
          /* Roll back this user's balance immediately. */
          await supabaseAdmin
            .from("wallet_balances")
            .update({
              winning_balance: oldWinning,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("winning_balance", newWinning);
          throw new Error(
            \`Wallet transaction failed for ${userId}: ${
              transactionError?.message ||
              "transaction insert returned no row"
            }\`
          );
        }
        creditedWinners.push({
          userId,
          amount,
          oldWinning,
          newWinning,
          referenceId,
        });
        insertedWinningTransactions.push(
          insertedTransaction
        );
        console.log(
          "RESULT WINNING CREDITED:",
          JSON.stringify({
            tournamentId,
            userId,
            amount,
            oldWinning,
            newWinning,
            referenceId,
          })
        );
      }
    } catch (walletCreditError) {
      console.error(
        "RESULT WINNING CREDIT ERROR:",
        walletCreditError
      );
      /* -----------------------------------------
         FULL ROLLBACK
         Do not leave a partially credited
         tournament if any winner fails.
      ----------------------------------------- */
      for (
        let i = creditedWinners.length - 1;
        i >= 0;
        i--
      ) {
        const credited =
          creditedWinners[i];
        await supabaseAdmin
          .from("wallet_transactions")
          .delete()
          .eq(
            "reference_id",
            credited.referenceId
          )
          .eq(
            "user_id",
            credited.userId
          )
          .eq(
            "type",
            "tournament_winning"
          );
        await supabaseAdmin
          .from("wallet_balances")
          .update({
            winning_balance:
              credited.oldWinning,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "user_id",
            credited.userId
          )
          .eq(
            "winning_balance",
            credited.newWinning
          );
      }
      /* Also remove the current transaction if
         the insert succeeded but later processing
         reported an error. */
      for (
        const transaction of
          insertedWinningTransactions
      ) {
        await supabaseAdmin
          .from("wallet_transactions")
          .delete()
          .eq(
            "id",
            transaction.id
          );
      }
      /* Remove result rows so the admin can retry
         after fixing the wallet issue. */
      const {
        error: resultRollbackError,
      } = await supabaseAdmin
        .from("tournament_results")
        .delete()
        .eq(
          "tournament_id",
          tournamentId
        );
      if (resultRollbackError) {
        console.error(
          "RESULT ROLLBACK DELETE ERROR:",
          resultRollbackError
        );
      }
      return jsonError(
        walletCreditError?.message ||
          "Tournament winnings could not be credited.",
        500
      );
    }
    /* -----------------------------------------
       Complete match
    ----------------------------------------- */
    const {
      data: completedMatch,
      error: completeMatchError,
    } = await supabaseAdmin
      .from("matches")
      .update({
        status: "completed",
      })
      .eq(
        "id",
        resultMatch.id
      )
      .select(
        "id,tournament_id,status"
      )
      .single();
    if (
      completeMatchError ||
      !completedMatch
    ) {
      console.error(
        "COMPLETE MATCH ERROR:",
        completeMatchError
      );
      return jsonError(
        completeMatchError?.message ||
          "Results were saved, but the match could not be marked completed."
      );
    }
    /* -----------------------------------------
       Complete tournament
    ----------------------------------------- */
    const {
      data: completedTournament,
      error:
        tournamentStatusError,
    } = await supabaseAdmin
      .from("tournaments")
      .update({
        status: "completed",
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        tournamentId
      )
      .select(
        "id,title,status"
      )
      .single();
    if (
      tournamentStatusError ||
      !completedTournament
    ) {
      console.error(
        "COMPLETE TOURNAMENT ERROR:",
        tournamentStatusError
      );
      return jsonError(
        tournamentStatusError?.message ||
          "Results were saved, but tournament status could not be updated."
      );
    }
    /* -----------------------------------------
       Reload final results
    ----------------------------------------- */
    const {
      data: finalResults,
      error: finalResultsError,
    } = await supabaseAdmin
      .from("tournament_results")
      .select(
        "id,tournament_id,match_id,user_id,rank,kills,winning_amount"
      )
      .eq(
        "tournament_id",
        tournamentId
      )
      .order("rank", {
        ascending: true,
        nullsFirst: false,
      });
    if (finalResultsError) {
      console.error(
        "FINAL RESULTS LOAD ERROR:",
        finalResultsError
      );
    }
/* -----------------------------------------
   SEND RESULT NOTIFICATIONS
   ONLY to participants of this tournament.
\\----------------------------------------- */
    const notificationStats =
      await sendTournamentResultNotifications({
        tournamentId,
        tournamentTitle:
          completedTournament?.title ||
          tournament?.title ||
          "",
        resultRows:
          finalResults ||
          savedRows ||
          rows,
      });
    /* -----------------------------------------
       SUCCESS
    ----------------------------------------- */
    return NextResponse.json({
      success: true,
      message:
        "Results uploaded successfully.",
      status:
        "completed",
      tournament:
        completedTournament,
      match:
        completedMatch,
      results:
        finalResults ||
        savedRows ||
        rows,
      participants:
        finalResults ||
        savedRows ||
        rows,
      notification:
        notificationStats,
    });
  } catch (error) {
    console.error(
      "ADMIN RESULTS POST ERROR:",
      error
    );
    return jsonError(
      error?.message ||
        "Unable to save tournament results."
    );
  }
}