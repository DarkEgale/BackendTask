import express from "express";
import rateLimit from "express-rate-limit";
import { register, login, refreshToken, revoke } from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Brute-force protection for the credential endpoints.
// `skipSuccessfulRequests` means only FAILED attempts count towards the limit,
// so legitimate repeated logins are never throttled.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many failed login attempts, please try again later"
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    // Only enabled in production: behind a shared/NAT IP (office, school)
    // a strict cap would block legitimate sign-ups.
    skip: () => process.env.NODE_ENV !== "production",
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many accounts created from this device, please try again later"
    }
});

router.post("/register", registerLimiter, register);

router.post("/login", loginLimiter, login);

router.post("/refresh-session", refreshToken);

router.post("/revoke", authenticate(), revoke);

export default router;
