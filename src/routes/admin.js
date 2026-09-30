const express = require("express");
const crypto = require("crypto");

const supabase = require("../config/supabase");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const SESSION_COOKIE_NAME =
    "gamerzadda_admin_session";

const SESSION_SECRET =
    process.env.ADMIN_SESSION_SECRET;

const SESSION_MAX_AGE =
    24 * 60 * 60; // 24 hours

if (!SESSION_SECRET) {
    console.warn(
        "WARNING: ADMIN_SESSION_SECRET is not configured in .env"
    );
}

/*
|--------------------------------------------------------------------------
| SESSION TOKEN
|--------------------------------------------------------------------------
*/

function createSessionToken(user) {
    if (!SESSION_SECRET) {
        throw new Error(
            "ADMIN_SESSION_SECRET is missing."
        );
    }

    const now = Date.now();

    const payload = {
        userId: user.id,
        email: user.email,
        role: "admin",
        createdAt: now,
        expiresAt:
            now +
            SESSION_MAX_AGE * 1000
    };

    const encodedPayload =
        Buffer.from(
            JSON.stringify(payload)
        ).toString("base64url");

    const signature =
        crypto
            .createHmac(
                "sha256",
                SESSION_SECRET
            )
            .update(encodedPayload)
            .digest("base64url");

    return (
        encodedPayload +
        "." +
        signature
    );
}

/*
|--------------------------------------------------------------------------
| VERIFY SESSION
|--------------------------------------------------------------------------
*/

function verifySessionToken(token) {
    try {
        if (!token || !SESSION_SECRET) {
            return null;
        }

        const parts =
            token.split(".");

        if (parts.length !== 2) {
            return null;
        }

        const encodedPayload =
            parts[0];

        const receivedSignature =
            parts[1];

        const expectedSignature =
            crypto
                .createHmac(
                    "sha256",
                    SESSION_SECRET
                )
                .update(encodedPayload)
                .digest("base64url");

        const receivedBuffer =
            Buffer.from(
                receivedSignature
            );

        const expectedBuffer =
            Buffer.from(
                expectedSignature
            );

        if (
            receivedBuffer.length !==
            expectedBuffer.length
        ) {
            return null;
        }

        if (
            !crypto.timingSafeEqual(
                receivedBuffer,
                expectedBuffer
            )
        ) {
            return null;
        }

        const payload =
            JSON.parse(
                Buffer.from(
                    encodedPayload,
                    "base64url"
                ).toString("utf8")
            );

        if (!payload.userId) {
            return null;
        }

        if (
            payload.role !== "admin"
        ) {
            return null;
        }

        if (
            !payload.expiresAt ||
            payload.expiresAt <
                Date.now()
        ) {
            return null;
        }

        return payload;

    } catch (error) {
        console.error(
            "SESSION VERIFY ERROR:",
            error
        );

        return null;
    }
}

/*
|--------------------------------------------------------------------------
| COOKIE HELPER
|--------------------------------------------------------------------------
*/

function getCookie(req, name) {
    const cookieHeader =
        req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies =
        cookieHeader
            .split(";")
            .map(
                (cookie) =>
                    cookie.trim()
            );

    for (const cookie of cookies) {
        const separatorIndex =
            cookie.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const key =
            cookie.substring(
                0,
                separatorIndex
            );

        const value =
            cookie.substring(
                separatorIndex + 1
            );

        if (key === name) {
            return decodeURIComponent(
                value
            );
        }
    }

    return null;
}

/*
|--------------------------------------------------------------------------
| SET COOKIE
|--------------------------------------------------------------------------
*/

function setAdminCookie(
    res,
    token
) {
    const isProduction =
        process.env.NODE_ENV ===
        "production";

    const cookieParts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(
            token
        )}`,
        "Domain=.gamerzadda.in",
        "Path=/",
        `Max-Age=${SESSION_MAX_AGE}`,
        "HttpOnly",
        "SameSite=Lax"
    ];

    if (isProduction) {
        cookieParts.push(
            "Secure"
        );
    }

    res.setHeader(
        "Set-Cookie",
        cookieParts.join("; ")
    );
}

/*
|--------------------------------------------------------------------------
| CLEAR COOKIE
|--------------------------------------------------------------------------
*/

function clearAdminCookie(res) {
    res.setHeader(
        "Set-Cookie",
        [
            `${SESSION_COOKIE_NAME}=`,
            "Domain=.gamerzadda.in",
            "Path=/",
            "Max-Age=0",
            "HttpOnly",
            "SameSite=Lax"
        ].join("; ")
    );
}

/*
|--------------------------------------------------------------------------
| VERIFY ADMIN
|--------------------------------------------------------------------------
*/

async function verifyAdmin(req) {
    const token =
        getCookie(
            req,
            SESSION_COOKIE_NAME
        );

    const session =
        verifySessionToken(token);

    if (!session) {
        return {
            authenticated: false,
            session: null,
            user: null
        };
    }

    const {
        data: user,
        error
    } = await supabase
        .from("users")
        .select(
            "id, email, full_name, role, status"
        )
        .eq(
            "id",
            session.userId
        )
        .maybeSingle();

    if (error) {
        console.error(
            "VERIFY ADMIN DB ERROR:",
            error
        );

        return {
            authenticated: false,
            session: null,
            user: null
        };
    }

    if (!user) {
        return {
            authenticated: false,
            session: null,
            user: null
        };
    }

    const role =
        String(
            user.role || ""
        )
            .trim()
            .toLowerCase();

    const status =
        String(
            user.status ||
                "active"
        )
            .trim()
            .toLowerCase();

    if (role !== "admin") {
        return {
            authenticated: false,
            session: null,
            user: null
        };
    }

    if (status !== "active") {
        return {
            authenticated: false,
            session: null,
            user: null
        };
    }

    return {
        authenticated: true,
        session,
        user
    };
}

/*
|--------------------------------------------------------------------------
| POST /api/admin/login
|--------------------------------------------------------------------------
*/

router.post(
    "/login",
    async (req, res) => {
        try {
            const email =
                String(
                    req.body?.email || ""
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body?.password || ""
                );

            if (!email) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Admin email is required."
                    });
            }

            if (!password) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Admin password is required."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | SUPABASE AUTH
            |--------------------------------------------------------------------------
            */

            const {
                data: authData,
                error: authError
            } =
                await supabase.auth.signInWithPassword(
                    {
                        email,
                        password
                    }
                );

            if (
                authError ||
                !authData?.user
            ) {
                console.error(
                    "ADMIN SUPABASE AUTH ERROR:",
                    authError
                );

                return res
                    .status(401)
                    .json({
                        success: false,
                        error:
                            "Invalid admin email or password."
                    });
            }

            const authUser =
                authData.user;

            /*
            |--------------------------------------------------------------------------
            | USERS TABLE
            |--------------------------------------------------------------------------
            */

            const {
                data: dbUser,
                error: dbError
            } =
                await supabase
                    .from("users")
                    .select(
                        "id, email, full_name, role, status"
                    )
                    .eq(
                        "id",
                        authUser.id
                    )
                    .maybeSingle();

            if (dbError) {
                console.error(
                    "ADMIN USER LOOKUP ERROR:",
                    dbError
                );

                await supabase.auth.signOut();

                return res
                    .status(500)
                    .json({
                        success: false,
                        error:
                            "Unable to verify admin account."
                    });
            }

            if (!dbUser) {
                await supabase.auth.signOut();

                return res
                    .status(403)
                    .json({
                        success: false,
                        error:
                            "Admin account is not registered in the users table."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | ROLE
            |--------------------------------------------------------------------------
            */

            const userRole =
                String(
                    dbUser.role || ""
                )
                    .trim()
                    .toLowerCase();

            if (
                userRole !== "admin"
            ) {
                await supabase.auth.signOut();

                return res
                    .status(403)
                    .json({
                        success: false,
                        error:
                            "Access denied. Admin account required."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | STATUS
            |--------------------------------------------------------------------------
            */

            const userStatus =
                String(
                    dbUser.status ||
                        "active"
                )
                    .trim()
                    .toLowerCase();

            if (
                userStatus !== "active"
            ) {
                await supabase.auth.signOut();

                return res
                    .status(403)
                    .json({
                        success: false,
                        error:
                            "Admin account is not active."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | CREATE SESSION
            |--------------------------------------------------------------------------
            */

            const sessionToken =
                createSessionToken({
                    id: authUser.id,
                    email:
                        authUser.email ||
                        dbUser.email
                });

            setAdminCookie(
                res,
                sessionToken
            );

            return res
                .status(200)
                .json({
                    success: true,
                    message:
                        "Admin login successful.",
                    admin: {
                        id: dbUser.id,
                        email:
                            dbUser.email ||
                            authUser.email,
                        fullName:
                            dbUser.full_name ||
                            "",
                        role:
                            dbUser.role,
                        status:
                            dbUser.status ||
                            "active"
                    }
                });

        } catch (error) {
            console.error(
                "ADMIN LOGIN ERROR:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    error:
                        "Internal server error."
                });
        }
    }
);

/*
|--------------------------------------------------------------------------
| GET /api/admin/session
|--------------------------------------------------------------------------
*/

router.get(
    "/session",
    async (req, res) => {
        try {
            const result =
                await verifyAdmin(req);

            if (
                !result.authenticated
            ) {
                clearAdminCookie(res);

                return res
                    .status(401)
                    .json({
                        success: false,
                        authenticated: false
                    });
            }

            return res
                .status(200)
                .json({
                    success: true,
                    authenticated: true,
                    admin: {
                        id:
                            result.user.id,
                        email:
                            result.user.email,
                        fullName:
                            result.user.full_name ||
                            "",
                        role:
                            result.user.role,
                        status:
                            result.user.status ||
                            "active"
                    }
                });

        } catch (error) {
            console.error(
                "ADMIN SESSION ERROR:",
                error
            );

            clearAdminCookie(res);

            return res
                .status(401)
                .json({
                    success: false,
                    authenticated: false
                });
        }
    }
);

/*
|--------------------------------------------------------------------------
| POST /api/admin/logout
|--------------------------------------------------------------------------
*/

router.post(
    "/logout",
    async (req, res) => {
        try {
            clearAdminCookie(res);

            return res
                .status(200)
                .json({
                    success: true,
                    message:
                        "Admin logged out successfully."
                });

        } catch (error) {
            console.error(
                "ADMIN LOGOUT ERROR:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    error:
                        "Logout failed."
                });
        }
    }
);

/*
|--------------------------------------------------------------------------
| POST /api/admin/tournaments
| CREATE TOURNAMENT
|--------------------------------------------------------------------------
*/

router.post(
    "/tournaments",
    async (req, res) => {
        try {
            /*
            |--------------------------------------------------------------------------
            | ADMIN AUTH CHECK
            |--------------------------------------------------------------------------
            */

            const admin =
                await verifyAdmin(req);

            if (
                !admin.authenticated
            ) {
                return res
                    .status(401)
                    .json({
                        success: false,
                        code:
                            "ADMIN_AUTH_REQUIRED",
                        error:
                            "Admin login required."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | REQUEST DATA
            |--------------------------------------------------------------------------
            */

            const {
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
            } = req.body || {};

            /*
            |--------------------------------------------------------------------------
            | BASIC VALIDATION
            |--------------------------------------------------------------------------
            */

            const cleanTitle =
                String(
                    title || ""
                ).trim();

            const cleanGame =
                String(
                    game || ""
                ).trim();

            const cleanMode =
                String(
                    mode || ""
                ).trim();

            if (!cleanTitle) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Tournament title is required."
                    });
            }

            if (!cleanGame) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Game type is required."
                    });
            }

            if (!cleanMode) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Mode is required."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | GAME VALIDATION
            |--------------------------------------------------------------------------
            */

            const allowedGames = [
                "Free Fire",
                "Free Fire MAX",
                "Lone Wolf",
                "Clash Squad"
            ];

            if (
                !allowedGames.includes(
                    cleanGame
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Invalid game type."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | MODE VALIDATION
            |--------------------------------------------------------------------------
            */

            const allowedModes = [
                "Solo",
                "Duo",
                "Squad"
            ];

            if (
                !allowedModes.includes(
                    cleanMode
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Invalid tournament mode."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | NUMBERS
            |--------------------------------------------------------------------------
            */

            if (
                entry_fee ===
                    undefined ||
                entry_fee === ""
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Entry fee is required."
                    });
            }

            if (
                prize_pool ===
                    undefined ||
                prize_pool === ""
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Prize pool is required."
                    });
            }

            if (
                max_players ===
                    undefined ||
                max_players === ""
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Maximum players is required."
                    });
            }

            const entryFee =
                Number(entry_fee);

            const prizePool =
                Number(prize_pool);

            const killReward =
                Number(
                    kill_reward || 0
                );

            const maxPlayers =
                Number(max_players);

            const bonusPercent =
                Number(
                    bonus_usable_percent ||
                        0
                );

            if (
                !Number.isFinite(
                    entryFee
                ) ||
                entryFee < 0
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Invalid entry fee."
                    });
            }

            if (
                !Number.isFinite(
                    prizePool
                ) ||
                prizePool < 0
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Invalid prize pool."
                    });
            }

            if (
                !Number.isFinite(
                    killReward
                ) ||
                killReward < 0
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Invalid kill reward."
                    });
            }

            if (
                !Number.isInteger(
                    maxPlayers
                ) ||
                maxPlayers < 1
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Maximum players must be at least 1."
                    });
            }

            if (
                !Number.isFinite(
                    bonusPercent
                ) ||
                bonusPercent < 0 ||
                bonusPercent > 100
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Bonus usable percent must be between 0 and 100."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | START TIME
            |--------------------------------------------------------------------------
            */

            let cleanStartTime =
                null;

            if (start_time) {
                const parsedDate =
                    new Date(
                        start_time
                    );

                if (
                    Number.isNaN(
                        parsedDate.getTime()
                    )
                ) {
                    return res
                        .status(400)
                        .json({
                            success: false,
                            error:
                                "Invalid start time."
                        });
                }

                cleanStartTime =
                    parsedDate.toISOString();
            }

            /*
            |--------------------------------------------------------------------------
            | STATUS
            |--------------------------------------------------------------------------
            */

            const cleanStatus =
                String(
                    status ||
                        "upcoming"
                )
                    .trim()
                    .toLowerCase();

            const allowedStatuses = [
                "upcoming",
                "open",
                "active",
                "live",
                "scheduled",
                "completed",
                "disabled"
            ];

            if (
                !allowedStatuses.includes(
                    cleanStatus
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Invalid tournament status."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | INSERT DATA
            |--------------------------------------------------------------------------
            */

            const tournamentData = {
                title: cleanTitle,
                game: cleanGame,
                mode: cleanMode,
                entry_fee: entryFee,
                prize_pool: prizePool,
                kill_reward: killReward,
                max_players: maxPlayers,
                start_time:
                    cleanStartTime,
                map:
                    String(
                        map || ""
                    ).trim() || null,
                status:
                    cleanStatus,
                rules:
                    String(
                        rules || ""
                    ).trim() || null,
                bonus_usable_percent:
                    bonusPercent
            };

            console.log(
                "CREATING TOURNAMENT:",
                tournamentData
            );

            /*
            |--------------------------------------------------------------------------
            | SUPABASE INSERT
            |--------------------------------------------------------------------------
            */

            const {
                data,
                error
            } = await supabase
                .from("tournaments")
                .insert(
                    tournamentData
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
                .single();

            /*
            |--------------------------------------------------------------------------
            | DATABASE ERROR
            |--------------------------------------------------------------------------
            */

            if (error) {
                console.error(
                    "CREATE TOURNAMENT DB ERROR:",
                    error
                );

                return res
                    .status(500)
                    .json({
                        success: false,
                        code:
                            "TOURNAMENT_CREATE_FAILED",
                        error:
                            error.message ||
                            "Unable to create tournament."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            console.log(
                "TOURNAMENT CREATED:",
                data?.id
            );

            return res
                .status(201)
                .json({
                    success: true,
                    message:
                        "Tournament created successfully.",
                    tournament: data
                });

        } catch (error) {
            console.error(
                "CREATE TOURNAMENT ERROR:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    code:
                        "SERVER_ERROR",
                    error:
                        error?.message ||
                        "Internal server error."
                });
        }
    }
);

/*
|--------------------------------------------------------------------------
| POST /api/admin/keys
| MAKE ROOM ID + PASSWORD LIVE
|--------------------------------------------------------------------------
*/

router.post(
    "/keys",
    async (req, res) => {
        try {
            /*
            |--------------------------------------------------------------------------
            | ADMIN AUTH
            |--------------------------------------------------------------------------
            */

            const admin =
                await verifyAdmin(req);

            if (
                !admin.authenticated
            ) {
                return res
                    .status(401)
                    .json({
                        success: false,
                        code:
                            "ADMIN_AUTH_REQUIRED",
                        error:
                            "Admin login required."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | REQUEST DATA
            |--------------------------------------------------------------------------
            */

            const {
                tournamentId,
                roomId,
                roomPassword
            } = req.body || {};

            const cleanTournamentId =
                String(
                    tournamentId || ""
                ).trim();

            const cleanRoomId =
                String(
                    roomId || ""
                ).trim();

            const cleanRoomPassword =
                String(
                    roomPassword || ""
                ).trim();

            if (!cleanTournamentId) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Tournament ID is required."
                    });
            }

            if (!cleanRoomId) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Room ID is required."
                    });
            }

            if (!cleanRoomPassword) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error:
                            "Room Password is required."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | CHECK TOURNAMENT
            |--------------------------------------------------------------------------
            */

            const {
                data: tournament,
                error: tournamentError
            } = await supabase
                .from("tournaments")
                .select(
                    "id, title, status"
                )
                .eq(
                    "id",
                    cleanTournamentId
                )
                .maybeSingle();

            if (tournamentError) {
                console.error(
                    "KEYS TOURNAMENT LOOKUP ERROR:",
                    tournamentError
                );

                return res
                    .status(500)
                    .json({
                        success: false,
                        error:
                            tournamentError.message ||
                            "Unable to verify tournament."
                    });
            }

            if (!tournament) {
                return res
                    .status(404)
                    .json({
                        success: false,
                        error:
                            "Tournament not found."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | FIND EXISTING MATCH
            |--------------------------------------------------------------------------
            */

            const {
                data: existingMatch,
                error: existingMatchError
            } = await supabase
                .from("matches")
                .select("id")
                .eq(
                    "tournament_id",
                    cleanTournamentId
                )
                .order(
                    "id",
                    {
                        ascending: false
                    }
                )
                .limit(1)
                .maybeSingle();

            if (existingMatchError) {
                console.error(
                    "EXISTING MATCH LOOKUP ERROR:",
                    existingMatchError
                );

                return res
                    .status(500)
                    .json({
                        success: false,
                        error:
                            existingMatchError.message ||
                            "Unable to check existing match."
                    });
            }

            let match;
            let matchError;

            /*
            |--------------------------------------------------------------------------
            | UPDATE EXISTING MATCH
            |--------------------------------------------------------------------------
            */

            if (existingMatch?.id) {
                const result =
                    await supabase
                        .from("matches")
                        .update({
                            room_id:
                                cleanRoomId,
                            room_password:
                                cleanRoomPassword
                        })
                        .eq(
                            "id",
                            existingMatch.id
                        )
                        .select(
                            "id, tournament_id, room_id, room_password"
                        )
                        .single();

                match = result.data;
                matchError =
                    result.error;
            }

            /*
            |--------------------------------------------------------------------------
            | CREATE MATCH
            |--------------------------------------------------------------------------
            */

            else {
                const result =
                    await supabase
                        .from("matches")
                        .insert({
                            tournament_id:
                                cleanTournamentId,
                            room_id:
                                cleanRoomId,
                            room_password:
                                cleanRoomPassword
                        })
                        .select(
                            "id, tournament_id, room_id, room_password"
                        )
                        .single();

                match = result.data;
                matchError =
                    result.error;
            }

            if (matchError) {
                console.error(
                    "SAVE ROOM KEYS ERROR:",
                    matchError
                );

                return res
                    .status(500)
                    .json({
                        success: false,
                        code:
                            "ROOM_KEYS_SAVE_FAILED",
                        error:
                            matchError.message ||
                            "Unable to save room keys."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | MAKE TOURNAMENT LIVE
            |--------------------------------------------------------------------------
            */

            const {
                error:
                    tournamentUpdateError
            } = await supabase
                .from("tournaments")
                .update({
                    status: "live",
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    cleanTournamentId
                );

            if (tournamentUpdateError) {
                console.error(
                    "TOURNAMENT LIVE UPDATE ERROR:",
                    tournamentUpdateError
                );

                return res
                    .status(500)
                    .json({
                        success: false,
                        code:
                            "TOURNAMENT_STATUS_UPDATE_FAILED",
                        error:
                            tournamentUpdateError.message ||
                            "Room keys saved but tournament status could not be updated."
                    });
            }

            /*
            |--------------------------------------------------------------------------
            | SUCCESS
            |--------------------------------------------------------------------------
            */

            console.log(
                "ROOM KEYS LIVE:",
                cleanTournamentId
            );

            return res
                .status(200)
                .json({
                    success: true,
                    message:
                        "Room ID & Password are now live.",
                    tournamentId:
                        cleanTournamentId,
                    roomId:
                        cleanRoomId,
                    roomPassword:
                        cleanRoomPassword,
                    match
                });

        } catch (error) {
            console.error(
                "ADMIN ROOM KEYS ERROR:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    code:
                        "SERVER_ERROR",
                    error:
                        error?.message ||
                        "Internal server error."
                });
        }
    }
);


/*
|--------------------------------------------------------------------------
| GET /api/admin/members
| LOAD MEMBER PROFILE + WALLET
|--------------------------------------------------------------------------
*/

router.get("/members", async (req, res) => {
    try {
        const admin = await verifyAdmin(req);

        if (!admin.authenticated) {
            return res.status(401).json({
                success: false,
                code: "ADMIN_AUTH_REQUIRED",
                error: "Admin login required."
            });
        }

        const userId = String(
            req.query.userId || ""
        ).trim();

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required."
            });
        }

        /*
        |--------------------------------------------------------------------------
        | LOAD USER PROFILE
        |--------------------------------------------------------------------------
        */

        const {
            data: member,
            error: memberError
        } = await supabase
            .from("users")
            .select(`
                id,
                email,
                full_name,
                free_fire_uid,
                game_name,
                level,
                role,
                created_at,
                updated_at,
                phone,
                phone_verified,
                status,
                bio,
                avatar_url,
                ip_address,
                device_id,
                device_user_agent,
                last_login_at,
                profile_pic
            `)
            .eq("id", userId)
            .maybeSingle();

        if (memberError) {
            console.error(
                "ADMIN MEMBER PROFILE ERROR:",
                memberError
            );

            return res.status(500).json({
                success: false,
                error:
                    memberError.message ||
                    "Unable to load member profile."
            });
        }

        if (!member) {
            return res.status(404).json({
                success: false,
                error: "Member not found."
            });
        }

        /*
        |--------------------------------------------------------------------------
        | LOAD WALLET
        |--------------------------------------------------------------------------
        */

        const {
            data: wallet,
            error: walletError
        } = await supabase
            .from("wallet_balances")
            .select(`
                user_id,
                deposit_balance,
                bonus_balance,
                winning_balance,
                created_at
            `)
            .eq("user_id", userId)
            .maybeSingle();

        if (walletError) {
            console.error(
                "ADMIN MEMBER WALLET ERROR:",
                walletError
            );

            return res.status(500).json({
                success: false,
                error:
                    walletError.message ||
                    "Unable to load member wallet."
            });
        }

        const deposit = Number(
            wallet?.deposit_balance || 0
        );

        const bonus = Number(
            wallet?.bonus_balance || 0
        );

        const winning = Number(
            wallet?.winning_balance || 0
        );

        const totalWallet =
            deposit +
            bonus +
            winning;

        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.status(200).json({
            success: true,

            member: {
                ...member
            },

            wallet: {
                user_id: userId,
                deposit_balance: deposit,
                bonus_balance: bonus,
                winning_balance: winning,
                total_balance: totalWallet
            },

            referral: null,

            loginHistory: []
        });

    } catch (error) {
        console.error(
            "ADMIN MEMBER PROFILE EXCEPTION:",
            error
        );

        return res.status(500).json({
            success: false,
            error:
                error?.message ||
                "Internal server error."
        });
    }
});

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| SUPPORT ADMIN APIs
|--------------------------------------------------------------------------
*/

router.get("/support", async (req, res) => {
    try {
        const admin = await verifyAdmin(req);

        if (!admin.authenticated) {
            return res.status(401).json({
                success: false,
                code: "ADMIN_AUTH_REQUIRED",
                error: "Admin login required."
            });
        }

        const { data, error } = await supabase
            .from("support_conversations")
            .select("*")
            .order("updated_at", { ascending: false });

        if (error) {
            console.error("ADMIN SUPPORT LIST ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Unable to load support conversations."
            });
        }

        return res.status(200).json({
            success: true,
            conversations: data || []
        });
    } catch (error) {
        console.error("ADMIN SUPPORT LIST EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error."
        });
    }
});

router.get("/support/:conversationId", async (req, res) => {
    try {
        const admin = await verifyAdmin(req);

        if (!admin.authenticated) {
            return res.status(401).json({
                success: false,
                code: "ADMIN_AUTH_REQUIRED",
                error: "Admin login required."
            });
        }

        const conversationId = String(req.params.conversationId || "").trim();

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                error: "Conversation ID is required."
            });
        }

        const { data: conversation, error: conversationError } =
            await supabase
                .from("support_conversations")
                .select("*")
                .eq("id", conversationId)
                .maybeSingle();

        if (conversationError) {
            console.error("ADMIN SUPPORT CONVERSATION ERROR:", conversationError);
            return res.status(500).json({
                success: false,
                error: conversationError.message || "Unable to load conversation."
            });
        }

        if (!conversation) {
            return res.status(404).json({
                success: false,
                error: "Conversation not found."
            });
        }

        const { data: messages, error: messagesError } = await supabase
            .from("support_messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });

        if (messagesError) {
            console.error("ADMIN SUPPORT MESSAGES ERROR:", messagesError);
            return res.status(500).json({
                success: false,
                error: messagesError.message || "Unable to load support messages."
            });
        }

        return res.status(200).json({
            success: true,
            conversation,
            messages: messages || []
        });
    } catch (error) {
        console.error("ADMIN SUPPORT DETAIL EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error."
        });
    }
});

router.post("/support/:conversationId/message", async (req, res) => {
    try {
        const admin = await verifyAdmin(req);

        if (!admin.authenticated) {
            return res.status(401).json({
                success: false,
                code: "ADMIN_AUTH_REQUIRED",
                error: "Admin login required."
            });
        }

        const conversationId = String(req.params.conversationId || "").trim();
        const message = String(req.body?.message || "").trim();

        if (!conversationId || !message) {
            return res.status(400).json({
                success: false,
                error: !conversationId
                    ? "Conversation ID is required."
                    : "Message is required."
            });
        }

        const { data: conversation, error: conversationError } =
            await supabase
                .from("support_conversations")
                .select("id, status")
                .eq("id", conversationId)
                .maybeSingle();

        if (conversationError) {
            return res.status(500).json({
                success: false,
                error: conversationError.message
            });
        }

        if (!conversation) {
            return res.status(404).json({
                success: false,
                error: "Conversation not found."
            });
        }

        const { data, error } = await supabase
            .from("support_messages")
            .insert({
                conversation_id: conversationId,
                sender_id: admin.user.id,
                sender_type: "admin",
                message
            })
            .select("*")
            .single();

        if (error) {
            console.error("ADMIN SUPPORT REPLY ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Unable to send reply."
            });
        }

        await supabase
            .from("support_conversations")
            .update({
                updated_at: new Date().toISOString(),
                status: "open"
            })
            .eq("id", conversationId);

        return res.status(201).json({
            success: true,
            message: data
        });
    } catch (error) {
        console.error("ADMIN SUPPORT REPLY EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error."
        });
    }
});

router.patch("/support/:conversationId", async (req, res) => {
    try {
        const admin = await verifyAdmin(req);

        if (!admin.authenticated) {
            return res.status(401).json({
                success: false,
                code: "ADMIN_AUTH_REQUIRED",
                error: "Admin login required."
            });
        }

        const conversationId = String(req.params.conversationId || "").trim();
        const status = String(req.body?.status || "").trim().toLowerCase();

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                error: "Conversation ID is required."
            });
        }

        if (!["open", "closed"].includes(status)) {
            return res.status(400).json({
                success: false,
                error: "Status must be open or closed."
            });
        }

        const { data, error } = await supabase
            .from("support_conversations")
            .update({
                status,
                updated_at: new Date().toISOString()
            })
            .eq("id", conversationId)
            .select("*")
            .maybeSingle();

        if (error) {
            console.error("ADMIN SUPPORT STATUS ERROR:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Unable to update support status."
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Conversation not found."
            });
        }

        return res.status(200).json({
            success: true,
            conversation: data
        });
    } catch (error) {
        console.error("ADMIN SUPPORT STATUS EXCEPTION:", error);
        return res.status(500).json({
            success: false,
            error: error?.message || "Internal server error."
        });
    }
});

module.exports = router;