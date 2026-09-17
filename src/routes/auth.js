const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const supabase = require("../config/supabase");

const OTP_EXPIRY_SECONDS = 300;
const MAX_OTP_ATTEMPTS = 5;

// ======================================================
// HELPERS
// ======================================================

function normalizePhone(phone) {
    return String(phone || "")
        .replace(/\D/g, "")
        .slice(-10);
}

function generateOtp() {
    return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(otp) {
    return crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
}

// ======================================================
// POST /api/auth/otp
// ======================================================

router.post("/otp", async (req, res) => {

    try {

        const {
            phone,
            action,
            flow,
            otp,
            fullName,
            email,
            referralCode,
            deviceId
        } = req.body;

        // ==================================================
        // VALIDATION
        // ==================================================

        if (!phone) {
            return res.status(400).json({
                success: false,
                code: "PHONE_REQUIRED",
                message: "Phone number is required."
            });
        }

        if (
            !action ||
            !["send", "verify"].includes(action)
        ) {
            return res.status(400).json({
                success: false,
                code: "INVALID_ACTION",
                message: "Invalid OTP action."
            });
        }

        if (
            !flow ||
            !["login", "signup"].includes(flow)
        ) {
            return res.status(400).json({
                success: false,
                code: "INVALID_FLOW",
                message: "Invalid authentication flow."
            });
        }

        const cleanPhone = normalizePhone(phone);

        if (cleanPhone.length !== 10) {
            return res.status(400).json({
                success: false,
                code: "INVALID_PHONE",
                message:
                    "Please enter a valid 10-digit phone number."
            });
        }

        // ==================================================
        // SEND OTP
        // ==================================================

        if (action === "send") {

            // ----------------------------------------------
            // LOGIN CHECK
            // ----------------------------------------------

            if (flow === "login") {

                const {
                    data: user,
                    error: userError
                } = await supabase
                    .from("users")
                    .select("id, phone, status")
                    .eq("phone", cleanPhone)
                    .maybeSingle();

                if (userError) {

                    console.error(
                        "LOGIN USER CHECK ERROR:",
                        userError
                    );

                    return res.status(500).json({
                        success: false,
                        code: "DATABASE_ERROR",
                        message:
                            "Unable to check account."
                    });
                }

                if (!user) {

                    return res.status(404).json({
                        success: false,
                        code: "USER_NOT_FOUND",
                        message:
                            "Account not found. Please create an account first."
                    });
                }

                if (
                    user.status &&
                    String(user.status).toLowerCase() !==
                        "active"
                ) {

                    return res.status(403).json({
                        success: false,
                        code: "ACCOUNT_DISABLED",
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
                    data: existingUser,
                    error: existingError
                } = await supabase
                    .from("users")
                    .select("id")
                    .eq("phone", cleanPhone)
                    .maybeSingle();

                if (existingError) {

                    console.error(
                        "SIGNUP USER CHECK ERROR:",
                        existingError
                    );

                    return res.status(500).json({
                        success: false,
                        code: "DATABASE_ERROR",
                        message:
                            "Unable to check phone number."
                    });
                }

                if (existingUser) {

                    return res.status(409).json({
                        success: false,
                        code: "USER_EXISTS",
                        message:
                            "An account with this phone number already exists."
                    });
                }

                if (
                    !fullName ||
                    !String(fullName).trim()
                ) {

                    return res.status(400).json({
                        success: false,
                        code: "NAME_REQUIRED",
                        message:
                            "Full name is required."
                    });
                }
            }

            // ----------------------------------------------
            // GENERATE OTP
            // ----------------------------------------------

            const generatedOtp = generateOtp();
            const otpHash = hashOtp(generatedOtp);

            const expiresAt =
                new Date(
                    Date.now() +
                    OTP_EXPIRY_SECONDS * 1000
                ).toISOString();

            // ----------------------------------------------
            // INVALIDATE OLD OTPs
            // ----------------------------------------------

            const {
                error: invalidateError
            } = await supabase
                .from("otp_codes")
                .update({
                    verified: true
                })
                .eq("phone", cleanPhone)
                .eq("flow", flow)
                .eq("verified", false);

            if (invalidateError) {

                console.error(
                    "OTP INVALIDATE ERROR:",
                    invalidateError
                );

                return res.status(500).json({
                    success: false,
                    code: "OTP_STORAGE_ERROR",
                    message:
                        "Unable to generate OTP."
                });
            }

            // ----------------------------------------------
            // SAVE OTP
            // ----------------------------------------------

            const {
                error: insertError
            } = await supabase
                .from("otp_codes")
                .insert({
                    phone: cleanPhone,
                    otp_hash: otpHash,
                    flow: flow,
                    expires_at: expiresAt,
                    attempts: 0,
                    verified: false,
                    device_id:
                        deviceId
                            ? String(deviceId)
                            : null
                });

            if (insertError) {

                console.error(
                    "OTP INSERT ERROR:",
                    insertError
                );

                return res.status(500).json({
                    success: false,
                    code: "OTP_STORAGE_ERROR",
                    message:
                        "Unable to generate OTP."
                });
            }

            // ----------------------------------------------
            // Send OTP through HSP SMS provider
    const smsBaseUrl =
        process.env.SMS_BASE_URL ||
        "http://sms.hspsms.com/sendSMS";

    const smsUsername = process.env.SMS_USERNAME;
    const smsApiKey = process.env.SMS_API_KEY;
    const smsSenderName = process.env.SMS_SENDER_NAME || "GUERAR";
    const smsType = process.env.SMS_TYPE || "TRANS";
    const smsTemplate =
        process.env.SMS_OTP_MESSAGE ||
        "{otp} is the OTP for Gamerzadda. Please do not share this OTP with anyone. This SMS has been sent from GuestRAR.";

    if (!smsUsername || !smsApiKey) {
      return res.status(500).json({
        success: false,
        code: "SMS_CONFIG_ERROR",
        message: "OTP service is not configured."
      });
    }

    const smsMessage = smsTemplate.replace("{otp}", generatedOtp);

    const smsUrl =
        `${smsBaseUrl}?` +
        new URLSearchParams({
          username: smsUsername,
          message: smsMessage,
          sendername: smsSenderName,
          smstype: smsType,
          numbers: cleanPhone,
          apikey: smsApiKey
        }).toString();

    try {
      const smsResponse = await fetch(smsUrl, {
        method: "GET"
      });

      const smsResponseText = await smsResponse.text();

      console.log(
        "SMS PROVIDER RESPONSE:",
        smsResponse.status,
        smsResponseText
      );

      if (!smsResponse.ok) {
        await supabase
          .from("otp_codes")
          .update({ verified: true })
          .eq("phone", cleanPhone)
          .eq("flow", flow)
          .eq("otp_hash", otpHash);

        return res.status(502).json({
          success: false,
          code: "SMS_SEND_FAILED",
          message: "Unable to send OTP."
        });
      }
    } catch (smsError) {
      console.error("SMS PROVIDER ERROR:", smsError);

      await supabase
        .from("otp_codes")
        .update({ verified: true })
        .eq("phone", cleanPhone)
        .eq("flow", flow)
        .eq("otp_hash", otpHash);

      return res.status(502).json({
        success: false,
        code: "SMS_SEND_FAILED",
        message: "Unable to send OTP."
      });
    }

    console.log(`OTP sent successfully to ${cleanPhone}`);

    return res.json({
                success: true,
                code: "OTP_SENT",
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
                    code: "OTP_REQUIRED",
                    message:
                        "OTP is required."
                });
            }

            const cleanOtp =
                String(otp)
                    .replace(/\D/g, "");

            if (cleanOtp.length !== 6) {

                return res.status(400).json({
                    success: false,
                    code: "INVALID_OTP",
                    message:
                        "Please enter a valid 6-digit OTP."
                });
            }

            // ----------------------------------------------
            // GET LATEST OTP
            // ----------------------------------------------

            const {
                data: otpRecord,
                error: otpError
            } = await supabase
                .from("otp_codes")
                .select(
                    "id, phone, otp_hash, flow, expires_at, attempts, verified"
                )
                .eq("phone", cleanPhone)
                .eq("flow", flow)
                .eq("verified", false)
                .order("created_at", {
                    ascending: false
                })
                .limit(1)
                .maybeSingle();

            if (otpError) {

                console.error(
                    "OTP FETCH ERROR:",
                    otpError
                );

                return res.status(500).json({
                    success: false,
                    code: "DATABASE_ERROR",
                    message:
                        "Unable to verify OTP."
                });
            }

            if (!otpRecord) {

                return res.status(400).json({
                    success: false,
                    code: "OTP_NOT_FOUND",
                    message:
                        "OTP expired or not found. Please request a new OTP."
                });
            }

            // ----------------------------------------------
            // EXPIRY CHECK
            // ----------------------------------------------

            if (
                new Date(otpRecord.expires_at)
                    .getTime() <
                Date.now()
            ) {

                await supabase
                    .from("otp_codes")
                    .update({
                        verified: true
                    })
                    .eq("id", otpRecord.id);

                return res.status(400).json({
                    success: false,
                    code: "OTP_EXPIRED",
                    message:
                        "OTP has expired. Please request a new OTP."
                });
            }

            // ----------------------------------------------
            // ATTEMPT LIMIT
            // ----------------------------------------------

            const attempts =
                Number(
                    otpRecord.attempts || 0
                );

            if (
                attempts >= MAX_OTP_ATTEMPTS
            ) {

                await supabase
                    .from("otp_codes")
                    .update({
                        verified: true
                    })
                    .eq("id", otpRecord.id);

                return res.status(429).json({
                    success: false,
                    code: "TOO_MANY_ATTEMPTS",
                    message:
                        "Too many incorrect attempts. Please request a new OTP."
                });
            }

            // ----------------------------------------------
            // OTP CHECK
            // ----------------------------------------------

            const suppliedHash =
                hashOtp(cleanOtp);

            if (
                suppliedHash !==
                otpRecord.otp_hash
            ) {

                await supabase
                    .from("otp_codes")
                    .update({
                        attempts: attempts + 1
                    })
                    .eq("id", otpRecord.id);

                return res.status(400).json({
                    success: false,
                    code: "INVALID_OTP",
                    message:
                        "Invalid OTP. Please try again."
                });
            }

            // ----------------------------------------------
            // MARK OTP VERIFIED
            // ----------------------------------------------

            const {
                error: verifyUpdateError
            } = await supabase
                .from("otp_codes")
                .update({
                    verified: true
                })
                .eq("id", otpRecord.id);

            if (verifyUpdateError) {

                console.error(
                    "OTP VERIFY UPDATE ERROR:",
                    verifyUpdateError
                );

                return res.status(500).json({
                    success: false,
                    code: "DATABASE_ERROR",
                    message:
                        "Unable to complete verification."
                });
            }

            // =================================================
            // LOGIN
            // =================================================

            if (flow === "login") {

                const {
                    data: user,
                    error: userError
                } = await supabase
                    .from("users")
                    .select(
                        "id, phone, status"
                    )
                    .eq("phone", cleanPhone)
                    .maybeSingle();

                if (userError) {

                    console.error(
                        "LOGIN USER ERROR:",
                        userError
                    );

                    return res.status(500).json({
                        success: false,
                        code: "DATABASE_ERROR",
                        message:
                            "Unable to load account."
                    });
                }

                if (!user) {

                    return res.status(404).json({
                        success: false,
                        code: "USER_NOT_FOUND",
                        message:
                            "Account not found."
                    });
                }

                if (
                    user.status &&
                    String(user.status).toLowerCase() !==
                        "active"
                ) {

                    return res.status(403).json({
                        success: false,
                        code: "ACCOUNT_DISABLED",
                        message:
                            "Your account is currently disabled."
                    });
                }

                return res.json({
                    success: true,
                    code: "LOGIN_SUCCESS",
                    message:
                        "Login successful.",
                    userId: user.id,
                    redirect: "/"
                });
            }

            // =================================================
            // SIGNUP
            // =================================================

            if (flow === "signup") {

                if (
                    !fullName ||
                    !String(fullName).trim()
                ) {

                    return res.status(400).json({
                        success: false,
                        code: "NAME_REQUIRED",
                        message:
                            "Full name is required."
                    });
                }

                // ---------------------------------------------
                // DOUBLE CHECK USER
                // ---------------------------------------------

                const {
                    data: existingUser,
                    error: existingError
                } = await supabase
                    .from("users")
                    .select("id")
                    .eq("phone", cleanPhone)
                    .maybeSingle();

                if (existingError) {

                    console.error(
                        "SIGNUP FINAL CHECK ERROR:",
                        existingError
                    );

                    return res.status(500).json({
                        success: false,
                        code: "DATABASE_ERROR",
                        message:
                            "Unable to create account."
                    });
                }

                if (existingUser) {

                    return res.status(409).json({
                        success: false,
                        code: "USER_EXISTS",
                        message:
                            "An account with this phone number already exists."
                    });
                }

                // ---------------------------------------------
                // CREATE USER
                // ---------------------------------------------

                const insertData = {
                    phone: cleanPhone,
                    full_name:
                        String(fullName).trim(),
                    status: "active"
                };

                if (
                    email &&
                    String(email).trim()
                ) {
                    insertData.email =
                        String(email).trim();
                }

                if (
                    referralCode &&
                    String(referralCode).trim()
                ) {
                    insertData.referral_code =
                        String(
                            referralCode
                        ).trim();
                }

                const {
                    data: newUser,
                    error: createError
                } = await supabase
                    .from("users")
                    .insert(insertData)
                    .select(
                        "id, phone, status"
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

                return res.json({
                    success: true,
                    code: "SIGNUP_SUCCESS",
                    message:
                        "Account created successfully.",
                    userId: newUser.id,
                    redirect: "/"
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
            code: "SERVER_ERROR",
            message:
                error.message ||
                "Internal server error."
        });
    }
});

module.exports = router;