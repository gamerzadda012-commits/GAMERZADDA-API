const express = require("express");







const router = express.Router();







const supabase = require("../config/supabase");

const {
    checkUserRestriction,
    restrictionResponse,
    getUserGameLimit,
    gameRestrictionKey
} = require("../utils/userRestrictions");








// ============================================================



// HELPERS



// ============================================================







function getUserId(req) {



    const headerUserId =



        req.headers["x-user-id"];







    const bodyUserId =



        req.body?.userId;







    const queryUserId =



        req.query?.userId;







    return String(



        headerUserId ||



        bodyUserId ||



        queryUserId ||



        ""



    ).trim();



}







function cleanNumber(value, fallback = 0) {



    const number = Number(value);







    return Number.isFinite(number)



        ? number



        : fallback;



}







// ============================================================



// GET ALL TOURNAMENTS



// GET /api/tournaments



// ============================================================







router.get("/", async (req, res) => {



    try {



        const game =



            String(



                req.query.game || ""



            ).trim();







        let query =



            supabase



                .from("tournaments")



                .select(`



                    id,



                    title,



                    game,



                    mode,



                    entry_fee,



                    prize_pool,



                    kill_reward,



                    max_players,



                    start_time,



                    map,



                    status,



                    rules,



                    bonus_usable_percent



                `)



                .order(



                    "start_time",



                    {



                        ascending: true



                    }



                );







        if (game) {



            query =



                query.eq(



                    "game",



                    game



                );



        }







        const {



            data: tournaments,



            error



        } = await query;







        if (error) {







            console.error(



                "GET TOURNAMENTS ERROR:",



                error



            );







            return res.status(500).json({



                success: false,



                error: error.message



            });



        }







        const list = tournaments || [];

        // Hide started/live/completed tournaments from the public list.
        // Applies to Free Fire, Free Fire MAX, Lone Wolf and Clash Squad.
        const visibilityIds = list.map(t => t.id).filter(Boolean);
        const latestMatchByTournament = new Map();
        const publishedResults = new Set();

        if (visibilityIds.length) {
            const { data: matchRows, error: matchVisibilityError } = await supabase
                .from("matches")
                .select("id,tournament_id,room_id,room_password,status,start_time")
                .in("tournament_id", visibilityIds)
                .order("id", { ascending: false });

            if (matchVisibilityError) {
                console.error("[TOURNAMENTS] Match visibility query error:", matchVisibilityError);
            } else {
                for (const match of matchRows || []) {
                    const id = String(match.tournament_id || "");
                    if (id && !latestMatchByTournament.has(id)) latestMatchByTournament.set(id, match);
                }
            }

            const { data: resultRows, error: resultVisibilityError } = await supabase
                .from("tournament_results")
                .select("tournament_id")
                .in("tournament_id", visibilityIds);

            if (resultVisibilityError) {
                console.error("[TOURNAMENTS] Result visibility query error:", resultVisibilityError);
            } else {
                for (const row of resultRows || []) {
                    const id = String(row.tournament_id || "");
                    if (id) publishedResults.add(id);
                }
            }
        }

        const nowMs = Date.now();
        const hiddenStatuses = new Set([
            "live", "ongoing", "started", "in_progress", "in-progress",
            "completed", "complete", "finished", "ended", "closed"
        ]);

        const visibleList = list.filter((tournament) => {
            const id = String(tournament.id || "");
            const tournamentStatus = String(tournament.status || "").trim().toLowerCase();

            if (hiddenStatuses.has(tournamentStatus)) return false;
            if (publishedResults.has(id)) return false;

            const match = latestMatchByTournament.get(id);
            if (match) {
                const roomId = String(match.room_id || "").trim();
                const roomPassword = String(match.room_password || "").trim();
                const matchStatus = String(match.status || "").trim().toLowerCase();

                if (roomId && roomPassword) return false;
                if (hiddenStatuses.has(matchStatus)) return false;

                if (match.start_time) {
                    const matchStart = new Date(match.start_time).getTime();
                    if (Number.isFinite(matchStart) && matchStart <= nowMs) return false;
                }
            }

            if (tournament.start_time) {
                const tournamentStart = new Date(tournament.start_time).getTime();
                if (Number.isFinite(tournamentStart) && tournamentStart <= nowMs) return false;
            }

            return true;
        });

        console.log(`[TOURNAMENTS] Visibility | total=${list.length} | visible=${visibleList.length} | hidden=${list.length - visibleList.length}`);

// Load all active entry rows once instead of making



        // one Supabase request per tournament.



        const tournamentIds = visibleList



            .map((tournament) => tournament.id)



            .filter(Boolean);







        const countMap = {};







        if (tournamentIds.length) {



            const {



                data: entryRows,



                error: countError



            } = await supabase



                .from("tournament_entries")



                .select("tournament_id")



                .in("tournament_id", tournamentIds)



                .eq("cancelled", false);







            if (countError) {



                console.error(



                    "COUNT ERROR:",



                    countError



                );



            } else {



                for (const row of entryRows || []) {



                    const key = String(row.tournament_id);



                    countMap[key] =



                        (countMap[key] || 0) + 1;



                }



            }



        }







        const result = visibleList.map((tournament) => ({



            ...tournament,



            joined_count:



                countMap[String(tournament.id)] || 0



        }));







        return res.status(200).json({



            success: true,



            tournaments: result



        });







    } catch (error) {







        console.error(



            "GET TOURNAMENTS EXCEPTION:",



            error



        );







        return res.status(500).json({



            success: false,



            error:



                error?.message ||



                "Internal server error"



        });



    }



});







// ============================================================



// GET PARTICIPANTS



// GET /api/tournaments/participants?tournamentId=UUID



// ============================================================







router.get(
    "/participants",
    async (req, res) => {
        try {
            const tournamentId = String(
                req.query.tournamentId || ""
            ).trim();

            if (!tournamentId) {
                return res.status(400).json({
                    success: false,
                    error: "Tournament ID is required."
                });
            }

            // 1. Load tournament entries
            const {
                data: entries,
                error: entriesError
            } = await supabase
                .from("tournament_entries")
                .select(`
                    id,
                    tournament_id,
                    user_id,
                    free_fire_uid,
                    game_name,
                    level,
                    cancelled,
                    created_at
                `)
                .eq("tournament_id", tournamentId)
                .eq("cancelled", false)
                .order("created_at", { ascending: true });

            if (entriesError) {
                console.error(
                    "PARTICIPANTS ENTRIES ERROR:",
                    entriesError
                );

                return res.status(500).json({
                    success: false,
                    error: entriesError.message
                });
            }

            const safeEntries = entries || [];

            // 2. Get unique user IDs
            const userIds = [
                ...new Set(
                    safeEntries
                        .map(entry => String(entry.user_id || "").trim())
                        .filter(Boolean)
                )
            ];

            // 3. Load real user profile data
            let users = [];

            if (userIds.length > 0) {
                const {
                    data,
                    error: usersError
                } = await supabase
                    .from("users")
                    .select(`
                        id,
                        full_name,
                        bio,
                        avatar_url
                    `)
                    .in("id", userIds);

                if (usersError) {
                    console.error(
                        "PARTICIPANTS USERS ERROR:",
                        usersError
                    );

                    return res.status(500).json({
                        success: false,
                        error: usersError.message
                    });
                }

                users = data || [];
            }

            // 4. Map users by ID
            const userMap = new Map(
                users.map(user => [
                    String(user.id),
                    user
                ])
            );

            // 5. Merge tournament entry + user profile
            const participants = safeEntries.map(
                (entry, index) => {
                    const user = userMap.get(
                        String(entry.user_id || "")
                    );

                    return {
                        id: entry.id,
                        entry_id: entry.id,
                        tournament_id: entry.tournament_id,
                        user_id: entry.user_id,

                        // REAL PROFILE
                        real_name: String(
                            user?.full_name || ""
                        ).trim(),

                        bio: String(
                            user?.bio || ""
                        ).trim(),

                        profile_pic: String(
                            user?.avatar_url || ""
                        ).trim(),

                        // GAME PROFILE
                        player_name: String(
                            entry.game_name || ""
                        ).trim(),

                        uid: String(
                            entry.free_fire_uid || ""
                        ).trim(),

                        free_fire_uid: String(
                            entry.free_fire_uid || ""
                        ).trim(),

                        level: Number(
                            entry.level || 0
                        ),

                        participant_number: index + 1,
                        cancelled: Boolean(entry.cancelled),
                        created_at: entry.created_at
                    };
                }
            );

            return res.status(200).json({
                success: true,
                players_joined: participants.length,
                participants
            });

        } catch (error) {
            console.error(
                "PARTICIPANTS EXCEPTION:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Internal server error"
            });
        }
    }
);



// ============================================================





// ============================================================

// GET MY MATCHES

// GET /api/tournaments/my-matches

// Returns only tournaments joined by the current user.

// ============================================================



router.get(

    "/my-matches",

    async (req, res) => {

        try {

            const userId = getUserId(req);



            if (!userId) {

                return res.status(401).json({

                    success: false,

                    code: "AUTH_REQUIRED",

                    error: "User session not found."

                });

            }



            const game = String(

                req.query.game || ""

            ).trim();



            const {

                data: entries,

                error: entryError

            } = await supabase

                .from("tournament_entries")

                .select("tournament_id")

                .eq("user_id", userId)

                .eq("cancelled", false);



            if (entryError) {

                console.error(

                    "MY MATCHES ENTRY ERROR:",

                    entryError

                );



                return res.status(500).json({

                    success: false,

                    error: entryError.message

                });

            }



            const tournamentIds = [

                ...new Set(

                    (entries || [])

                        .map((row) => row.tournament_id)

                        .filter(Boolean)

                        .map(String)

                )

            ];



            if (!tournamentIds.length) {

                return res.status(200).json({

                    success: true,

                    tournaments: []

                });

            }



            let query = supabase

                .from("tournaments")

                .select(`

                    id,

                    title,

                    game,

                    mode,

                    entry_fee,

                    prize_pool,

                    kill_reward,

                    max_players,

                    start_time,

                    map,

                    status,

                    rules,

                    bonus_usable_percent

                `)

                .in("id", tournamentIds)

                .order("start_time", { ascending: true });



            if (game) {

                query = query.eq("game", game);

            }



            const {

                data: tournaments,

                error: tournamentError

            } = await query;



            if (tournamentError) {

                console.error(

                    "MY MATCHES TOURNAMENT ERROR:",

                    tournamentError

                );



                return res.status(500).json({

                    success: false,

                    error: tournamentError.message

                });

            }



            const ids = (tournaments || [])

                .map((tournament) => tournament.id)

                .filter(Boolean);



            const countMap = {};



            if (ids.length) {

                const {

                    data: entryRows,

                    error: countError

                } = await supabase

                    .from("tournament_entries")

                    .select("tournament_id")

                    .in("tournament_id", ids)

                    .eq("cancelled", false);



                if (countError) {

                    console.error(

                        "MY MATCHES COUNT ERROR:",

                        countError

                    );

                } else {

                    for (const row of entryRows || []) {

                        const key = String(row.tournament_id);

                        countMap[key] =

                            (countMap[key] || 0) + 1;

                    }

                }

            }

            // ============================================================
            // LOAD RESULTS FOR CURRENT USER
            // ============================================================

            const resultMap = {};

            if (ids.length) {
                const {
                    data: resultRows,
                    error: resultError
                } = await supabase
                    .from("tournament_results")
                    .select(`
                        id,
                        tournament_id,
                        match_id,
                        user_id,
                        rank,
                        kills,
                        winning_amount
                    `)
                    .in("tournament_id", ids)
                    .eq("user_id", userId);

                if (resultError) {
                    console.error(
                        "MY MATCHES RESULTS ERROR:",
                        resultError
                    );
                } else {
                    for (const row of resultRows || []) {
                        resultMap[String(row.tournament_id)] = row;
                    }
                }
            }

            const result = (tournaments || []).map(
                (tournament) => {
                    const tournamentResult =
                        resultMap[String(tournament.id)] || null;

                    return {
                        ...tournament,
                        joined_count:
                            countMap[String(tournament.id)] || 0,
                        result: tournamentResult,
                        has_result: !!tournamentResult
                    };
                }
            );



            return res.status(200).json({

                success: true,

                tournaments: result

            });

        } catch (error) {

            console.error(

                "MY MATCHES EXCEPTION:",

                error

            );



            return res.status(500).json({

                success: false,

                error:

                    error?.message ||

                    "Internal server error"

            });

        }

    }

);



// GET MY ENTRY



// GET /api/tournaments/my-entry?tournamentId=UUID



// ============================================================







router.get(



    "/my-entry",



    async (req, res) => {







        try {







            const userId =



                getUserId(req);







            const tournamentId =



                String(



                    req.query.tournamentId ||



                    ""



                ).trim();







            if (!userId) {







                return res.status(401).json({



                    success: false,



                    code: "AUTH_REQUIRED",



                    error:



                        "User session not found."



                });



            }







            if (!tournamentId) {







                return res.status(400).json({



                    success: false,



                    error:



                        "Tournament ID is required."



                });



            }







            const {



                data,



                error



            } =



                await supabase



                    .from(



                        "tournament_entries"



                    )



                    .select(`



                        id,



                        tournament_id,



                        user_id,



                        free_fire_uid,



                        game_name,



                        level,



                        cancelled,



                        created_at



                    `)



                    .eq(



                        "tournament_id",



                        tournamentId



                    )



                    .eq(



                        "user_id",



                        userId



                    )



                    .eq(



                        "cancelled",



                        false



                    )



                    .maybeSingle();







            if (error) {







                console.error(



                    "MY ENTRY ERROR:",



                    error



                );







                return res.status(500).json({



                    success: false,



                    error: error.message



                });



            }







            return res.status(200).json({



                success: true,



                entry:



                    data || null,



                joined:



                    !!data



            });







        } catch (error) {







            console.error(



                "MY ENTRY EXCEPTION:",



                error



            );







            return res.status(500).json({



                success: false,



                error:



                    error?.message ||



                    "Internal server error"



            });



        }



    }



);







// ============================================================



// GET MY MATCH



// GET /api/tournaments/my-match?tournamentId=UUID



// ============================================================







router.get(



    "/my-match",



    async (req, res) => {



        try {



            const userId = getUserId(req);



            const tournamentId = String(



                req.query.tournamentId || ""



            ).trim();







            if (!userId) {



                return res.status(401).json({



                    success: false,



                    code: "AUTH_REQUIRED",



                    error: "User session not found."



                });



            }







            if (!tournamentId) {



                return res.status(400).json({



                    success: false,



                    error: "Tournament ID is required."



                });



            }







            const {



                data: entry,



                error: entryError



            } = await supabase



                .from("tournament_entries")



                .select("id")



                .eq("tournament_id", tournamentId)



                .eq("user_id", userId)



                .eq("cancelled", false)



                .maybeSingle();







            if (entryError) {



                console.error("MY MATCH ENTRY ERROR:", entryError);



                return res.status(500).json({



                    success: false,



                    error: entryError.message



                });



            }







            if (!entry) {



                return res.status(403).json({



                    success: false,



                    code: "NOT_JOINED",



                    error: "You have not joined this tournament."



                });



            }







            const {



                data: match,



                error: matchError



            } = await supabase



                .from("matches")



                .select("id,tournament_id,room_id,room_password")



                .eq("tournament_id", tournamentId)



                .order("id", { ascending: false })



                .limit(1)



                .maybeSingle();







            if (matchError) {



                console.error("MY MATCH ERROR:", matchError);



                return res.status(500).json({



                    success: false,



                    error: matchError.message



                });



            }







            return res.status(200).json({



                success: true,



                match: match || null,



                room_id: match?.room_id || null,



                room_password: match?.room_password || null



            });



        } catch (error) {



            console.error("MY MATCH EXCEPTION:", error);



            return res.status(500).json({



                success: false,



                error:



                    error?.message ||



                    "Internal server error"



            });



        }



    }



);







// ============================================================



// GET MY RESULTS



// GET /api/tournaments/my-results?tournamentId=UUID



// ============================================================



router.get(



    "/my-results",



    async (req, res) => {

        try {

            const userId = getUserId(req);

            const tournamentId = String(

                req.query.tournamentId || ""

            ).trim();



            if (!userId) {

                return res.status(401).json({

                    success: false,

                    code: "AUTH_REQUIRED",

                    error: "User session not found."

                });

            }



            if (!tournamentId) {

                return res.status(400).json({

                    success: false,

                    error: "Tournament ID is required."

                });

            }



            const {

                data: entry,

                error: entryError

            } = await supabase

                .from("tournament_entries")

                .select("id, user_id, free_fire_uid, game_name, level")

                .eq("tournament_id", tournamentId)

                .eq("user_id", userId)

                .eq("cancelled", false)

                .maybeSingle();



            if (entryError) {

                console.error("MY RESULTS ENTRY ERROR:", entryError);

                return res.status(500).json({

                    success: false,

                    error: entryError.message

                });

            }



            if (!entry) {

                return res.status(403).json({

                    success: false,

                    code: "NOT_JOINED",

                    error: "You have not joined this tournament."

                });

            }



            const {

                data: results,

                error: resultsError

            } = await supabase

                .from("tournament_results")

                .select(`
                    id,
                    tournament_id,
                    match_id,
                    user_id,
                    rank,
                    kills,
                    winning_amount
                `)

                .eq("tournament_id", tournamentId)

                .eq("user_id", userId)

                .order("rank", { ascending: true });



            if (resultsError) {

                console.error("MY RESULTS ERROR:", resultsError);

                return res.status(500).json({

                    success: false,

                    error: resultsError.message

                });

            }



            // Load the current user's real profile details.
            let userProfile = null;

            const {

                data: profile,

                error: profileError

            } = await supabase

                .from("users")

                .select(`
                    id,
                    full_name,
                    bio,
                    avatar_url
                `)

                .eq("id", userId)

                .maybeSingle();



            if (profileError) {

                console.error("MY RESULTS PROFILE ERROR:", profileError);

                return res.status(500).json({

                    success: false,

                    error: profileError.message

                });

            }



            userProfile = profile || null;



            // Merge tournament result + joined game profile + real user profile.
            const mergedResults = (results || []).map((result) => ({

                ...result,

                real_name: String(userProfile?.full_name || "").trim(),

                player_name: String(entry.game_name || "").trim(),

                uid: String(entry.free_fire_uid || "").trim(),

                free_fire_uid: String(entry.free_fire_uid || "").trim(),

                level: Number(entry.level || 0),

                bio: String(userProfile?.bio || "").trim(),

                profile_pic: String(userProfile?.avatar_url || "").trim()

            }));



            return res.status(200).json({

                success: true,

                tournamentId,

                userId,

                published: mergedResults.length > 0,

                results: mergedResults

            });



        } catch (error) {

            console.error("MY RESULTS EXCEPTION:", error);

            return res.status(500).json({

                success: false,

                error:

                    error?.message ||

                    "Internal server error"

            });

        }

    }

);



// ============================================================



// JOIN TOURNAMENT



//



// IMPORTANT:



// THIS ROUTE MUST COME BEFORE /:id



//



// POST /api/tournaments/join



// ============================================================







router.post(



    "/join",



    async (req, res) => {







        let originalDeposit = 0;



        let originalBonus = 0;



        let originalWinning = 0;



        let walletUpdated = false;



        let userId = "";







        try {







            userId =



                getUserId(req);







            const {



                tournamentId,



                gameName,



                uid,



                level



            } = req.body || {};







            const cleanTournamentId =



                String(



                    tournamentId || ""



                ).trim();







            const cleanGameName =



                String(



                    gameName || ""



                ).trim();







            const cleanUid =



                String(



                    uid || ""



                ).trim();







            const cleanLevel =



                Number(level);







            // =================================================



            // AUTH



            // =================================================







            if (!userId) {







                return res.status(401).json({



                    success: false,



                    code: "AUTH_REQUIRED",



                    error:



                        "User session not found. Please login again."



                });



            }







            // =================================================



            // VALIDATION



            // =================================================







            if (!cleanTournamentId) {







                return res.status(400).json({



                    success: false,



                    code: "INVALID_TOURNAMENT",



                    error:



                        "Tournament ID is required."



                });



            }







            if (!cleanGameName) {







                return res.status(400).json({



                    success: false,



                    code: "INVALID_GAME_NAME",



                    error:



                        "In-Game Name is required."



                });



            }







            if (!cleanUid) {







                return res.status(400).json({



                    success: false,



                    code: "INVALID_UID",



                    error:



                        "Free Fire UID is required."



                });



            }







            if (



                !Number.isInteger(



                    cleanLevel



                ) ||



                cleanLevel < 1 ||



                cleanLevel > 100



            ) {







                return res.status(400).json({



                    success: false,



                    code: "INVALID_LEVEL",



                    error:



                        "Level must be between 1 and 100."



                });



            }







            // =================================================



            // TOURNAMENT



            // =================================================







            const {



                data: tournament,



                error: tournamentError



            } =



                await supabase



                    .from(



                        "tournaments"



                    )



                    .select(`



                        id,



                        title,



                        game,



                        mode,



                        entry_fee,



                        prize_pool,



                        max_players,



                        status,



                        bonus_usable_percent



                    `)



                    .eq(



                        "id",



                        cleanTournamentId



                    )



                    .maybeSingle();







            if (tournamentError) {







                console.error(



                    "TOURNAMENT FETCH ERROR:",



                    tournamentError



                );







                return res.status(500).json({



                    success: false,



                    error:



                        tournamentError.message



                });



            }







            if (!tournament) {







                return res.status(404).json({



                    success: false,



                    code:



                        "TOURNAMENT_NOT_FOUND",



                    error:



                        "Tournament not found."



                });



            }







            // =================================================
            // USER RESTRICTION + DAILY GAME LIMIT
            // =================================================

            const fullAppCheck = await checkUserRestriction(
                userId,
                null
            );

            if (fullAppCheck.restricted) {
                return restrictionResponse(
                    res,
                    fullAppCheck.feature,
                    fullAppCheck.restriction
                );
            }

            const restrictionGame = gameRestrictionKey(
                tournament.game
            );

            if (restrictionGame) {
                const gameRestriction = await checkUserRestriction(
                    userId,
                    restrictionGame
                );

                if (gameRestriction.restricted) {
                    return restrictionResponse(
                        res,
                        gameRestriction.feature,
                        gameRestriction.restriction
                    );
                }

                const gameLimit = await getUserGameLimit(
                    userId,
                    restrictionGame
                );

                if (gameLimit) {
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);

                    const tomorrowStart = new Date(todayStart);
                    tomorrowStart.setDate(
                        tomorrowStart.getDate() + 1
                    );

                    const {
                        data: todayEntries,
                        error: todayEntriesError
                    } = await supabase
                        .from("tournament_entries")
                        .select("tournament_id, created_at")
                        .eq("user_id", userId)
                        .eq("cancelled", false)
                        .gte(
                            "created_at",
                            todayStart.toISOString()
                        )
                        .lt(
                            "created_at",
                            tomorrowStart.toISOString()
                        );

                    if (todayEntriesError) {
                        console.error(
                            "DAILY GAME LIMIT ENTRY ERROR:",
                            todayEntriesError
                        );

                        return res.status(500).json({
                            success: false,
                            code: "DAILY_LIMIT_CHECK_FAILED",
                            error: "Unable to check your daily game limit."
                        });
                    }

                    const joinedTournamentIds = [
                        ...new Set(
                            (todayEntries || [])
                                .map((entry) => entry.tournament_id)
                                .filter(Boolean)
                                .map(String)
                        )
                    ];

                    let todayGameJoinCount = 0;

                    if (joinedTournamentIds.length > 0) {
                        const {
                            data: joinedTournaments,
                            error: joinedTournamentsError
                        } = await supabase
                            .from("tournaments")
                            .select("id, game")
                            .in("id", joinedTournamentIds);

                        if (joinedTournamentsError) {
                            console.error(
                                "DAILY GAME LIMIT TOURNAMENT ERROR:",
                                joinedTournamentsError
                            );

                            return res.status(500).json({
                                success: false,
                                code: "DAILY_LIMIT_CHECK_FAILED",
                                error: "Unable to check your daily game limit."
                            });
                        }

                        todayGameJoinCount = (joinedTournaments || [])
                            .filter(
                                (item) =>
                                    gameRestrictionKey(item.game) ===
                                    restrictionGame
                            )
                            .length;
                    }

                    const dailyLimit = Number(
                        gameLimit.daily_limit
                    );

                    if (
                        Number.isFinite(dailyLimit) &&
                        dailyLimit >= 0 &&
                        todayGameJoinCount >= dailyLimit
                    ) {
                        const gameNames = {
                            freefire: "Free Fire",
                            freefiremax: "Free Fire MAX",
                            clashsquad: "Clash Squad",
                            lonewolf: "Lone Wolf"
                        };

                        const displayGame =
                            gameNames[restrictionGame] ||
                            "This game";

                        return res.status(403).json({
                            success: false,
                            code: "DAILY_GAME_LIMIT_REACHED",
                            feature: restrictionGame,
                            daily_limit: dailyLimit,
                            joined_today: todayGameJoinCount,
                            error:
                                `${displayGame} daily join limit reached. ` +
                                `You can join maximum ${dailyLimit} tournament(s) per day.`
                        });
                    }
                }
            }



            // =================================================



            // STATUS

            // =================================================







            const status =



                String(



                    tournament.status || ""



                )



                    .trim()



                    .toLowerCase();







            const allowedStatuses = [



                "",



                "upcoming",



                "open",



                "active",



                "live",



                "scheduled"



            ];







            if (



                !allowedStatuses.includes(



                    status



                )



            ) {







                return res.status(400).json({



                    success: false,



                    code:



                        "TOURNAMENT_CLOSED",



                    error:



                        "This tournament is not open for joining."



                });



            }







            // =================================================



            // ENTRY FEE



            // =================================================







            const entryFee =



                cleanNumber(



                    tournament.entry_fee,



                    0



                );







            if (entryFee < 0) {







                return res.status(400).json({



                    success: false,



                    error:



                        "Invalid tournament entry fee."



                });



            }







            // =================================================



            // PLAYER LIMIT



            // =================================================







            if (



                tournament.max_players &&



                Number(



                    tournament.max_players



                ) > 0



            ) {







                const {



                    count,



                    error: countError



                } =



                    await supabase



                        .from(



                            "tournament_entries"



                        )



                        .select(



                            "id",



                            {



                                count: "exact",



                                head: true



                            }



                        )



                        .eq(



                            "tournament_id",



                            cleanTournamentId



                        )



                        .eq(



                            "cancelled",



                            false



                        );







                if (countError) {







                    console.error(



                        "PLAYER COUNT ERROR:",



                        countError



                    );







                    return res.status(500).json({



                        success: false,



                        error:



                            countError.message



                    });



                }







                if (



                    (count || 0) >=



                    Number(



                        tournament.max_players



                    )



                ) {







                    return res.status(400).json({



                        success: false,



                        code:



                            "TOURNAMENT_FULL",



                        error:



                            "Tournament is full."



                    });



                }



            }







            // =================================================



            // DUPLICATE CHECK



            // =================================================







            const {



                data: existingEntry,



                error: existingError



            } =



                await supabase



                    .from(



                        "tournament_entries"



                    )



                    .select("id")



                    .eq(



                        "tournament_id",



                        cleanTournamentId



                    )



                    .eq(



                        "user_id",



                        userId



                    )



                    .eq(



                        "cancelled",



                        false



                    )



                    .maybeSingle();







            if (existingError) {







                console.error(



                    "DUPLICATE CHECK ERROR:",



                    existingError



                );







                return res.status(500).json({



                    success: false,



                    error:



                        existingError.message



                });



            }







            if (existingEntry) {







                return res.status(409).json({



                    success: false,



                    code:



                        "ALREADY_JOINED",



                    error:



                        "You have already joined this tournament."



                });



            }







            // =================================================



            // WALLET



            // =================================================







            const {



                data: wallet,



                error: walletError



            } =



                await supabase



                    .from("wallet_balances")



                    .select(`



                        user_id,



                        deposit_balance,



                        bonus_balance,



                        winning_balance



                    `)



                    .eq(



                        "user_id",



                        userId



                    )



                    .maybeSingle();







            if (walletError) {







                console.error(



                    "WALLET FETCH ERROR:",



                    walletError



                );







                return res.status(500).json({



                    success: false,



                    error:



                        walletError.message



                });



            }







            if (!wallet) {







                return res.status(400).json({



                    success: false,



                    code:



                        "WALLET_NOT_FOUND",



                    error:



                        "Wallet not found."



                });



            }







            // =================================================



            // BALANCES



            // =================================================







            let deposit =



                cleanNumber(



                    wallet.deposit_balance



                );







            let bonus =



                cleanNumber(



                    wallet.bonus_balance



                );







            let winning =



                cleanNumber(



                    wallet.winning_balance



                );







            originalDeposit =



                deposit;







            originalBonus =



                bonus;







            originalWinning =



                winning;







            const total =



                deposit +



                bonus +



                winning;







            if (



                total <



                entryFee



            ) {







                return res.status(402).json({



                    success: false,



                    code:



                        "INSUFFICIENT_BALANCE",



                    error:



                        "Insufficient wallet balance."



                });



            }







            // =================================================



            // BONUS USABLE %



            // =================================================







            let bonusPercent =



                cleanNumber(



                    tournament.bonus_usable_percent,



                    0



                );







            bonusPercent =



                Math.max(



                    0,



                    Math.min(



                        100,



                        bonusPercent



                    )



                );







            const maxBonusUsable =



                entryFee *



                (



                    bonusPercent /



                    100



                );







            // =================================================



            // DEDUCTION ORDER



            //



            // BONUS



            // ↓



            // DEPOSIT



            // ↓



            // WINNING



            // =================================================







            let remaining =



                entryFee;







            const bonusDeduction =



                Math.min(



                    bonus,



                    maxBonusUsable,



                    remaining



                );







            remaining -=



                bonusDeduction;







            const depositDeduction =



                Math.min(



                    deposit,



                    remaining



                );







            remaining -=



                depositDeduction;







            const winningDeduction =



                Math.min(



                    winning,



                    remaining



                );







            remaining -=



                winningDeduction;







            if (



                remaining >



                0.0001



            ) {







                return res.status(402).json({



                    success: false,



                    code:



                        "INSUFFICIENT_BALANCE",



                    error:



                        "Insufficient usable wallet balance."



                });



            }







            // =================================================



            // NEW BALANCES



            // =================================================







            const newDeposit =



                Number(



                    (



                        deposit -



                        depositDeduction



                    ).toFixed(2)



                );







            const newBonus =



                Number(



                    (



                        bonus -



                        bonusDeduction



                    ).toFixed(2)



                );







            const newWinning =



                Number(



                    (



                        winning -



                        winningDeduction



                    ).toFixed(2)



                );







            // =================================================



            // UPDATE WALLET



            // =================================================







            const {



                error:



                    updateWalletError



            } =



                await supabase



                    .from("wallet_balances")



                    .update({



                        deposit_balance:



                            newDeposit,







                        bonus_balance:



                            newBonus,







                        winning_balance:



                            newWinning,







                        updated_at:



                            new Date()



                                .toISOString()



                    })



                    .eq(



                        "user_id",



                        userId



                    );







            if (updateWalletError) {







                console.error(



                    "WALLET UPDATE ERROR:",



                    updateWalletError



                );







                return res.status(500).json({



                    success: false,



                    code:



                        "WALLET_UPDATE_FAILED",



                    error:



                        updateWalletError.message



                });



            }







            walletUpdated = true;







            // =================================================



            // CREATE ENTRY



            // =================================================







            const {



                data: entry,



                error: entryError



            } =



                await supabase



                    .from(



                        "tournament_entries"



                    )



                    .insert({



                        tournament_id:



                            cleanTournamentId,







                        user_id:



                            userId,







                        free_fire_uid:



                            cleanUid,







                        game_name:



                            cleanGameName,







                        level:



                            cleanLevel,







                        cancelled:



                            false



                    })



                    .select(`



                        id,



                        tournament_id,



                        user_id,



                        free_fire_uid,



                        game_name,



                        level,



                        cancelled,



                        created_at



                    `)



                    .single();







            // =================================================



            // ENTRY FAILED → WALLET ROLLBACK



            // =================================================







            if (entryError) {







                console.error(



                    "TOURNAMENT ENTRY ERROR:",



                    entryError



                );







                if (walletUpdated) {







                    const {



                        error:



                            rollbackError



                    } =



                        await supabase



                            .from("wallet_balances")



                            .update({



                                deposit_balance:



                                    originalDeposit,







                                bonus_balance:



                                    originalBonus,







                                winning_balance:



                                    originalWinning,







                                updated_at:



                                    new Date()



                                        .toISOString()



                            })



                            .eq(



                                "user_id",



                                userId



                            );







                    if (rollbackError) {







                        console.error(



                            "WALLET ROLLBACK ERROR:",



                            rollbackError



                        );



                    }



                }







                return res.status(500).json({



                    success: false,



                    code:



                        "JOIN_FAILED",



                    error:



                        entryError.message ||



                        "Unable to join tournament."



                });



            }

            // =================================================
            // CREATE WALLET TRANSACTION LOGS
            // =================================================
            // Record each wallet source used for this tournament fee.

            const transactionRows = [
                bonusDeduction > 0
                    ? {
                        user_id: userId,
                        amount: -Number(bonusDeduction.toFixed(2)),
                        type: "entry_fee",
                        description: `Tournament entry fee (bonus) - ${tournament.title}`,
                        reference_id: entry.id
                    }
                    : null,
                depositDeduction > 0
                    ? {
                        user_id: userId,
                        amount: -Number(depositDeduction.toFixed(2)),
                        type: "entry_fee",
                        description: `Tournament entry fee (deposit) - ${tournament.title}`,
                        reference_id: entry.id
                    }
                    : null,
                winningDeduction > 0
                    ? {
                        user_id: userId,
                        amount: -Number(winningDeduction.toFixed(2)),
                        type: "entry_fee",
                        description: `Tournament entry fee (winning) - ${tournament.title}`,
                        reference_id: entry.id
                    }
                    : null
            ].filter(Boolean);

            if (transactionRows.length > 0) {
                const { error: transactionError } = await supabase
                    .from("wallet_transactions")
                    .insert(transactionRows);

                if (transactionError) {
                    console.error(
                        "TOURNAMENT WALLET LOG ERROR:",
                        transactionError
                    );

                    await supabase
                        .from("tournament_entries")
                        .delete()
                        .eq("id", entry.id);

                    const { error: transactionRollbackError } = await supabase
                        .from("wallet_balances")
                        .update({
                            deposit_balance: originalDeposit,
                            bonus_balance: originalBonus,
                            winning_balance: originalWinning,
                            updated_at: new Date().toISOString()
                        })
                        .eq("user_id", userId);

                    if (transactionRollbackError) {
                        console.error(
                            "TRANSACTION LOG WALLET ROLLBACK ERROR:",
                            transactionRollbackError
                        );
                    }

                    return res.status(500).json({
                        success: false,
                        code: "TRANSACTION_LOG_FAILED",
                        error: "Unable to record tournament wallet transaction."
                    });
                }

                console.log(
                    "TOURNAMENT WALLET LOG CREATED:",
                    {
                        userId,
                        tournamentId: cleanTournamentId,
                        entryId: entry.id,
                        transactions: transactionRows.length
                    }
                );
            }

            // =================================================
            // SUCCESS
            // =================================================

            const remainingBalance =



                Number(



                    (



                        newDeposit +



                        newBonus +



                        newWinning



                    ).toFixed(2)



                );







            return res.status(200).json({







                success: true,







                code:



                    "TOURNAMENT_JOINED",







                message:



                    "Tournament joined successfully!",







                entryId:



                    entry?.id || null,







                tournamentId:



                    cleanTournamentId,







                wallet: {







                    depositBalance:



                        newDeposit,







                    bonusBalance:



                        newBonus,







                    winningBalance:



                        newWinning,







                    totalBalance:



                        remainingBalance



                },







                deduction: {







                    entryFee:



                        entryFee,







                    bonus:



                        Number(



                            bonusDeduction



                                .toFixed(2)



                        ),







                    deposit:



                        Number(



                            depositDeduction



                                .toFixed(2)



                        ),







                    winning:



                        Number(



                            winningDeduction



                                .toFixed(2)



                        )



                }



            });







        } catch (error) {







            console.error(



                "JOIN TOURNAMENT EXCEPTION:",



                error



            );







            // =================================================



            // SAFETY ROLLBACK



            // =================================================







            if (



                walletUpdated &&



                userId



            ) {







                try {







                    await supabase



                        .from("wallet_balances")



                        .update({



                            deposit_balance:



                                originalDeposit,







                            bonus_balance:



                                originalBonus,







                            winning_balance:



                                originalWinning,







                            updated_at:



                                new Date()



                                    .toISOString()



                        })



                        .eq(



                            "user_id",



                            userId



                        );







                } catch (



                    rollbackException



                ) {







                    console.error(



                        "EXCEPTION ROLLBACK ERROR:",



                        rollbackException



                    );



                }



            }







            return res.status(500).json({



                success: false,



                code:



                    "SERVER_ERROR",



                error:



                    error?.message ||



                    "Internal server error"



            });



        }



    }



);







// ============================================================



// ============================================================
// TEAM SYSTEM FINAL PATCH
// DUO / SQUAD FOR ALL SUPPORTED GAMES
// ============================================================

function getTeamConfig(mode) {
    const normalized = String(mode || "").trim().toUpperCase();

    if (normalized === "DUO") {
        return { type: "DUO", maxMembers: 2, maxTeams: 24 };
    }

    if (normalized === "SQUAD") {
        return { type: "SQUAD", maxMembers: 4, maxTeams: 12 };
    }

    return null;
}

function generateTeamCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

async function checkTeamJoinRules(userId, tournament) {
    const fullAppCheck = await checkUserRestriction(userId, null);

    if (fullAppCheck.restricted) {
        return {
            blocked: true,
            response: {
                feature: fullAppCheck.feature,
                restriction: fullAppCheck.restriction
            }
        };
    }

    const restrictionGame = gameRestrictionKey(tournament.game);

    if (!restrictionGame) {
        return { blocked: false };
    }

    const gameRestriction = await checkUserRestriction(
        userId,
        restrictionGame
    );

    if (gameRestriction.restricted) {
        return {
            blocked: true,
            response: {
                feature: gameRestriction.feature,
                restriction: gameRestriction.restriction
            }
        };
    }

    const gameLimit = await getUserGameLimit(
        userId,
        restrictionGame
    );

    if (!gameLimit) {
        return { blocked: false };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const {
        data: todayEntries,
        error: todayEntriesError
    } = await supabase
        .from("tournament_entries")
        .select("tournament_id, created_at")
        .eq("user_id", userId)
        .eq("cancelled", false)
        .gte("created_at", todayStart.toISOString())
        .lt("created_at", tomorrowStart.toISOString());

    if (todayEntriesError) {
        throw new Error("Unable to check your daily game limit.");
    }

    const joinedTournamentIds = [
        ...new Set(
            (todayEntries || [])
                .map((entry) => entry.tournament_id)
                .filter(Boolean)
                .map(String)
        )
    ];

    let todayGameJoinCount = 0;

    if (joinedTournamentIds.length > 0) {
        const {
            data: joinedTournaments,
            error: joinedTournamentsError
        } = await supabase
            .from("tournaments")
            .select("id, game")
            .in("id", joinedTournamentIds);

        if (joinedTournamentsError) {
            throw new Error("Unable to check your daily game limit.");
        }

        todayGameJoinCount = (joinedTournaments || []).filter(
            (item) =>
                gameRestrictionKey(item.game) === restrictionGame
        ).length;
    }

    const dailyLimit = Number(gameLimit.daily_limit);

    if (
        Number.isFinite(dailyLimit) &&
        dailyLimit >= 0 &&
        todayGameJoinCount >= dailyLimit
    ) {
        const gameNames = {
            freefire: "Free Fire",
            freefiremax: "Free Fire MAX",
            clashsquad: "Clash Squad",
            lonewolf: "Lone Wolf"
        };

        const displayGame =
            gameNames[restrictionGame] || "This game";

        return {
            blocked: true,
            dailyLimit,
            joinedToday: todayGameJoinCount,
            error:
                `${displayGame} daily join limit reached. ` +
                `You can join maximum ${dailyLimit} tournament(s) per day.`
        };
    }

    return { blocked: false };
}

// ============================================================
// CREATE TEAM
// POST /api/tournaments/team/create
// ============================================================

router.post("/team/create", async (req, res) => {
    let userId = "";
    let originalDeposit = 0;
    let originalBonus = 0;
    let originalWinning = 0;
    let walletUpdated = false;
    let createdTeamId = null;
    let createdEntryId = null;
    let createdMemberId = null;

    try {
        userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                code: "AUTH_REQUIRED",
                error: "User session not found. Please login again."
            });
        }

        const { tournamentId, teamName, gameName, uid, level } = req.body || {};

        const cleanTournamentId = String(tournamentId || "").trim();
        const cleanTeamName = String(teamName || "").trim();
        const cleanGameName = String(gameName || "").trim();
        const cleanUid = String(uid || "").trim();
        const cleanLevel = Number(level);

        if (!cleanTournamentId) {
            return res.status(400).json({
                success: false,
                code: "INVALID_TOURNAMENT",
                error: "Tournament ID is required."
            });
        }

        if (!cleanTeamName) {
            return res.status(400).json({
                success: false,
                code: "INVALID_TEAM_NAME",
                error: "Team name is required."
            });
        }

        if (cleanTeamName.length > 30) {
            return res.status(400).json({
                success: false,
                code: "INVALID_TEAM_NAME",
                error: "Team name must be 30 characters or less."
            });
        }

        if (!cleanGameName) {
            return res.status(400).json({
                success: false,
                code: "INVALID_GAME_NAME",
                error: "In-Game Name is required."
            });
        }

        if (!cleanUid) {
            return res.status(400).json({
                success: false,
                code: "INVALID_UID",
                error: "Free Fire UID is required."
            });
        }

        if (!Number.isInteger(cleanLevel) || cleanLevel < 1 || cleanLevel > 100) {
            return res.status(400).json({
                success: false,
                code: "INVALID_LEVEL",
                error: "Level must be between 1 and 100."
            });
        }

        const {
            data: tournament,
            error: tournamentError
        } = await supabase
            .from("tournaments")
            .select(`
                id,
                title,
                game,
                mode,
                entry_fee,
                prize_pool,
                max_players,
                status,
                bonus_usable_percent
            `)
            .eq("id", cleanTournamentId)
            .maybeSingle();

        if (tournamentError) {
            console.error("TEAM CREATE TOURNAMENT ERROR:", tournamentError);
            return res.status(500).json({
                success: false,
                error: tournamentError.message
            });
        }

        if (!tournament) {
            return res.status(404).json({
                success: false,
                code: "TOURNAMENT_NOT_FOUND",
                error: "Tournament not found."
            });
        }

        const teamConfig = getTeamConfig(tournament.mode);

        if (!teamConfig) {
            return res.status(400).json({
                success: false,
                code: "TEAM_MODE_REQUIRED",
                error: "This tournament is not a Duo or Squad tournament."
            });
        }

        const ruleCheck = await checkTeamJoinRules(userId, tournament);

        if (ruleCheck.blocked) {
            if (ruleCheck.response) {
                return restrictionResponse(
                    res,
                    ruleCheck.response.feature,
                    ruleCheck.response.restriction
                );
            }

            return res.status(403).json({
                success: false,
                code: "DAILY_GAME_LIMIT_REACHED",
                feature: gameRestrictionKey(tournament.game),
                daily_limit: ruleCheck.dailyLimit,
                joined_today: ruleCheck.joinedToday,
                error: ruleCheck.error
            });
        }

        const status = String(tournament.status || "").trim().toLowerCase();
        const allowedStatuses = [
            "",
            "upcoming",
            "open",
            "active",
            "live",
            "scheduled"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                code: "TOURNAMENT_CLOSED",
                error: "This tournament is not open for joining."
            });
        }

        const entryFee = cleanNumber(tournament.entry_fee, 0);

        if (!Number.isFinite(entryFee) || entryFee < 0) {
            return res.status(400).json({
                success: false,
                code: "INVALID_ENTRY_FEE",
                error: "Invalid tournament entry fee."
            });
        }

        if (tournament.max_players && Number(tournament.max_players) > 0) {
            const { count, error: countError } = await supabase
                .from("tournament_entries")
                .select("id", { count: "exact", head: true })
                .eq("tournament_id", cleanTournamentId)
                .eq("cancelled", false);

            if (countError) {
                return res.status(500).json({
                    success: false,
                    error: countError.message
                });
            }

            if ((count || 0) >= Number(tournament.max_players)) {
                return res.status(400).json({
                    success: false,
                    code: "TOURNAMENT_FULL",
                    error: "Tournament is full."
                });
            }
        }

        const {
            data: existingEntry,
            error: existingEntryError
        } = await supabase
            .from("tournament_entries")
            .select("id")
            .eq("tournament_id", cleanTournamentId)
            .eq("user_id", userId)
            .eq("cancelled", false)
            .maybeSingle();

        if (existingEntryError) {
            return res.status(500).json({
                success: false,
                error: existingEntryError.message
            });
        }

        if (existingEntry) {
            return res.status(409).json({
                success: false,
                code: "ALREADY_JOINED",
                error: "You have already joined this tournament."
            });
        }

        const {
            count: teamCount,
            error: teamCountError
        } = await supabase
            .from("tournament_teams")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", cleanTournamentId)
            .neq("status", "cancelled");

        if (teamCountError) {
            return res.status(500).json({
                success: false,
                error: teamCountError.message
            });
        }

        if (Number(teamCount || 0) >= teamConfig.maxTeams) {
            return res.status(400).json({
                success: false,
                code: "TOURNAMENT_FULL",
                error: `Maximum ${teamConfig.maxTeams} teams reached.`
            });
        }

        const {
            data: wallet,
            error: walletError
        } = await supabase
            .from("wallet_balances")
            .select(`
                user_id,
                deposit_balance,
                bonus_balance,
                winning_balance
            `)
            .eq("user_id", userId)
            .maybeSingle();

        if (walletError) {
            return res.status(500).json({
                success: false,
                error: walletError.message
            });
        }

        if (!wallet) {
            return res.status(402).json({
                success: false,
                code: "INSUFFICIENT_BALANCE",
                error: "Wallet balance is not available."
            });
        }

        const deposit = Number(wallet.deposit_balance || 0);
        const bonus = Number(wallet.bonus_balance || 0);
        const winning = Number(wallet.winning_balance || 0);

        originalDeposit = deposit;
        originalBonus = bonus;
        originalWinning = winning;

        const bonusPercent = Math.max(
            0,
            Math.min(100, Number(tournament.bonus_usable_percent || 0))
        );

        let remaining = entryFee;

        const bonusDeduction = Math.min(
            bonus,
            entryFee * (bonusPercent / 100)
        );

        remaining -= bonusDeduction;

        const depositDeduction = Math.min(deposit, remaining);
        remaining -= depositDeduction;

        const winningDeduction = Math.min(winning, remaining);
        remaining -= winningDeduction;

        if (remaining > 0.0001) {
            return res.status(402).json({
                success: false,
                code: "INSUFFICIENT_BALANCE",
                error: "Insufficient usable wallet balance."
            });
        }

        const newDeposit = Number((deposit - depositDeduction).toFixed(2));
        const newBonus = Number((bonus - bonusDeduction).toFixed(2));
        const newWinning = Number((winning - winningDeduction).toFixed(2));

        const { error: updateWalletError } = await supabase
            .from("wallet_balances")
            .update({
                deposit_balance: newDeposit,
                bonus_balance: newBonus,
                winning_balance: newWinning,
                updated_at: new Date().toISOString()
            })
            .eq("user_id", userId);

        if (updateWalletError) {
            return res.status(500).json({
                success: false,
                error: updateWalletError.message
            });
        }

        walletUpdated = true;

        let team = null;
        let teamError = null;

        for (let attempt = 0; attempt < 8; attempt++) {
            const teamCode = generateTeamCode();

            const result = await supabase
                .from("tournament_teams")
                .insert({
                    tournament_id: cleanTournamentId,
                    team_code: teamCode,
                    team_name: cleanTeamName,
                    leader_user_id: userId,
                    team_type: teamConfig.type,
                    max_members: teamConfig.maxMembers,
                    status: "open"
                })
                .select(`
                    id,
                    tournament_id,
                    team_code,
                    team_name,
                    leader_user_id,
                    team_type,
                    max_members,
                    status,
                    created_at
                `)
                .single();

            team = result.data;
            teamError = result.error;

            if (!teamError) break;
        }

        if (teamError || !team) {
            throw new Error(
                teamError?.message || "Unable to create team."
            );
        }

        createdTeamId = team.id;

        const {
            data: entry,
            error: entryError
        } = await supabase
            .from("tournament_entries")
            .insert({
                tournament_id: cleanTournamentId,
                user_id: userId,
                free_fire_uid: cleanUid,
                game_name: cleanGameName,
                level: cleanLevel,
                cancelled: false
            })
            .select(`
                id,
                tournament_id,
                user_id,
                free_fire_uid,
                game_name,
                level,
                cancelled,
                created_at
            `)
            .single();

        if (entryError) {
            throw new Error(entryError.message);
        }

        createdEntryId = entry.id;

        const {
            data: member,
            error: memberError
        } = await supabase
            .from("tournament_team_members")
            .insert({
                team_id: team.id,
                tournament_id: cleanTournamentId,
                user_id: userId,
                game_name: cleanGameName,
                free_fire_uid: cleanUid,
                level: cleanLevel,
                is_leader: true,
                entry_id: entry.id
            })
            .select("id")
            .single();

        if (memberError) {
            throw new Error(memberError.message);
        }

        createdMemberId = member.id;

        const transactions = [];

        if (bonusDeduction > 0) {
            transactions.push({
                user_id: userId,
                amount: -Number(bonusDeduction.toFixed(2)),
                type: "entry_fee",
                description: `Team entry fee - ${tournament.title}`,
                reference_id: entry.id
            });
        }

        if (depositDeduction > 0) {
            transactions.push({
                user_id: userId,
                amount: -Number(depositDeduction.toFixed(2)),
                type: "entry_fee",
                description: `Team entry fee - ${tournament.title}`,
                reference_id: entry.id
            });
        }

        if (winningDeduction > 0) {
            transactions.push({
                user_id: userId,
                amount: -Number(winningDeduction.toFixed(2)),
                type: "entry_fee",
                description: `Team entry fee - ${tournament.title}`,
                reference_id: entry.id
            });
        }

        if (transactions.length > 0) {
            const { error: transactionError } = await supabase
                .from("wallet_transactions")
                .insert(transactions);

            if (transactionError) {
                throw new Error(transactionError.message);
            }
        }

        return res.status(201).json({
            success: true,
            code: "TEAM_CREATED",
            message: `${teamConfig.type} team created successfully.`,
            team: {
                id: team.id,
                teamCode: team.team_code,
                teamName: team.team_name,
                teamType: team.team_type,
                maxMembers: team.max_members,
                memberCount: 1,
                leader: true
            },
            entryId: entry.id,
            entryFee,
            wallet: {
                depositBalance: newDeposit,
                bonusBalance: newBonus,
                winningBalance: newWinning
            }
        });

    } catch (error) {
        console.error("TEAM CREATE EXCEPTION:", error);

        try {
            if (createdMemberId) {
                await supabase
                    .from("tournament_team_members")
                    .delete()
                    .eq("id", createdMemberId);
            }

            if (createdEntryId) {
                await supabase
                    .from("tournament_entries")
                    .delete()
                    .eq("id", createdEntryId);
            }

            if (createdTeamId) {
                await supabase
                    .from("tournament_teams")
                    .delete()
                    .eq("id", createdTeamId);
            }

            if (walletUpdated) {
                await supabase
                    .from("wallet_balances")
                    .update({
                        deposit_balance: originalDeposit,
                        bonus_balance: originalBonus,
                        winning_balance: originalWinning,
                        updated_at: new Date().toISOString()
                    })
                    .eq("user_id", userId);
            }
        } catch (rollbackError) {
            console.error("TEAM CREATE ROLLBACK ERROR:", rollbackError);
        }

        return res.status(500).json({
            success: false,
            code: "TEAM_CREATE_FAILED",
            error: error?.message || "Unable to create team."
        });
    }
});

// ============================================================
// GET MY TEAM
// GET /api/tournaments/team/my?tournamentId=UUID
// ============================================================

router.get("/team/my", async (req, res) => {
    try {
        const userId = getUserId(req);
        const tournamentId = String(req.query.tournamentId || "").trim();

        if (!userId) {
            return res.status(401).json({
                success: false,
                code: "AUTH_REQUIRED",
                error: "User session not found."
            });
        }

        if (!tournamentId) {
            return res.status(400).json({
                success: false,
                code: "INVALID_TOURNAMENT",
                error: "Tournament ID is required."
            });
        }

        const { data: member, error: memberError } = await supabase
            .from("tournament_team_members")
            .select("team_id, tournament_id, user_id, is_leader")
            .eq("tournament_id", tournamentId)
            .eq("user_id", userId)
            .maybeSingle();

        if (memberError) {
            console.error("MY TEAM MEMBER ERROR:", memberError);
            return res.status(500).json({
                success: false,
                error: memberError.message
            });
        }

        if (!member) {
            return res.status(200).json({
                success: true,
                hasTeam: false,
                team: null
            });
        }

        const { data: team, error: teamError } = await supabase
            .from("tournament_teams")
            .select("id, tournament_id, team_code, team_name, team_type, max_members, status, created_at")
            .eq("id", member.team_id)
            .eq("tournament_id", tournamentId)
            .maybeSingle();

        if (teamError) {
            console.error("MY TEAM FETCH ERROR:", teamError);
            return res.status(500).json({
                success: false,
                error: teamError.message
            });
        }

        if (!team) {
            return res.status(200).json({
                success: true,
                hasTeam: false,
                team: null
            });
        }

        const { count, error: countError } = await supabase
            .from("tournament_team_members")
            .select("id", { count: "exact", head: true })
            .eq("team_id", team.id)
            .eq("tournament_id", tournamentId);

        if (countError) {
            console.error("MY TEAM COUNT ERROR:", countError);
        }

        const teamCode = String(team.team_code || "").trim();

        if (!/^\d{6}$/.test(teamCode)) {
            return res.status(500).json({
                success: false,
                code: "INVALID_TEAM_CODE",
                error: "Stored team code is not a valid 6-digit numeric code."
            });
        }

        return res.status(200).json({
            success: true,
            hasTeam: true,
            team: {
                id: team.id,
                tournamentId: team.tournament_id,
                teamCode,
                teamName: team.team_name || "My Team",
                teamType: team.team_type || "DUO",
                maxMembers: Number(team.max_members || 0),
                memberCount: Number(count || 0),
                status: team.status || "open",
                leader: !!member.is_leader
            }
        });
    } catch (error) {
        console.error("MY TEAM EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Unable to load your team."
        });
    }
});

// ============================================================
// GET TEAM
// GET /api/tournaments/team?teamCode=GZXXXXXXXX
// ============================================================

router.get("/team", async (req, res) => {
    try {
        const teamCode = String(req.query.teamCode || "")
            .trim()
            .toUpperCase();

        if (!teamCode) {
            return res.status(400).json({
                success: false,
                code: "INVALID_TEAM_CODE",
                error: "Team code is required."
            });
        }

        const {
            data: team,
            error: teamError
        } = await supabase
            .from("tournament_teams")
            .select(`
                id,
                tournament_id,
                team_code,
                team_name,
                leader_user_id,
                team_type,
                max_members,
                status,
                created_at
            `)
            .eq("team_code", teamCode)
            .maybeSingle();

        if (teamError) {
            return res.status(500).json({
                success: false,
                error: teamError.message
            });
        }

        if (!team) {
            return res.status(404).json({
                success: false,
                code: "TEAM_NOT_FOUND",
                error: "Invalid team code."
            });
        }

        const {
            data: members,
            error: membersError
        } = await supabase
            .from("tournament_team_members")
            .select(`
                id,
                user_id,
                game_name,
                free_fire_uid,
                level,
                is_leader,
                entry_id,
                created_at
            `)
            .eq("team_id", team.id)
            .order("created_at", { ascending: true });

        if (membersError) {
            return res.status(500).json({
                success: false,
                error: membersError.message
            });
        }

        return res.status(200).json({
            success: true,
            team: {
                ...team,
                memberCount: (members || []).length,
                members: members || []
            }
        });

    } catch (error) {
        console.error("GET TEAM ERROR:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error"
        });
    }
});

// ============================================================
// JOIN TEAM
// POST /api/tournaments/team/join
// Joining an existing team costs ₹0.
// ============================================================

router.post("/team/join", async (req, res) => {
    let createdEntryId = null;
    let createdMemberId = null;

    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                code: "AUTH_REQUIRED",
                error: "User session not found. Please login again."
            });
        }

        const { teamCode, gameName, uid, level } = req.body || {};

        const cleanTeamCode = String(teamCode || "")
            .trim()
            .toUpperCase();
        const cleanGameName = String(gameName || "").trim();
        const cleanUid = String(uid || "").trim();
        const cleanLevel = Number(level);

        if (!cleanTeamCode) {
            return res.status(400).json({
                success: false,
                code: "INVALID_TEAM_CODE",
                error: "Team code is required."
            });
        }

        if (!/^\d{6}$/.test(cleanTeamCode)) {
            return res.status(400).json({
                success: false,
                code: "INVALID_TEAM_CODE",
                error: "Team code must be exactly 6 digits."
            });
        }

        if (!cleanGameName) {
            return res.status(400).json({
                success: false,
                code: "INVALID_GAME_NAME",
                error: "In-Game Name is required."
            });
        }

        if (!cleanUid) {
            return res.status(400).json({
                success: false,
                code: "INVALID_UID",
                error: "Free Fire UID is required."
            });
        }

        if (!Number.isInteger(cleanLevel) || cleanLevel < 1 || cleanLevel > 100) {
            return res.status(400).json({
                success: false,
                code: "INVALID_LEVEL",
                error: "Level must be between 1 and 100."
            });
        }

        const {
            data: team,
            error: teamError
        } = await supabase
            .from("tournament_teams")
            .select(`
                id,
                tournament_id,
                team_code,
                leader_user_id,
                team_type,
                max_members,
                status
            `)
            .eq("team_code", cleanTeamCode)
            .maybeSingle();

        if (teamError) {
            return res.status(500).json({
                success: false,
                error: teamError.message
            });
        }

        if (!team) {
            return res.status(404).json({
                success: false,
                code: "TEAM_NOT_FOUND",
                error: "Invalid team code."
            });
        }

        if (team.status !== "open") {
            return res.status(400).json({
                success: false,
                code: "TEAM_CLOSED",
                error: "This team is not accepting members."
            });
        }

        const {
            data: tournament,
            error: tournamentError
        } = await supabase
            .from("tournaments")
            .select(`
                id,
                title,
                game,
                mode,
                entry_fee,
                max_players,
                status
            `)
            .eq("id", team.tournament_id)
            .maybeSingle();

        if (tournamentError) {
            return res.status(500).json({
                success: false,
                error: tournamentError.message
            });
        }

        if (!tournament) {
            return res.status(404).json({
                success: false,
                code: "TOURNAMENT_NOT_FOUND",
                error: "Tournament not found."
            });
        }

        const teamConfig = getTeamConfig(tournament.mode);

        if (!teamConfig) {
            return res.status(400).json({
                success: false,
                code: "TEAM_MODE_REQUIRED",
                error: "This tournament does not support teams."
            });
        }

        if (String(team.team_type).toUpperCase() !== teamConfig.type) {
            return res.status(400).json({
                success: false,
                code: "TEAM_TYPE_MISMATCH",
                error: "This team type does not match the tournament."
            });
        }

        const ruleCheck = await checkTeamJoinRules(userId, tournament);

        if (ruleCheck.blocked) {
            if (ruleCheck.response) {
                return restrictionResponse(
                    res,
                    ruleCheck.response.feature,
                    ruleCheck.response.restriction
                );
            }

            return res.status(403).json({
                success: false,
                code: "DAILY_GAME_LIMIT_REACHED",
                feature: gameRestrictionKey(tournament.game),
                daily_limit: ruleCheck.dailyLimit,
                joined_today: ruleCheck.joinedToday,
                error: ruleCheck.error
            });
        }

        const status = String(tournament.status || "").trim().toLowerCase();
        const allowedStatuses = [
            "",
            "upcoming",
            "open",
            "active",
            "live",
            "scheduled"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                code: "TOURNAMENT_CLOSED",
                error: "This tournament is closed."
            });
        }

        const {
            data: existingEntry,
            error: existingEntryError
        } = await supabase
            .from("tournament_entries")
            .select("id")
            .eq("tournament_id", team.tournament_id)
            .eq("user_id", userId)
            .eq("cancelled", false)
            .maybeSingle();

        if (existingEntryError) {
            return res.status(500).json({
                success: false,
                error: existingEntryError.message
            });
        }

        if (existingEntry) {
            return res.status(409).json({
                success: false,
                code: "ALREADY_JOINED",
                error: "You are already in this tournament."
            });
        }

        if (tournament.max_players && Number(tournament.max_players) > 0) {
            const {
                count,
                error: countError
            } = await supabase
                .from("tournament_entries")
                .select("id", { count: "exact", head: true })
                .eq("tournament_id", team.tournament_id)
                .eq("cancelled", false);

            if (countError) {
                return res.status(500).json({
                    success: false,
                    error: countError.message
                });
            }

            if ((count || 0) >= Number(tournament.max_players)) {
                return res.status(400).json({
                    success: false,
                    code: "TOURNAMENT_FULL",
                    error: "Tournament is full."
                });
            }
        }

        const {
            data: members,
            error: membersError
        } = await supabase
            .from("tournament_team_members")
            .select("id")
            .eq("team_id", team.id);

        if (membersError) {
            return res.status(500).json({
                success: false,
                error: membersError.message
            });
        }

        const memberCount = (members || []).length;

        if (memberCount >= Number(team.max_members)) {
            await supabase
                .from("tournament_teams")
                .update({ status: "full" })
                .eq("id", team.id);

            return res.status(400).json({
                success: false,
                code: "TEAM_FULL",
                error: "This team is already full."
            });
        }

        const {
            data: entry,
            error: entryError
        } = await supabase
            .from("tournament_entries")
            .insert({
                tournament_id: team.tournament_id,
                user_id: userId,
                free_fire_uid: cleanUid,
                game_name: cleanGameName,
                level: cleanLevel,
                cancelled: false
            })
            .select(`
                id,
                tournament_id,
                user_id,
                free_fire_uid,
                game_name,
                level,
                cancelled,
                created_at
            `)
            .single();

        if (entryError) {
            return res.status(500).json({
                success: false,
                code: "ENTRY_CREATE_FAILED",
                error: entryError.message
            });
        }

        createdEntryId = entry.id;

        const {
            data: member,
            error: memberInsertError
        } = await supabase
            .from("tournament_team_members")
            .insert({
                team_id: team.id,
                tournament_id: team.tournament_id,
                user_id: userId,
                game_name: cleanGameName,
                free_fire_uid: cleanUid,
                level: cleanLevel,
                is_leader: false,
                entry_id: entry.id
            })
            .select("id")
            .single();

        if (memberInsertError) {
            await supabase
                .from("tournament_entries")
                .delete()
                .eq("id", entry.id);

            return res.status(500).json({
                success: false,
                code: "TEAM_MEMBER_CREATE_FAILED",
                error: memberInsertError.message
            });
        }

        createdMemberId = member.id;

        const newMemberCount = memberCount + 1;

        if (newMemberCount >= Number(team.max_members)) {
            await supabase
                .from("tournament_teams")
                .update({ status: "full" })
                .eq("id", team.id);
        }

        return res.status(201).json({
            success: true,
            code: "TEAM_JOINED",
            message: "You joined the team successfully.",
            team: {
                id: team.id,
                teamCode: team.team_code,
                teamName: team.team_name,
                teamType: team.team_type,
                maxMembers: team.max_members,
                memberCount: newMemberCount
            },
            entryId: entry.id,
            entryFee: 0
        });

    } catch (error) {
        console.error("TEAM JOIN EXCEPTION:", error);

        try {
            if (createdMemberId) {
                await supabase
                    .from("tournament_team_members")
                    .delete()
                    .eq("id", createdMemberId);
            }

            if (createdEntryId) {
                await supabase
                    .from("tournament_entries")
                    .delete()
                    .eq("id", createdEntryId);
            }
        } catch (rollbackError) {
            console.error("TEAM JOIN ROLLBACK ERROR:", rollbackError);
        }

        return res.status(500).json({
            success: false,
            code: "TEAM_JOIN_FAILED",
            error: error?.message || "Unable to join team."
        });
    }
});



// GET SINGLE TOURNAMENT



//



// VERY IMPORTANT:



// THIS MUST REMAIN AFTER /join



// THIS MUST REMAIN AFTER /participants



// THIS MUST REMAIN AFTER /my-entry



//



// ============================================================
// GET BANNERS
// GET /api/tournaments/banners?gameType=home
// IMPORTANT: This route MUST come before /:id because "banners"
// would otherwise be treated as a tournament UUID.
// ============================================================

router.get(
    "/banners",
    async (req, res) => {
        try {
            const gameType = String(
                req.query.gameType || "home"
            )
                .trim()
                .toLowerCase();

            const {
                data,
                error
            } = await supabase
                .from("banners")
                .select(`
                    id,
                    image_url,
                    click_url,
                    title,
                    is_active,
                    sort_order,
                    created_at,
                    game_type
                `)
                .eq("is_active", true)
                .eq("game_type", gameType)
                .order("sort_order", {
                    ascending: true
                })
                .order("created_at", {
                    ascending: false
                });

            if (error) {
                console.error(
                    "GET BANNERS ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            return res.status(200).json({
                success: true,
                banners: data || []
            });
        } catch (error) {
            console.error(
                "GET BANNERS EXCEPTION:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error?.message ||
                    "Internal server error"
            });
        }
    }
);

// GET /api/tournaments/:id



// ============================================================







router.get(



    "/:id",



    async (req, res) => {







        try {







            const id =



                String(



                    req.params.id || ""



                ).trim();







            if (!id) {







                return res.status(400).json({



                    success: false,



                    error:



                        "Tournament ID is required."



                });



            }







            const {



                data: tournament,



                error



            } =



                await supabase



                    .from(



                        "tournaments"



                    )



                    .select(`



                        id,



                        title,



                        game,



                        mode,



                        entry_fee,



                        prize_pool,



                        kill_reward,



                        max_players,



                        start_time,



                        map,



                        status,



                        rules,



                        bonus_usable_percent



                    `)



                    .eq(



                        "id",



                        id



                    )



                    .maybeSingle();







            if (error) {







                console.error(



                    "GET TOURNAMENT ERROR:",



                    error



                );







                return res.status(500).json({



                    success: false,



                    error:



                        error.message



                });



            }







            if (!tournament) {







                return res.status(404).json({



                    success: false,



                    code:



                        "TOURNAMENT_NOT_FOUND",



                    error:



                        "Tournament not found."



                });



            }







            const {



                count,



                error: countError



            } =



                await supabase



                    .from(



                        "tournament_entries"



                    )



                    .select(



                        "id",



                        {



                            count: "exact",



                            head: true



                        }



                    )



                    .eq(



                        "tournament_id",



                        id



                    )



                    .eq(



                        "cancelled",



                        false



                    );







            if (countError) {







                console.error(



                    "SINGLE TOURNAMENT COUNT ERROR:",



                    countError



                );



            }







            const {



                data: prizes,



                error: prizeError



            } = await supabase



                .from("tournament_prizes")



                .select("rank,label,amount")



                .eq("tournament_id", id)



                .order("rank", { ascending: true });







            if (prizeError) {



                console.error(



                    "PRIZE FETCH ERROR:",



                    prizeError



                );



            }







            return res.status(200).json({







                success: true,







                tournament: {



                    ...tournament,







                    joined_count:



                        count || 0,







                    prizes:



                        prizes || []



                }



            });







        } catch (error) {







            console.error(



                "GET SINGLE TOURNAMENT EXCEPTION:",



                error



            );







            return res.status(500).json({



                success: false,



                error:



                    error?.message ||



                    "Internal server error"



            });



        }



    }



);







// ============================================================



// EXPORT



// ============================================================









module.exports = router;