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


// ============================================================
// TOURNAMENT ID RESOLVER
// ============================================================
// DB tournament IDs are UUIDs. Android may send the visible
// tournament code/title such as #CS_1 or #FF_1.
// This helper accepts either form and returns the real UUID.
// ============================================================

const TOURNAMENT_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveTournamentId(rawTournamentId) {
    const value = String(rawTournamentId || "").trim();

    if (!value) {
        return { id: "", error: null, notFound: false };
    }

    if (TOURNAMENT_UUID_RE.test(value)) {
        return { id: value, error: null, notFound: false };
    }

    // Exact title match first.
    let result = await supabase
        .from("tournaments")
        .select("id,title")
        .ilike("title", value)
        .limit(1)
        .maybeSingle();

    if (result.error) {
        return {
            id: "",
            error: result.error,
            notFound: false
        };
    }

    // Then allow a visible code prefix:
    // "#CS_1" -> "#CS_1 - Tournament Name"
    if (!result.data) {
        result = await supabase
            .from("tournaments")
            .select("id,title")
            .ilike("title", `${value}%`)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (result.error) {
            return {
                id: "",
                error: result.error,
                notFound: false
            };
        }
    }

    if (!result.data?.id) {
        return {
            id: "",
            error: null,
            notFound: true
        };
    }

    return {
        id: String(result.data.id).trim(),
        title: String(result.data.title || "").trim(),
        error: null,
        notFound: false
    };
}





function cleanNumber(value, fallback = 0) {

    const number = Number(value);



    return Number.isFinite(number)

        ? number

        : fallback;

}



// ============================================================

// GET ACTIVE BANNERS

// GET /api/tournaments/banners?gameType=freefire

// Public app endpoint. Admin controls these rows from the banners table.

// ============================================================



router.get("/banners", async (req, res) => {

    try {

        const gameType = String(req.query.gameType || "home").trim().toLowerCase();



        const { data, error } = await supabase

            .from("banners")

            .select("id,image_url,click_url,title,is_active,sort_order,created_at,game_type")

            .eq("is_active", true)

            .eq("game_type", gameType)

            .order("sort_order", { ascending: true })

            .order("created_at", { ascending: false });



        if (error) {

            console.error("BANNERS ERROR:", error);

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

        console.error("BANNERS EXCEPTION:", error);

        return res.status(500).json({

            success: false,

            error: error?.message || "Internal server error"

        });

    }

});



// ============================================================

// GET ALL TOURNAMENTS

// GET /api/tournaments

// ============================================================



router.get("/", async (req, res) => {
    const requestStartedAt = Date.now();

    try {
        const game = String(req.query.game || "").trim();

        console.log(
            `[TOURNAMENTS] Request started${game ? ` | game=${game}` : ""}`
        );

        // --------------------------------------------------------
        // MAIN TOURNAMENT QUERY
        // --------------------------------------------------------

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
            .order("start_time", {
                ascending: true
            });

        if (game) {
            query = query.eq("game", game);
        }

        const {
            data: tournaments,
            error
        } = await query;

        if (error) {
            console.error(
                "[TOURNAMENTS] Main query error:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        const list = tournaments || [];

        console.log(
            `[TOURNAMENTS] Main query returned ${list.length} tournaments`
        );

        // --------------------------------------------------------
        // JOINED COUNT
        // Run all entry-count requests in parallel instead of
        // waiting for every tournament one by one.
        // --------------------------------------------------------

        const result = await Promise.all(
            list.map(async (tournament) => {
                try {
                    const {
                        count,
                        error: countError
                    } = await supabase
                        .from("tournament_entries")
                        .select("id", {
                            count: "exact",
                            head: true
                        })
                        .eq(
                            "tournament_id",
                            tournament.id
                        )
                        .eq(
                            "cancelled",
                            false
                        );

                    if (countError) {
                        console.error(
                            `[TOURNAMENTS] Count error | tournament=${tournament.id}`,
                            countError
                        );

                        return {
                            ...tournament,
                            joined_count: 0
                        };
                    }

                    return {
                        ...tournament,
                        joined_count: count || 0
                    };

                } catch (countException) {
                    console.error(
                        `[TOURNAMENTS] Count exception | tournament=${tournament.id}`,
                        countException
                    );

                    return {
                        ...tournament,
                        joined_count: 0
                    };
                }
            })
        );

        const elapsed =
            Date.now() - requestStartedAt;

        console.log(
            `[TOURNAMENTS] Completed | game=${game || "ALL"} | count=${result.length} | time=${elapsed}ms`
        );

        return res.status(200).json({
            success: true,
            tournaments: result
        });

    } catch (error) {
        const elapsed =
            Date.now() - requestStartedAt;

        console.error(
            `[TOURNAMENTS] Exception | time=${elapsed}ms`,
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



router.get("/participants", async (req, res) => {
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

        // --------------------------------------------------------
        // 1. GET TOURNAMENT ENTRIES
        // --------------------------------------------------------

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
            .order("created_at", {
                ascending: true
            });

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

        // --------------------------------------------------------
        // 2. GET UNIQUE USER IDS
        // --------------------------------------------------------

        const userIds = [
            ...new Set(
                safeEntries
                    .map((entry) =>
                        String(entry.user_id || "").trim()
                    )
                    .filter(Boolean)
            )
        ];

        // --------------------------------------------------------
        // 3. GET USER PROFILE DATA
        // --------------------------------------------------------

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

        // --------------------------------------------------------
        // 4. MAP USERS BY USER ID
        // --------------------------------------------------------

        const userMap = new Map(
            users.map((user) => [
                String(user.id),
                user
            ])
        );

        // --------------------------------------------------------
        // 5. MERGE ENTRY + PROFILE
        // --------------------------------------------------------

        const participants = safeEntries.map(
            (entry, index) => {
                const user = userMap.get(
                    String(entry.user_id || "")
                );

                return {
                    id: entry.id,
                    entry_id: entry.id,

                    tournament_id:
                        entry.tournament_id,

                    user_id:
                        entry.user_id,

                    // PROFILE
                    real_name:
                        String(
                            user?.full_name || ""
                        ).trim(),

                    bio:
                        String(
                            user?.bio || ""
                        ).trim(),

                    profile_pic:
                        String(
                            user?.avatar_url || ""
                        ).trim(),

                    // GAME DETAILS
                    player_name:
                        String(
                            entry.game_name || ""
                        ).trim(),

                    uid:
                        String(
                            entry.free_fire_uid || ""
                        ).trim(),

                    free_fire_uid:
                        String(
                            entry.free_fire_uid || ""
                        ).trim(),

                    level:
                        Number(entry.level || 0),

                    participant_number:
                        index + 1,

                    cancelled:
                        Boolean(entry.cancelled),

                    created_at:
                        entry.created_at
                };
            }
        );

        // --------------------------------------------------------
        // 6. RESPONSE
        // --------------------------------------------------------

        return res.status(200).json({
            success: true,
            players_joined: participants.length,
            max_players: null,
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
});


// ============================================================

// GET MY ENTRY

// GET /api/tournaments/my-entry?tournamentId=UUID

// ============================================================



router.get(

    "/my-entry",

    async (req, res) => {



        try {



            const userId =

                getUserId(req);



            let tournamentId = String(

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

            // Accept both DB UUID and visible tournament code/title.
            const resolvedTournament =
                await resolveTournamentId(tournamentId);

            if (resolvedTournament.error) {
                console.error(
                    "MY ENTRY TOURNAMENT RESOLVE ERROR:",
                    resolvedTournament.error
                );

                return res.status(500).json({
                    success: false,
                    code: "TOURNAMENT_RESOLVE_FAILED",
                    error: resolvedTournament.error.message
                });
            }

            if (resolvedTournament.notFound) {
                return res.status(404).json({
                    success: false,
                    code: "TOURNAMENT_NOT_FOUND",
                    error: "Tournament not found."
                });
            }

            tournamentId = resolvedTournament.id;





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

            // Resolve visible code/title to the real DB UUID.
            const resolvedJoinTournament =
                await resolveTournamentId(cleanTournamentId);

            if (resolvedJoinTournament.error) {
                console.error(
                    "JOIN TOURNAMENT RESOLVE ERROR:",
                    resolvedJoinTournament.error
                );

                return res.status(500).json({
                    success: false,
                    code: "TOURNAMENT_RESOLVE_FAILED",
                    error: resolvedJoinTournament.error.message
                });
            }

            if (resolvedJoinTournament.notFound) {
                return res.status(404).json({
                    success: false,
                    code: "TOURNAMENT_NOT_FOUND",
                    error: "Tournament not found."
                });
            }

            const dbTournamentId =
                resolvedJoinTournament.id;





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

                    .eq("id", dbTournamentId)

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

                        .eq("tournament_id", dbTournamentId)

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

                    .eq("tournament_id", dbTournamentId)

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

                        tournament_id: dbTournamentId,



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
            // =================================================
            // CREATE WALLET TRANSACTION HISTORY
            // =================================================

            // Create one wallet transaction for each balance source
            // used for the tournament entry fee.
            const walletTransactions = [];

            if (bonusDeduction > 0) {
                walletTransactions.push({
                    user_id: userId,
                    amount: Number((-bonusDeduction).toFixed(2)),
                    type: "ENTRY_FEE",
                    description:
                        `Tournament entry fee (bonus) - ${cleanTournamentId}`,
                    reference_id: entry?.id || cleanTournamentId
                });
            }

            if (depositDeduction > 0) {
                walletTransactions.push({
                    user_id: userId,
                    amount: Number((-depositDeduction).toFixed(2)),
                    type: "ENTRY_FEE",
                    description:
                        `Tournament entry fee (deposit) - ${cleanTournamentId}`,
                    reference_id: entry?.id || cleanTournamentId
                });
            }

            if (winningDeduction > 0) {
                walletTransactions.push({
                    user_id: userId,
                    amount: Number((-winningDeduction).toFixed(2)),
                    type: "ENTRY_FEE",
                    description:
                        `Tournament entry fee (winning) - ${cleanTournamentId}`,
                    reference_id: entry?.id || cleanTournamentId
                });
            }

            if (walletTransactions.length > 0) {
                const { error: transactionError } = await supabase
                    .from("wallet_transactions")
                    .insert(walletTransactions);

                if (transactionError) {
                    console.error(
                        "WALLET TRANSACTION INSERT ERROR:",
                        transactionError
                    );

                    // Roll back tournament entry.
                    if (entry?.id) {
                        const { error: deleteEntryError } = await supabase
                            .from("tournament_entries")
                            .delete()
                            .eq("id", entry.id);

                        if (deleteEntryError) {
                            console.error(
                                "ENTRY ROLLBACK ERROR:",
                                deleteEntryError
                            );
                        }
                    }

                    // Roll back wallet balances.
                    if (walletUpdated) {
                        const { error: rollbackError } = await supabase
                            .from("wallet_balances")
                            .update({
                                deposit_balance: originalDeposit,
                                bonus_balance: originalBonus,
                                winning_balance: originalWinning,
                                updated_at: new Date().toISOString()
                            })
                            .eq("user_id", userId);

                        if (rollbackError) {
                            console.error(
                                "WALLET TRANSACTION ROLLBACK ERROR:",
                                rollbackError
                            );
                        }
                    }

                    return res.status(500).json({
                        success: false,
                        code: "TRANSACTION_CREATE_FAILED",
                        error:
                            transactionError.message ||
                            "Unable to create wallet transaction."
                    });
                }
            }



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



                
                databaseTournamentId: dbTournamentId,
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
// GET MY MATCH / ROOM KEYS
// GET /api/tournaments/my-match?tournamentId=UUID
// ============================================================

router.get(
    "/my-match",
    async (req, res) => {
        try {
            const userId = getUserId(req);

            let tournamentId = String(
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
                    code: "INVALID_TOURNAMENT",
                    error: "Tournament ID is required."
                });
            }

            const resolvedTournament =
                await resolveTournamentId(tournamentId);

            if (resolvedTournament.error) {
                console.error(
                    "MY MATCH TOURNAMENT RESOLVE ERROR:",
                    resolvedTournament.error
                );

                return res.status(500).json({
                    success: false,
                    code: "TOURNAMENT_RESOLVE_FAILED",
                    error: resolvedTournament.error.message
                });
            }

            if (resolvedTournament.notFound) {
                return res.status(404).json({
                    success: false,
                    code: "TOURNAMENT_NOT_FOUND",
                    error: "Tournament not found."
                });
            }

            tournamentId = resolvedTournament.id;

            const {
                data: entry,
                error: entryError
            } = await supabase
                .from("tournament_entries")
                .select("id,tournament_id,user_id,cancelled")
                .eq("tournament_id", tournamentId)
                .eq("user_id", userId)
                .eq("cancelled", false)
                .maybeSingle();

            if (entryError) {
                console.error(
                    "MY MATCH ENTRY ERROR:",
                    entryError
                );

                return res.status(500).json({
                    success: false,
                    code: "ENTRY_CHECK_FAILED",
                    error: entryError.message
                });
            }

            if (!entry) {
                return res.status(404).json({
                    success: false,
                    code: "NOT_JOINED",
                    error: "You have not joined this tournament.",
                    match: null,
                    room_id: null,
                    room_password: null,
                    tournament_id: tournamentId
                });
            }

            const {
                data: match,
                error: matchError
            } = await supabase
                .from("matches")
                .select("id,tournament_id,room_id,room_password")
                .eq("tournament_id", tournamentId)
                .limit(1)
                .maybeSingle();

            if (matchError) {
                console.error(
                    "MY MATCH QUERY ERROR:",
                    matchError
                );

                return res.status(500).json({
                    success: false,
                    code: "MATCH_QUERY_FAILED",
                    error: matchError.message
                });
            }

            return res.status(200).json({
                success: true,
                tournament_id: tournamentId,
                entry_id: entry.id,
                match: match || null,
                room_id: match?.room_id || null,
                room_password: match?.room_password || null
            });
        } catch (error) {
            console.error(
                "MY MATCH EXCEPTION:",
                error
            );

            return res.status(500).json({
                success: false,
                code: "SERVER_ERROR",
                error:
                    error?.message ||
                    "Internal server error"
            });
        }
    }
);



// GET SINGLE TOURNAMENT

//

// VERY IMPORTANT:

// THIS MUST REMAIN AFTER /join

// THIS MUST REMAIN AFTER /participants

// THIS MUST REMAIN AFTER /my-entry

//

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



            return res.status(200).json({



                success: true,



                tournament: {

                    ...tournament,



                    joined_count:

                        count || 0

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