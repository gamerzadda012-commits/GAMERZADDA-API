const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");

router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required"
            });
        }

        const { data: user, error: userError } =
            await supabase
                .from("users")
                .select(
                    "id, full_name, referral_code, referred_by, status"
                )
                .eq("id", userId)
                .maybeSingle();

        if (userError) {
            console.error(
                "REFERRAL USER ERROR:",
                userError
            );

            return res.status(500).json({
                success: false,
                message: userError.message
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (
            user.status &&
            String(user.status).toLowerCase() !== "active"
        ) {
            return res.status(403).json({
                success: false,
                message: "Your account is currently disabled."
            });
        }

        const {
            data: referredUsers,
            error: referredError
        } = await supabase
            .from("users")
            .select(
                "id, full_name, referral_code, created_at, status"
            )
            .eq("referred_by", userId)
            .order("created_at", {
                ascending: false
            });

        if (referredError) {
            console.error(
                "REFERRED USERS ERROR:",
                referredError
            );

            return res.status(500).json({
                success: false,
                message: referredError.message
            });
        }

        const referredIds =
            (referredUsers || [])
                .map((item) => item.id)
                .filter(Boolean);

        let rewardTransactions = [];

        if (referredIds.length > 0) {
            const {
                data,
                error
            } = await supabase
                .from("wallet_transactions")
                .select(
                    "id, user_id, amount, type, description, reference_id, created_at, status"
                )
                .eq(
                    "user_id",
                    userId
                )
                .eq(
                    "type",
                    "referral_signup_reward"
                )
                .in(
                    "reference_id",
                    referredIds
                )
                .order("created_at", {
                    ascending: false
                });

            if (error) {
                console.error(
                    "REFERRAL REWARD TRANSACTIONS ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }

            rewardTransactions = data || [];
        }

        const rewardMap = new Map();

        for (const transaction of rewardTransactions) {
            const referenceId =
                String(
                    transaction.reference_id || ""
                );

            if (!referenceId) {
                continue;
            }

            if (!rewardMap.has(referenceId)) {
                rewardMap.set(
                    referenceId,
                    []
                );
            }

            rewardMap
                .get(referenceId)
                .push(transaction);
        }

        let totalEarnings = 0;

        const referrals =
            (referredUsers || []).map((refUser) => {

                const rewards =
                    rewardMap.get(
                        String(refUser.id)
                    ) || [];

                const earned =
                    rewards.reduce(
                        (sum, reward) =>
                            sum +
                            Number(
                                reward.amount || 0
                            ),
                        0
                    );

                totalEarnings += earned;

                return {
                    id: refUser.id,

                    name:
                        refUser.full_name &&
                        String(
                            refUser.full_name
                        ).trim()
                            ? String(
                                refUser.full_name
                            ).trim()
                            : "Gamer",

                    referralCode:
                        refUser.referral_code || "",

                    createdAt:
                        refUser.created_at || null,

                    status:
                        refUser.status &&
                        String(
                            refUser.status
                        ).toLowerCase() ===
                            "active"
                            ? "Joined"
                            : "Inactive",

                    earned:
                        Number(
                            earned.toFixed(2)
                        ),

                    rewards:
                        rewards.map(
                            (reward) => ({
                                id:
                                    reward.id,

                                amount:
                                    Number(
                                        reward.amount || 0
                                    ),

                                type:
                                    reward.type,

                                description:
                                    reward.description ||
                                    "",

                                referenceId:
                                    reward.reference_id ||
                                    null,

                                status:
                                    reward.status ||
                                    "SUCCESS",

                                createdAt:
                                    reward.created_at ||
                                    null
                            })
                        )
                };
            });

        return res.status(200).json({
            success: true,

            referralCode:
                user.referral_code || "",

            totalReferrals:
                referrals.length,

            totalEarnings:
                Number(
                    totalEarnings.toFixed(2)
                ),

            signupRewards:
                Number(
                    totalEarnings.toFixed(2)
                ),

            tournamentRewards: 0,

            depositRewards: 0,

            referrals
        });

    } catch (error) {
        console.error(
            "REFERRAL API ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                error?.message ||
                "Internal server error"
        });
    }
});

module.exports = router;
