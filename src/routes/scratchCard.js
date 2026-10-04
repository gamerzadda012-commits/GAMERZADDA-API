const express = require("express");
const supabase = require("../config/supabase");

const {
  checkUserRestriction,
  restrictionResponse
} = require("../utils/userRestrictions");

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

/*
|--------------------------------------------------------------------------
| GET SCRATCH CARD DASHBOARD
|--------------------------------------------------------------------------
| Dashboard remains accessible even when Scratch Card is restricted.
*/
router.get("/scratch-card/:userId", async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();

    if (!isUuid(userId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid user ID."
      });
    }

    const { data, error } = await supabase.rpc(
      "get_scratch_card_dashboard",
      {
        p_user_id: userId
      }
    );

    if (error) {
      console.error(
        "SCRATCH DASHBOARD RPC ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error: "Unable to load Scratch Card data."
      });
    }

    return res.json(data);
  } catch (error) {
    console.error(
      "Scratch dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error."
    });
  }
});

/*
|--------------------------------------------------------------------------
| POST SCRATCH CARD CLAIM
|--------------------------------------------------------------------------
| Restriction is checked BEFORE scratch_card_claim RPC.
*/
router.post(
  "/scratch-card/:userId/claim",
  async (req, res) => {
    try {
      const userId = String(
        req.params.userId || ""
      ).trim();

      const cardId = String(
        req.body?.cardId || ""
      ).trim();

      if (!isUuid(userId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid user ID."
        });
      }

      if (!isUuid(cardId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid Scratch Card ID."
        });
      }

      /*
       * Check:
       * 1. full_app restriction
       * 2. scratch_card restriction
       */
      const restrictionCheck =
        await checkUserRestriction(
          userId,
          "scratch_card"
        );

      if (restrictionCheck.restricted) {
        return restrictionResponse(
          res,
          restrictionCheck.feature,
          restrictionCheck.restriction
        );
      }

      /*
       * Server-authoritative Scratch Card claim.
       */
      const { data, error } =
        await supabase.rpc(
          "scratch_card_claim",
          {
            p_user_id: userId,
            p_card_id: cardId
          }
        );

      if (error) {
        console.error(
          "SCRATCH CLAIM RPC ERROR:",
          error
        );

        const message = String(
          error.message || ""
        ).toLowerCase();

        if (message.includes("expired")) {
          return res.status(409).json({
            success: false,
            error:
              "This Scratch Card has expired."
          });
        }

        if (
          message.includes(
            "already been used"
          )
        ) {
          return res.status(409).json({
            success: false,
            error:
              "This Scratch Card has already been used."
          });
        }

        if (message.includes("not found")) {
          return res.status(404).json({
            success: false,
            error:
              "Scratch Card not found."
          });
        }

        if (
          message.includes(
            "wallet not found"
          )
        ) {
          return res.status(404).json({
            success: false,
            error:
              "Wallet not found for your account."
          });
        }

        return res.status(500).json({
          success: false,
          error:
            "Unable to scratch the card. Your wallet was not changed."
        });
      }

      return res.json(data);
    } catch (error) {
      console.error(
        "Scratch claim error:",
        error
      );

      return res.status(500).json({
        success: false,
        error: "Internal server error."
      });
    }
  }
);

module.exports = router;