const express = require("express");







const router = express.Router();







const supabase = require("../config/supabase");







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