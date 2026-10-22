import express from "express";
import {
    getInterests, getInterest, updateInterest
} from "../controllers/interests.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

// The interest catalog is public so a sign-up form can offer suggestions
// before the user has a token.
router.get("/interests", getInterests);

router.get("/interests/:interestId", authenticate(), getInterest);

// Renaming an interest in the shared catalog affects every user that has it,
// so it is restricted to admins.
router.put("/interests/:interestId", authenticate("admin"), updateInterest);

export default router;