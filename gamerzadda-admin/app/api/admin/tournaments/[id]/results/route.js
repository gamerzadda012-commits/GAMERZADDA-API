import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
========================================================= */

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
    let token = "";

    // Authorization header
    const authorization =
      request.headers.get("authorization") || "";

    if (authorization.startsWith("Bearer ")) {
      token = authorization.slice(7).trim();
    }

    // Fallback to admin cookie
    if (!token) {
      token =
        request.cookies.get(
          "gamerzadda_admin_access"
        )?.value || "";
    }

    if (!token) {
      console.log(
        "RESULTS AUTH: No token found"
      );
      return null;
    }

    const {
      data: authData,
      error: authError,
    } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      console.log(
        "RESULTS AUTH: Invalid token",
        authError?.message
      );
      return null;
    }

    const {
      data: admin,
      error: adminError,
    } =
      await supabaseAdmin
        .from("users")
        .select("id, role, status")
        .eq("id", authData.user.id)
        .maybeSingle();

    if (adminError) {
      console.error(
        "RESULTS AUTH USER ERROR:",
        adminError
      );
      return null;
    }

    if (
      !admin ||
      admin.role !== "admin" ||
      admin.status !== "active"
    ) {
      console.log(
        "RESULTS AUTH: User is not active admin",
        {
          id: admin?.id,
          role: admin?.role,
          status: admin?.status,
        }
      );

      return null;
    }

    return authData.user.id;
  } catch (error) {
    console.error(
      "RESULTS AUTH ERROR:",
      error
    );

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
   GET RESULTS
========================================================= */

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
        "user_id,game_name,free_fire_uid,level,created_at,cancelled"
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
========================================================= */

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

    if (!match) {
      return jsonError(
        "Match not found. Create the match before uploading results.",
        400
      );
    }

    const matchStatus =
      String(
        match.status || ""
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
          `User ${userId} is not a participant of this tournament.`,
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
          match.id,

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
        match.id
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