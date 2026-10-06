const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const supabase = require("../config/supabase");

const OTP_EXPIRY_SECONDS = 300;
const MAX_OTP_ATTEMPTS = 5;

/*
 * ======================================================
 * OTP RESEND LIMIT
 * ======================================================
 *
 * Initial OTP = normal
 *
 * 1st resend = 1 minute
 * 2nd resend = 2 minutes
 * 3rd resend = 3 minutes
 * 4th resend = 5 minutes
 * 5th resend = 30 minutes
 * 6th resend = 1 hour
 * 7th resend = permanent block
 *
 * IMPORTANT:
 * The 7th resend does NOT send SMS.
 */

const OTP_RESEND_LOCKS_MS = [
    60_000,
    120_000,
    180_000,
    300_000,
    1_800_000,
    3_600_000
];

const OTP_RESEND_PERMANENT_BLOCK_AFTER = 7;


// ======================================================
// SINGLE-DEVICE SESSION
// ======================================================

const SESSION_COOKIE_NAME = "gamerzadda_session";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

function generateSessionToken() {
    return crypto.randomBytes(48).toString("hex");
}

function hashSessionToken(token) {
    return crypto
        .createHash("sha256")
        .update(String(token))
        .digest("hex");
}

async function createMobileSession(userId, deviceId) {
    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const now = new Date();
    const expiresAt = new Date(
        now.getTime() + SESSION_MAX_AGE_MS
    ).toISOString();

    // ONE USER = ONE MOBILE SESSION.
    // Any previous mobile device becomes invalid immediately.
    const { error: revokeError } = await supabase
        .from("user_sessions")
        .update({
            revoked_at: now.toISOString(),
        })
        .eq("user_id", String(userId))
        .eq("session_type", "mobile")
        .is("revoked_at", null);

    if (revokeError) {
        throw revokeError;
    }

    const { error: insertError } = await supabase
        .from("user_sessions")
        .insert({
            user_id: String(userId),
            token_hash: tokenHash,
            device_id: deviceId ? String(deviceId) : null,
            session_type: "mobile",
            created_at: now.toISOString(),
            last_seen_at: now.toISOString(),
            expires_at: expiresAt,
            revoked_at: null,
        });

    if (insertError) {
        throw insertError;
    }

    return {
        sessionToken,
        expiresAt,
    };
}

function setMobileSessionCookie(res, sessionToken) {
    res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}; Path=/; HttpOnly; Secure; SameSite=None`
    );
}

async function getSessionTokenFromRequest(req) {
    const authorization =
        req.headers.authorization || "";

    if (
        authorization.startsWith("Bearer ")
    ) {
        const token =
            authorization
                .slice(7)
                .trim();

        if (token) {
            return token;
        }
    }

    const cookieHeader =
        String(req.headers.cookie || "");

    const cookiePart =
        cookieHeader
            .split(";")
            .map((part) => part.trim())
            .find((part) =>
                part.startsWith(
                    `${SESSION_COOKIE_NAME}=`
                )
            );

    if (!cookiePart) {
        return "";
    }

    return decodeURIComponent(
        cookiePart.slice(
            SESSION_COOKIE_NAME.length + 1
        )
    );
}

async function validateMobileSession(req) {
    const token =
        await getSessionTokenFromRequest(req);

    if (!token) {
        return null;
    }

    const tokenHash =
        hashSessionToken(token);

    const {
        data: session,
        error,
    } = await supabase
        .from("user_sessions")
        .select(
            "user_id, device_id, session_type, expires_at, revoked_at"
        )
        .eq(
            "token_hash",
            tokenHash
        )
        .eq(
            "session_type",
            "mobile"
        )
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!session) {
        return null;
    }

    if (session.revoked_at) {
        return null;
    }

    if (
        session.expires_at &&
        new Date(session.expires_at).getTime() <=
            Date.now()
    ) {
        return null;
    }

    // Keep activity timestamp fresh.
    await supabase
        .from("user_sessions")
        .update({
            last_seen_at:
                new Date().toISOString(),
        })
        .eq(
            "token_hash",
            tokenHash
        )
        .eq(
            "session_type",
            "mobile"
        );

    return {
        userId: String(session.user_id),
        deviceId:
            session.device_id
                ? String(session.device_id)
                : "",
        tokenHash,
    };
}


// ======================================================
// HELPERS
// ======================================================

function normalizePhone(phone) {
    return String(phone || "")
        .replace(/\D/g, "")
        .slice(-10);
}


function generateOtp() {
    return crypto
        .randomInt(100000, 1000000)
        .toString();
}


function hashOtp(otp) {
    return crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
}

// ======================================================
// CLIENT IP
// ======================================================

function getClientIP(req) {
    const forwardedFor = req.headers["x-forwarded-for"];

    if (forwardedFor) {
        const firstIp = String(forwardedFor)
            .split(",")[0]
            .trim();

        if (firstIp) {
            return firstIp;
        }
    }

    return (
        req.headers["cf-connecting-ip"] ||
        req.headers["x-real-ip"] ||
        req.ip ||
        req.socket?.remoteAddress ||
        null
    );
}


// ======================================================
// OTP IP BLOCK CHECK
// ======================================================

async function checkOtpIpBlock(ip, res) {
    if (!ip) {
        return false;
    }

    const { data, error } = await supabase
        .from("otp_ip_blocks")
        .select(
            "ip_address, reason, is_permanent, expires_at"
        )
        .eq("ip_address", ip)
        .eq("is_active", true)
        .maybeSingle();

    if (error) {
        console.error("OTP IP BLOCK CHECK ERROR:", error);

        // Fail closed: if the IP block system cannot be checked,
        // do not allow an OTP to be initiated.
        res.status(503).json({
            success: false,
            code: "OTP_IP_BLOCK_CHECK_FAILED",
            message:
                "OTP service is temporarily unavailable. Please try again later."
        });

        return true;
    }

    if (!data) {
        return false;
    }

    const isExpired =
        !data.is_permanent &&
        data.expires_at &&
        new Date(data.expires_at).getTime() <= Date.now();

    if (isExpired) {
        const { error: deactivateError } = await supabase
            .from("otp_ip_blocks")
            .update({
                is_active: false,
                updated_at: new Date().toISOString()
            })
            .eq("ip_address", ip)
            .eq("is_active", true);

        if (deactivateError) {
            console.error(
                "OTP IP BLOCK EXPIRY UPDATE ERROR:",
                deactivateError
            );
        }

        return false;
    }

    res.status(429).json({
        success: false,
        code: "OTP_IP_BLOCKED",
        message:
            "OTP requests are blocked from this IP address.",
        reason: data.reason || null,
        expiresAt:
            data.is_permanent
                ? null
                : data.expires_at || null
    });

    return true;
}


// ======================================================
// OTP RESEND ABUSE HELPERS
// ======================================================

async function getOtpResendState(phone, flow) {
    const {
        data,
        error
    } = await supabase
        .from("otp_abuse_limits")
        .select(`
            resend_attempts,
            resend_locked_until,
            resend_is_blocked
        `)
        .eq("phone", phone)
        .eq("flow", flow)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}


/*
 * Checks whether a resend is currently blocked.
 *
 * This function is called ONLY when the request
 * is actually a resend.
 */
async function checkOtpResendLimit(
    phone,
    flow,
    res
) {
    const state =
        await getOtpResendState(
            phone,
            flow
        );

    if (!state) {
        return false;
    }

    /*
     * Permanent block
     */
    if (state.resend_is_blocked) {
        res.status(429).json({
            success: false,
            code: "OTP_RESEND_BLOCKED",
            message:
                "OTP access has been permanently blocked due to repeated OTP resend requests. Please contact GamerzAdda Support to unblock your OTP access."
        });

        return true;
    }

    /*
     * Temporary cooldown
     */
    if (
        state.resend_locked_until &&
        new Date(
            state.resend_locked_until
        ).getTime() > Date.now()
    ) {
        const remainingSeconds =
            Math.ceil(
                (
                    new Date(
                        state.resend_locked_until
                    ).getTime() -
                    Date.now()
                ) / 1000
            );

        res.status(429).json({
            success: false,
            code: "OTP_RESEND_COOLDOWN",
            message:
                `Please wait ${remainingSeconds} second(s) before requesting another OTP.`,
            remainingSeconds,
            lockedUntil:
                state.resend_locked_until
        });

        return true;
    }

    return false;
}


/*
 * Records a successful resend request.
 *
 * Returns blocked=true on the 7th resend.
 */
async function recordOtpResend(
    phone,
    flow
) {
    const state =
        await getOtpResendState(
            phone,
            flow
        );

    const currentAttempts =
        Number(
            state?.resend_attempts || 0
        );

    const newAttempts =
        currentAttempts + 1;


    /*
     * 7th resend:
     * permanent block
     * NO OTP should be sent.
     */
    if (
        newAttempts >=
        OTP_RESEND_PERMANENT_BLOCK_AFTER
    ) {
        const {
            error
        } = await supabase
            .from("otp_abuse_limits")
            .upsert(
                {
                    phone,
                    flow,
                    resend_attempts:
                        newAttempts,
                    resend_locked_until:
                        null,
                    resend_is_blocked:
                        true,
                    updated_at:
                        new Date().toISOString()
                },
                {
                    onConflict:
                        "phone,flow"
                }
            );

        if (error) {
            throw error;
        }

        return {
            blocked: true,
            resendAttempt:
                newAttempts
        };
    }


    /*
     * Get cooldown for this resend.
     */
    const lockMs =
        OTP_RESEND_LOCKS_MS[
            newAttempts - 1
        ];

    const lockedUntil =
        new Date(
            Date.now() + lockMs
        ).toISOString();


    const {
        error
    } = await supabase
        .from("otp_abuse_limits")
        .upsert(
            {
                phone,
                flow,
                resend_attempts:
                    newAttempts,
                resend_locked_until:
                    lockedUntil,
                resend_is_blocked:
                    false,
                updated_at:
                    new Date().toISOString()
            },
            {
                onConflict:
                    "phone,flow"
            }
        );

    if (error) {
        throw error;
    }

    return {
        blocked: false,
        resendAttempt:
            newAttempts,
        lockedUntil
    };
}


// ======================================================
// RESET OTP ABUSE STATE AFTER SUCCESSFUL LOGIN/SIGNUP
// ======================================================

async function resetOtpAbuseState(
    phone,
    flow
) {
    const {
        error
    } = await supabase
        .from("otp_abuse_limits")
        .upsert(
            {
                phone,
                flow,
                resend_attempts: 0,
                resend_locked_until:
                    null,
                resend_is_blocked:
                    false,
                wrong_attempts: 0,
                locked_until: null,
                is_blocked: false,
                unblocked_at: null,
                updated_at:
                    new Date().toISOString()
            },
            {
                onConflict:
                    "phone,flow"
            }
        );

    if (error) {
        console.error(
            "OTP ABUSE RESET ERROR:",
            error
        );
    }
}


// ======================================================
// GENERATE UNIQUE REFERRAL CODE
// ======================================================

async function generateReferralCode(
    fullName
) {
    const cleanName =
        String(fullName || "")
            .toUpperCase()
            .replace(
                /[^A-Z0-9]/g,
                ""
            );

    const safeName =
        cleanName || "USER";

    const baseCode =
        `GZ${safeName}`;


    /*
     * First try:
     * GZ + NAME
     */
    const {
        data: baseExisting,
        error: baseError
    } = await supabase
        .from("users")
        .select("id")
        .eq(
            "referral_code",
            baseCode
        )
        .limit(1);

    if (baseError) {
        throw baseError;
    }


    if (
        !baseExisting ||
        baseExisting.length === 0
    ) {
        return baseCode;
    }


    /*
     * Duplicate:
     * random 3 characters
     */
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for (
        let attempt = 0;
        attempt < 50;
        attempt++
    ) {
        const randomBytes =
            crypto.randomBytes(3);

        let suffix = "";

        for (
            let i = 0;
            i < 3;
            i++
        ) {
            suffix +=
                characters[
                    randomBytes[i] %
                    characters.length
                ];
        }

        const newCode =
            `${baseCode}${suffix}`;

        const {
            data: existingCode,
            error:
                existingCodeError
        } = await supabase
            .from("users")
            .select("id")
            .eq(
                "referral_code",
                newCode
            )
            .limit(1);

        if (existingCodeError) {
            throw existingCodeError;
        }

        if (
            !existingCode ||
            existingCode.length === 0
        ) {
            return newCode;
        }
    }


    throw new Error(
        "Unable to generate a unique referral code."
    );
}


// ======================================================
// POST /api/auth/otp
// ======================================================

router.post(
    "/otp",
    async (req, res) => {
        try {
            const {
                phone,
                action,
                flow,
                otp,
                fullName,
                email,
                referralCode,
                deviceId,
                fcmToken
            } = req.body;


            // ==================================================
            // VALIDATION
            // ==================================================

            if (!phone) {
                return res.status(400).json({
                    success: false,
                    code:
                        "PHONE_REQUIRED",
                    message:
                        "Phone number is required."
                });
            }


            if (
                !action ||
                ![
                    "send",
                    "verify"
                ].includes(action)
            ) {
                return res.status(400).json({
                    success: false,
                    code:
                        "INVALID_ACTION",
                    message:
                        "Invalid OTP action."
                });
            }


            if (
                !flow ||
                ![
                    "login",
                    "signup"
                ].includes(flow)
            ) {
                return res.status(400).json({
                    success: false,
                    code:
                        "INVALID_FLOW",
                    message:
                        "Invalid authentication flow."
                });
            }


            const cleanPhone =
                normalizePhone(phone);


            if (
                cleanPhone.length !== 10
            ) {
                return res.status(400).json({
                    success: false,
                    code:
                        "INVALID_PHONE",
                    message:
                        "Please enter a valid 10-digit phone number."
                });
            }


            // ==================================================
            // CLIENT IP
            // ==================================================

            const clientIP = getClientIP(req);

            console.log(
                "OTP REQUEST IP:",
                clientIP || "UNKNOWN"
            );

            // ==================================================
            // SEND OTP
            // ==================================================

            if (action === "send") {

                // IP block is checked before OTP generation,
                // database insert, and SMS sending.
                const ipBlocked =
                    await checkOtpIpBlock(
                        clientIP,
                        res
                    );

                if (ipBlocked) {
                    return;
                }


                /*
                 * ----------------------------------------------
                 * DETERMINE WHETHER THIS IS INITIAL OTP
                 * OR RESEND
                 * ----------------------------------------------
                 *
                 * If an OTP has already been generated for this
                 * phone + flow, this request is a RESEND.
                 */

                const {
                    data: previousOtp,
                    error:
                        previousOtpError
                } = await supabase
                    .from("otp_codes")
                    .select(
                        "id, verified, expires_at, created_at"
                    )
                    .eq(
                        "phone",
                        cleanPhone
                    )
                    .eq(
                        "flow",
                        flow
                    )
                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    )
                    .limit(1)
                    .maybeSingle();


                if (previousOtpError) {
                    console.error(
                        "PREVIOUS OTP CHECK ERROR:",
                        previousOtpError
                    );

                    return res.status(500).json({
                        success: false,
                        code:
                            "DATABASE_ERROR",
                        message:
                            "Unable to check OTP status."
                    });
                }


                const isResend =
                    !!previousOtp;


                /*
                 * ----------------------------------------------
                 * RESEND LIMIT
                 * ----------------------------------------------
                 *
                 * IMPORTANT:
                 * Initial OTP is NOT counted as resend.
                 */
                if (isResend) {

                    const resendLimited =
                        await checkOtpResendLimit(
                            cleanPhone,
                            flow,
                            res
                        );

                    if (resendLimited) {
                        return;
                    }


                    /*
                     * Determine whether this request is
                     * the 7th resend BEFORE generating/sending OTP.
                     */
                    const resendState =
                        await getOtpResendState(
                            cleanPhone,
                            flow
                        );

                    const currentResends =
                        Number(
                            resendState?.resend_attempts ||
                            0
                        );

                    if (
                        currentResends + 1 >=
                        OTP_RESEND_PERMANENT_BLOCK_AFTER
                    ) {

                        await supabase
                            .from(
                                "otp_abuse_limits"
                            )
                            .upsert(
                                {
                                    phone:
                                        cleanPhone,
                                    flow,
                                    resend_attempts:
                                        currentResends +
                                        1,
                                    resend_locked_until:
                                        null,
                                    resend_is_blocked:
                                        true,
                                    updated_at:
                                        new Date().toISOString()
                                },
                                {
                                    onConflict:
                                        "phone,flow"
                                }
                            );

                        return res.status(429).json({
                            success: false,
                            code:
                                "OTP_RESEND_BLOCKED",
                            message:
                                "OTP access has been permanently blocked due to repeated OTP resend requests. Please contact GamerzAdda Support to unblock your OTP access."
                        });
                    }
                }


                // ----------------------------------------------
                // LOGIN CHECK
                // ----------------------------------------------

                if (flow === "login") {

                    const {
                        data: user,
                        error:
                            userError
                    } = await supabase
                        .from("users")
                        .select(
                            "id, phone, status"
                        )
                        .eq(
                            "phone",
                            cleanPhone
                        )
                        .maybeSingle();


                    if (userError) {
                        console.error(
                            "LOGIN USER CHECK ERROR:",
                            userError
                        );

                        return res.status(500).json({
                            success: false,
                            code:
                                "DATABASE_ERROR",
                            message:
                                "Unable to check account."
                        });
                    }


                    if (!user) {
                        return res.status(404).json({
                            success: false,
                            code:
                                "USER_NOT_FOUND",
                            message:
                                "Account not found. Please create an account first."
                        });
                    }


                    if (
                        user.status &&
                        String(
                            user.status
                        ).toLowerCase() !==
                            "active"
                    ) {
                        return res.status(403).json({
                            success: false,
                            code:
                                "ACCOUNT_DISABLED",
                            message:
                                "Your account is currently disabled."
                        });
                    }
                }


                // ----------------------------------------------
                // SIGNUP CHECK
                // ----------------------------------------------

                if (flow === "signup") {

                    const {
                        data:
                            existingUser,
                        error:
                            existingError
                    } = await supabase
                        .from("users")
                        .select("id")
                        .eq(
                            "phone",
                            cleanPhone
                        )
                        .maybeSingle();


                    if (existingError) {
                        console.error(
                            "SIGNUP USER CHECK ERROR:",
                            existingError
                        );

                        return res.status(500).json({
                            success: false,
                            code:
                                "DATABASE_ERROR",
                            message:
                                "Unable to check phone number."
                        });
                    }


                    if (existingUser) {
                        return res.status(409).json({
                            success: false,
                            code:
                                "USER_EXISTS",
                            message:
                                "An account with this phone number already exists."
                        });
                    }


                    if (
                        !fullName ||
                        !String(
                            fullName
                        ).trim()
                    ) {
                        return res.status(400).json({
                            success: false,
                            code:
                                "NAME_REQUIRED",
                            message:
                                "Full name is required."
                        });
                    }
                }


                // ----------------------------------------------
                // GENERATE OTP
                // ----------------------------------------------

                const generatedOtp =
                    generateOtp();

                const otpHash =
                    hashOtp(
                        generatedOtp
                    );

                const expiresAt =
                    new Date(
                        Date.now() +
                        OTP_EXPIRY_SECONDS *
                            1000
                    ).toISOString();


                // ----------------------------------------------
                // INVALIDATE OLD OTPs
                // ----------------------------------------------

                const {
                    error:
                        invalidateError
                } = await supabase
                    .from("otp_codes")
                    .update({
                        verified: true
                    })
                    .eq(
                        "phone",
                        cleanPhone
                    )
                    .eq(
                        "flow",
                        flow
                    )
                    .eq(
                        "verified",
                        false
                    );


                if (invalidateError) {
                    console.error(
                        "OTP INVALIDATE ERROR:",
                        invalidateError
                    );

                    return res.status(500).json({
                        success: false,
                        code:
                            "OTP_STORAGE_ERROR",
                        message:
                            "Unable to generate OTP."
                    });
                }


                // ----------------------------------------------
                // SAVE OTP
                // ----------------------------------------------

                const {
                    error:
                        insertError
                } = await supabase
                    .from("otp_codes")
                    .insert({
                        phone:
                            cleanPhone,
                        otp_hash:
                            otpHash,
                        flow:
                            flow,
                        expires_at:
                            expiresAt,
                        attempts: 0,
                        verified: false,
                        device_id:
                            deviceId
                                ? String(
                                      deviceId
                                  )
                                : null,
                        ip_address:
                            clientIP
                    });


                if (insertError) {
                    console.error(
                        "OTP INSERT ERROR:",
                        insertError
                    );

                    return res.status(500).json({
                        success: false,
                        code:
                            "OTP_STORAGE_ERROR",
                        message:
                            "Unable to generate OTP."
                    });
                }


                // ----------------------------------------------
                // SMS PROVIDER CONFIG
                // ----------------------------------------------

                const smsBaseUrl =
                    process.env.SMS_BASE_URL ||
                    "http://sms.hspsms.com/sendSMS";

                const smsUsername =
                    process.env.SMS_USERNAME;

                const smsApiKey =
                    process.env.SMS_API_KEY;

                const smsSenderName =
                    process.env.SMS_SENDER_NAME ||
                    "FYDBZR";

                const smsType =
                    process.env.SMS_TYPE ||
                    "TRANS";

                const smsTemplate =
                    process.env.SMS_OTP_MESSAGE ||
                    "Dear {#var#}, your One Time Password for Registration is {#var#}. Thanks and Regards Fayda Bazar.";


                if (
                    !smsUsername ||
                    !smsApiKey
                ) {
                    await supabase
                        .from("otp_codes")
                        .update({
                            verified: true
                        })
                        .eq(
                            "phone",
                            cleanPhone
                        )
                        .eq(
                            "flow",
                            flow
                        )
                        .eq(
                            "otp_hash",
                            otpHash
                        );

                    return res.status(500).json({
                        success: false,
                        code:
                            "SMS_CONFIG_ERROR",
                        message:
                            "OTP service is not configured."
                    });
                }


                // ----------------------------------------------
                // SMS MESSAGE
                // ----------------------------------------------

                let smsMessage =
                    smsTemplate;


                /*
                 * Supports:
                 *
                 * {#var#}
                 *
                 * first variable = Gamerzadda
                 * second variable = OTP
                 *
                 * Also supports old {otp} template.
                 */

                if (
                    smsMessage.includes(
                        "{#var#}"
                    )
                ) {
                    smsMessage =
                        smsMessage.replace(
                            "{#var#}",
                            "Gamerzadda"
                        );

                    smsMessage =
                        smsMessage.replace(
                            "{#var#}",
                            generatedOtp
                        );

                } else if (
                    smsMessage.includes(
                        "{otp}"
                    )
                ) {
                    smsMessage =
                        smsMessage.replace(
                            "{otp}",
                            generatedOtp
                        );

                } else {
                    smsMessage =
                        `Dear Gamerzadda, your One Time Password for Registration is ${generatedOtp}. Thanks and Regards Fayda Bazar.`;
                }


                console.log(
                    "SMS MESSAGE:",
                    smsMessage
                );


                const smsUrl =
                    `${smsBaseUrl}?` +
                    new URLSearchParams({
                        username:
                            smsUsername,
                        message:
                            smsMessage,
                        sendername:
                            smsSenderName,
                        smstype:
                            smsType,
                        numbers:
                            cleanPhone,
                        apikey:
                            smsApiKey
                    }).toString();


                // ----------------------------------------------
                // SEND SMS
                // ----------------------------------------------

                try {

                    const smsResponse =
                        await fetch(
                            smsUrl,
                            {
                                method:
                                    "GET"
                            }
                        );


                    const smsResponseText =
                        await smsResponse.text();


                    console.log(
                        "SMS PROVIDER RESPONSE:",
                        smsResponse.status,
                        smsResponseText
                    );


                    if (
                        !smsResponse.ok
                    ) {

                        await supabase
                            .from(
                                "otp_codes"
                            )
                            .update({
                                verified:
                                    true
                            })
                            .eq(
                                "phone",
                                cleanPhone
                            )
                            .eq(
                                "flow",
                                flow
                            )
                            .eq(
                                "otp_hash",
                                otpHash
                            );


                        return res.status(502).json({
                            success: false,
                            code:
                                "SMS_SEND_FAILED",
                            message:
                                "Unable to send OTP."
                        });
                    }

                } catch (
                    smsError
                ) {

                    console.error(
                        "SMS PROVIDER ERROR:",
                        smsError
                    );


                    await supabase
                        .from(
                            "otp_codes"
                        )
                        .update({
                            verified:
                                true
                        })
                        .eq(
                            "phone",
                            cleanPhone
                        )
                        .eq(
                            "flow",
                            flow
                        )
                        .eq(
                            "otp_hash",
                            otpHash
                        );


                    return res.status(502).json({
                        success: false,
                        code:
                            "SMS_SEND_FAILED",
                        message:
                            "Unable to send OTP."
                    });
                }


                /*
                 * ----------------------------------------------
                 * AFTER SUCCESSFUL SMS
                 * ----------------------------------------------
                 *
                 * If this was a resend, increment resend counter
                 * and apply the correct cooldown.
                 *
                 * Initial OTP does NOT increment resend counter.
                 */

                if (isResend) {

                    const resendState =
                        await recordOtpResend(
                            cleanPhone,
                            flow
                        );

                    /*
                     * Safety check.
                     */
                    if (
                        resendState.blocked
                    ) {
                        return res.status(429).json({
                            success: false,
                            code:
                                "OTP_RESEND_BLOCKED",
                            message:
                                "OTP access has been permanently blocked due to repeated OTP resend requests. Please contact GamerzAdda Support to unblock your OTP access."
                        });
                    }

                    console.log(
                        "OTP RESEND:",
                        resendState.resendAttempt,
                        "LOCKED UNTIL:",
                        resendState.lockedUntil
                    );
                }


                console.log(
                    `OTP sent successfully to ${cleanPhone}`
                );


                return res.json({
                    success: true,
                    code:
                        "OTP_SENT",
                    message:
                        "OTP sent successfully.",
                    expiresInSeconds:
                        OTP_EXPIRY_SECONDS
                });
            }


            // ==================================================
            // VERIFY OTP
            // ==================================================

            if (action === "verify") {

                if (!otp) {
                    return res.status(400).json({
                        success: false,
                        code:
                            "OTP_REQUIRED",
                        message:
                            "OTP is required."
                    });
                }


                const cleanOtp =
                    String(otp)
                        .replace(
                            /\D/g,
                            ""
                        );


                if (
                    cleanOtp.length !== 6
                ) {
                    return res.status(400).json({
                        success: false,
                        code:
                            "INVALID_OTP",
                        message:
                            "Please enter a valid 6-digit OTP."
                    });
                }


                // ----------------------------------------------
                // CHECK OTP ABUSE PERMANENT BLOCK
                // ----------------------------------------------

                const abuseState =
                    await getOtpResendState(
                        cleanPhone,
                        flow
                    );


                if (
                    abuseState?.is_blocked
                ) {
                    return res.status(429).json({
                        success: false,
                        code:
                            "OTP_BLOCKED",
                        message:
                            "OTP access is blocked due to repeated incorrect OTP attempts. Please contact GamerzAdda Support to unblock your OTP access."
                    });
                }


                if (
                    abuseState?.resend_is_blocked
                ) {
                    return res.status(429).json({
                        success: false,
                        code:
                            "OTP_RESEND_BLOCKED",
                        message:
                            "OTP access has been permanently blocked due to repeated OTP resend requests. Please contact GamerzAdda Support to unblock your OTP access."
                    });
                }


                // ----------------------------------------------
                // GET LATEST OTP
                // ----------------------------------------------

                const {
                    data:
                        otpRecord,
                    error:
                        otpError
                } = await supabase
                    .from("otp_codes")
                    .select(
                        "id, phone, otp_hash, flow, expires_at, attempts, verified"
                    )
                    .eq(
                        "phone",
                        cleanPhone
                    )
                    .eq(
                        "flow",
                        flow
                    )
                    .eq(
                        "verified",
                        false
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


                if (otpError) {
                    console.error(
                        "OTP FETCH ERROR:",
                        otpError
                    );

                    return res.status(500).json({
                        success: false,
                        code:
                            "DATABASE_ERROR",
                        message:
                            "Unable to verify OTP."
                    });
                }


                if (!otpRecord) {
                    return res.status(400).json({
                        success: false,
                        code:
                            "OTP_NOT_FOUND",
                        message:
                            "OTP expired or not found. Please request a new OTP."
                    });
                }


                // ----------------------------------------------
                // EXPIRY CHECK
                // ----------------------------------------------

                if (
                    new Date(
                        otpRecord.expires_at
                    ).getTime() <
                    Date.now()
                ) {

                    await supabase
                        .from(
                            "otp_codes"
                        )
                        .update({
                            verified:
                                true
                        })
                        .eq(
                            "id",
                            otpRecord.id
                        );


                    return res.status(400).json({
                        success: false,
                        code:
                            "OTP_EXPIRED",
                        message:
                            "OTP has expired. Please request a new OTP."
                    });
                }


                // ----------------------------------------------
                // SINGLE OTP ATTEMPT LIMIT
                // ----------------------------------------------

                const attempts =
                    Number(
                        otpRecord.attempts ||
                        0
                    );


                if (
                    attempts >=
                    MAX_OTP_ATTEMPTS
                ) {

                    await supabase
                        .from(
                            "otp_codes"
                        )
                        .update({
                            verified:
                                true
                        })
                        .eq(
                            "id",
                            otpRecord.id
                        );


                    return res.status(429).json({
                        success: false,
                        code:
                            "TOO_MANY_ATTEMPTS",
                        message:
                            "Too many incorrect attempts. Please request a new OTP."
                    });
                }


                // ----------------------------------------------
                // OTP CHECK
                // ----------------------------------------------

                const suppliedHash =
                    hashOtp(
                        cleanOtp
                    );


                if (
                    suppliedHash !==
                    otpRecord.otp_hash
                ) {

                    const newWrongAttempts =
                        attempts + 1;


                    await supabase
                        .from(
                            "otp_codes"
                        )
                        .update({
                            attempts:
                                newWrongAttempts
                        })
                        .eq(
                            "id",
                            otpRecord.id
                        );


                    return res.status(400).json({
                        success: false,
                        code:
                            "INVALID_OTP",
                        message:
                            "Invalid OTP. Please try again.",
                        wrongAttempts:
                            newWrongAttempts
                    });
                }


                // ----------------------------------------------
                // MARK OTP VERIFIED
                // ----------------------------------------------

                const {
                    error:
                        verifyUpdateError
                } = await supabase
                    .from(
                        "otp_codes"
                    )
                    .update({
                        verified:
                            true
                    })
                    .eq(
                        "id",
                        otpRecord.id
                    );


                if (verifyUpdateError) {
                    console.error(
                        "OTP VERIFY UPDATE ERROR:",
                        verifyUpdateError
                    );

                    return res.status(500).json({
                        success: false,
                        code:
                            "DATABASE_ERROR",
                        message:
                            "Unable to complete verification."
                    });
                }


                // ----------------------------------------------
                // RESET ABUSE COUNTERS AFTER SUCCESS
                // ----------------------------------------------

                await resetOtpAbuseState(
                    cleanPhone,
                    flow
                );


                // =================================================
                // LOGIN
                // =================================================

                if (flow === "login") {

                    const {
                        data: user,
                        error:
                            userError
                    } = await supabase
                        .from("users")
                        .select(
                            "id, phone, status"
                        )
                        .eq(
                            "phone",
                            cleanPhone
                        )
                        .maybeSingle();


                    if (userError) {
                        console.error(
                            "LOGIN USER ERROR:",
                            userError
                        );

                        return res.status(500).json({
                            success: false,
                            code:
                                "DATABASE_ERROR",
                            message:
                                "Unable to load account."
                        });
                    }


                    if (!user) {
                        return res.status(404).json({
                            success: false,
                            code:
                                "USER_NOT_FOUND",
                            message:
                                "Account not found."
                        });
                    }


                    if (
                        user.status &&
                        String(
                            user.status
                        ).toLowerCase() !==
                            "active"
                    ) {
                        return res.status(403).json({
                            success: false,
                            code:
                                "ACCOUNT_DISABLED",
                            message:
                                "Your account is currently disabled."
                        });
                    }


                    // ------------------------------------------
                    // FCM TOKEN
                    // ------------------------------------------

                    if (
                        fcmToken &&
                        String(
                            fcmToken
                        ).trim()
                    ) {

                        const cleanFcmToken =
                            String(
                                fcmToken
                            ).trim();


                        console.log(
                            "LOGIN FCM TOKEN: RECEIVED"
                        );

                        console.log(
                            "SAVING FCM TOKEN FOR USER:",
                            user.id
                        );


                        const {
                            data:
                                fcmUpdatedUser,
                            error:
                                fcmError
                        } = await supabase
                            .from(
                                "users"
                            )
                            .update({
                                fcm_token:
                                    cleanFcmToken
                            })
                            .eq(
                                "id",
                                user.id
                            )
                            .select(
                                "id, fcm_token"
                            )
                            .single();


                        if (fcmError) {
                            console.error(
                                "FCM TOKEN SAVE ERROR:",
                                fcmError
                            );
                        } else {
                            console.log(
                                "FCM TOKEN SAVED:",
                                fcmUpdatedUser?.fcm_token
                                    ? "YES"
                                    : "NO"
                            );
                        }

                    } else {

                        console.log(
                            "LOGIN FCM TOKEN: MISSING"
                        );
                    }


                    // ------------------------------------------
                    // CREATE SINGLE-DEVICE SESSION
                    // ------------------------------------------

                    const loginSession =
                        await createMobileSession(
                            user.id,
                            deviceId
                        );

                    setMobileSessionCookie(
                        res,
                        loginSession.sessionToken
                    );

                    return res.json({
                        success: true,
                        code:
                            "LOGIN_SUCCESS",
                        message:
                            "Login successful.",
                        userId:
                            user.id,
                        sessionToken:
                            loginSession.sessionToken,
                        sessionExpiresAt:
                            loginSession.expiresAt,
                        redirect:
                            "/"
                    });
                }


                // =================================================
                // SIGNUP
                // =================================================

                if (flow === "signup") {

                    if (
                        !fullName ||
                        !String(
                            fullName
                        ).trim()
                    ) {
                        return res.status(400).json({
                            success: false,
                            code:
                                "NAME_REQUIRED",
                            message:
                                "Full name is required."
                        });
                    }


                    // ---------------------------------------------
                    // DOUBLE CHECK USER
                    // ---------------------------------------------

                    const {
                        data:
                            existingUser,
                        error:
                            existingError
                    } = await supabase
                        .from("users")
                        .select("id")
                        .eq(
                            "phone",
                            cleanPhone
                        )
                        .maybeSingle();


                    if (existingError) {
                        console.error(
                            "SIGNUP FINAL CHECK ERROR:",
                            existingError
                        );

                        return res.status(500).json({
                            success: false,
                            code:
                                "DATABASE_ERROR",
                            message:
                                "Unable to create account."
                        });
                    }


                    if (existingUser) {
                        return res.status(409).json({
                            success: false,
                            code:
                                "USER_EXISTS",
                            message:
                                "An account with this phone number already exists."
                        });
                    }


                    // ---------------------------------------------
                    // OWN REFERRAL CODE
                    // ---------------------------------------------

                    const ownReferralCode =
                        await generateReferralCode(
                            fullName
                        );


                    // ---------------------------------------------
                    // FIND REFERRER
                    // ---------------------------------------------

                    let referredBy = null;


                    const enteredReferralCode =
                        String(
                            referralCode ||
                            ""
                        )
                            .trim()
                            .toUpperCase();


                    if (
                        enteredReferralCode
                    ) {

                        const {
                            data:
                                referrer,
                            error:
                                referrerError
                        } = await supabase
                            .from(
                                "users"
                            )
                            .select(
                                "id, referral_code, status"
                            )
                            .eq(
                                "referral_code",
                                enteredReferralCode
                            )
                            .limit(1)
                            .maybeSingle();


                        if (
                            referrerError
                        ) {
                            console.error(
                                "REFERRAL CHECK ERROR:",
                                referrerError
                            );

                            return res.status(500).json({
                                success: false,
                                code:
                                    "REFERRAL_CHECK_FAILED",
                                message:
                                    "Unable to verify referral code."
                            });
                        }


                        if (
                            !referrer
                        ) {
                            return res.status(400).json({
                                success: false,
                                code:
                                    "INVALID_REFERRAL_CODE",
                                message:
                                    "Invalid referral code."
                            });
                        }


                        if (
                            referrer.status &&
                            String(
                                referrer.status
                            ).toLowerCase() !==
                                "active"
                        ) {
                            return res.status(400).json({
                                success: false,
                                code:
                                    "INVALID_REFERRAL_CODE",
                                message:
                                    "Invalid referral code."
                            });
                        }


                        referredBy =
                            String(
                                referrer.id
                            );
                    }


                    // ---------------------------------------------
                    // CREATE USER
                    // ---------------------------------------------

                    const insertData = {

                        phone:
                            cleanPhone,

                        full_name:
                            String(
                                fullName
                            ).trim(),

                        status:
                            "active",

                        referral_code:
                            ownReferralCode,

                        referred_by:
                            referredBy
                    };


                    if (
                        email &&
                        String(
                            email
                        ).trim()
                    ) {

                        insertData.email =
                            String(
                                email
                            ).trim();
                    }


                    // ---------------------------------------------
                    // INSERT USER
                    // ---------------------------------------------

                    const {
                        data:
                            newUser,
                        error:
                            createError
                    } = await supabase
                        .from("users")
                        .insert(
                            insertData
                        )
                        .select(
                            "id, phone, status, referral_code, referred_by"
                        )
                        .single();


                    if (createError) {
                        console.error(
                            "SIGNUP CREATE ERROR:",
                            createError
                        );

                        return res.status(500).json({
                            success: false,
                            code:
                                "CREATE_USER_FAILED",
                            message:
                                createError.message ||
                                "Unable to create account."
                        });
                    }


                    // ---------------------------------------------
                    // FCM TOKEN
                    // ---------------------------------------------

                    if (
                        fcmToken &&
                        String(
                            fcmToken
                        ).trim()
                    ) {

                        const cleanFcmToken =
                            String(
                                fcmToken
                            ).trim();


                        console.log(
                            "SIGNUP FCM TOKEN: RECEIVED"
                        );

                        console.log(
                            "SAVING FCM TOKEN FOR USER:",
                            newUser.id
                        );


                        const {
                            data:
                                fcmUpdatedUser,
                            error:
                                fcmError
                        } = await supabase
                            .from(
                                "users"
                            )
                            .update({
                                fcm_token:
                                    cleanFcmToken
                            })
                            .eq(
                                "id",
                                newUser.id
                            )
                            .select(
                                "id, fcm_token"
                            )
                            .single();


                        if (fcmError) {
                            console.error(
                                "FCM TOKEN SAVE ERROR:",
                                fcmError
                            );
                        } else {
                            console.log(
                                "FCM TOKEN SAVED:",
                                fcmUpdatedUser?.fcm_token
                                    ? "YES"
                                    : "NO"
                            );
                        }

                    } else {

                        console.log(
                            "SIGNUP FCM TOKEN: MISSING"
                        );
                    }


                    // ---------------------------------------------
                    // CREATE SINGLE-DEVICE SESSION
                    // ---------------------------------------------

                    const signupSession =
                        await createMobileSession(
                            newUser.id,
                            deviceId
                        );

                    setMobileSessionCookie(
                        res,
                        signupSession.sessionToken
                    );

                    return res.json({
                        success: true,
                        code:
                            "SIGNUP_SUCCESS",
                        message:
                            "Account created successfully.",
                        userId:
                            newUser.id,
                        sessionToken:
                            signupSession.sessionToken,
                        sessionExpiresAt:
                            signupSession.expiresAt,
                        referralCode:
                            newUser.referral_code,
                        referredBy:
                            newUser.referred_by,
                        redirect:
                            "/"
                    });
                }
            }

        } catch (error) {

            console.error(
                "AUTH OTP API ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                code:
                    "SERVER_ERROR",
                message:
                    error.message ||
                    "Internal server error."
            });
        }
    }
);



// ======================================================
// POST /api/auth/logout
// ======================================================

router.post(
    "/logout",
    async (req, res) => {
        try {
            const token =
                await getSessionTokenFromRequest(req);

            if (token) {
                const tokenHash =
                    hashSessionToken(token);

                await supabase
                    .from("user_sessions")
                    .update({
                        revoked_at:
                            new Date().toISOString(),
                    })
                    .eq(
                        "token_hash",
                        tokenHash
                    )
                    .eq(
                        "session_type",
                        "mobile"
                    );
            }

            res.setHeader(
                "Set-Cookie",
                `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`
            );

            return res.json({
                success: true,
                code:
                    "LOGOUT_SUCCESS",
                message:
                    "Logged out successfully.",
            });

        } catch (error) {
            console.error(
                "AUTH LOGOUT ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                code:
                    "LOGOUT_FAILED",
                message:
                    "Unable to logout right now.",
            });
        }
    }
);

// ======================================================
// GET /api/auth/session
// ======================================================

router.get(
    "/session",
    async (req, res) => {
        try {
            const session =
                await validateMobileSession(req);

            if (!session) {
                return res.status(401).json({
                    success: false,
                    code:
                        "SESSION_INVALID",
                    message:
                        "Your session has expired or you are logged in on another device.",
                });
            }

            return res.json({
                success: true,
                code:
                    "SESSION_VALID",
                userId:
                    session.userId,
                deviceId:
                    session.deviceId,
            });

        } catch (error) {
            console.error(
                "AUTH SESSION CHECK ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                code:
                    "SESSION_CHECK_FAILED",
                message:
                    "Unable to verify your session.",
            });
        }
    }
);

module.exports = router;