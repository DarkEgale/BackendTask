import { userRegistration, userLogin } from "../services/auth.service.js";
import {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
} from "../helpers/tokenHelper.js";
import AppError from "../helpers/AppError.js";
import Access from "../models/access.model.js";
import crypto from "crypto";

const generateSsid = () => {
    return crypto.randomBytes(32).toString("hex");
};

const hashToken = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Keep a maximum number of concurrent sessions per user.
 * `ssid` is unique per session, so the limit has to be counted by `userId`
 * — counting by `ssid` would always yield 1 and never trigger.
 */
const enforceSsidLimit = async (userId) => {
    const MAX_SESSIONS = 5;

    const count = await Access.countDocuments({ userId: userId });

    if (count > MAX_SESSIONS) {
        const excessCount = count - MAX_SESSIONS;
        const oldestSessions = await Access.find({ userId: userId })
            .sort({ createdAt: 1 })
            .limit(excessCount)
            .select("_id");

        const oldestIds = oldestSessions.map(session => session._id);

        await Access.deleteMany({
            userId: userId,
            _id: { $in: oldestIds }
        });
    }
};

const setTokenCookies = (res, accessToken, refreshToken) => {
    res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 15 * 60 * 1000
    });

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        // Must match the mounted route (`/api/auth/refresh-session`).
        // A shorter path like "/refresh-session" never matches the request
        // path, so the browser would not send the cookie back.
        path: "/api/auth/refresh-session",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
};

const clearTokenCookies = (res) => {
    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("refreshToken", { path: "/api/auth/refresh-session" });
};

const register = async (req, res, next) => {
    try {
        const user = await userRegistration(req.body);

        const ssid = generateSsid();
        const accessToken = generateAccessToken({ userId: user._id, ssid });
        const refreshToken = generateRefreshToken({ userId: user._id, ssid });

        await Access.create({
            userId: user._id,
            ssid: ssid,
            accessToken: hashToken(accessToken),
            refreshToken: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            isRevoked: false
        });

        await enforceSsidLimit(user._id);

        setTokenCookies(res, accessToken, refreshToken);

        // Populate the interest names so the client can render the chips
        // right away without a second request.
        await user.populate({
            path: "interests",
            select: "name"
        });

        res.status(201).json({
            success: true,
            user: user,
            ssid: ssid
        });
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const user = await userLogin(req.body);

        const ssid = generateSsid();
        const accessToken = generateAccessToken({ userId: user._id, ssid });
        const refreshToken = generateRefreshToken({ userId: user._id, ssid });

        await Access.create({
            userId: user._id,
            ssid: ssid,
            accessToken: hashToken(accessToken),
            refreshToken: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            isRevoked: false
        });

        await enforceSsidLimit(user._id);

        setTokenCookies(res, accessToken, refreshToken);

        // Populate the interest names so the client can render the chips
        // right away without a second request.
        await user.populate({
            path: "interests",
            select: "name"
        });

        res.status(200).json({
            success: true,
            user: user,
            ssid: ssid
        });
    } catch (error) {
        next(error);
    }
};

const refreshToken = async (req, res, next) => {
    try {
        const token = req.cookies.refreshToken;

        if (!token) {
            throw new AppError("Refresh token cookie not found", 401);
        }

        // Step 1: Check signature
        const decoded = verifyRefreshToken(token);
        const ssid = decoded.ssid;

        // Step 2: Check token validity with database
        const session = await Access.findOne({ ssid: ssid, userId: decoded.userId });

        if (!session) {
            throw new AppError("Session not found", 404);
        }

        if (session.isRevoked) {
            throw new AppError("Session is revoked", 401);
        }

        // Compare presented token hash with stored hash
        const presentedHash = hashToken(token);

        if (session.refreshToken !== presentedHash) {
            // Token reuse detected — revoke session
            session.isRevoked = true;
            await session.save();
            throw new AppError("Token reuse detected. Session revoked.", 401);
        }

        // Rotate tokens — generate new pair
        const newAccessToken = generateAccessToken({ userId: decoded.userId, ssid });
        const newRefreshToken = generateRefreshToken({ userId: decoded.userId, ssid });

        session.accessToken = hashToken(newAccessToken);
        session.refreshToken = hashToken(newRefreshToken);
        session.expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await session.save();

        setTokenCookies(res, newAccessToken, newRefreshToken);

        res.status(200).json({
            success: true,
            ssid: ssid
        });
    } catch (error) {
        next(error);
    }
};

const revoke = async (req, res, next) => {
    try {
        const { ssid } = req.body;

        if (!ssid) {
            throw new AppError("SSID is required", 400);
        }

        // A session may only be revoked by its owner (or by an admin).
        // Without this check any authenticated user could revoke someone
        // else's session by passing an arbitrary ssid.
        const session = await Access.findOne({ ssid: ssid });

        if (!session) {
            throw new AppError("Session not found", 404);
        }

        const isOwner = session.userId.toString() === req.user._id.toString();

        if (!isOwner && req.user.role !== "admin") {
            throw new AppError("You can only revoke your own session", 403);
        }

        session.isRevoked = true;
        await session.save();

        // Only clear the cookies when revoking the current session
        if (isOwner) {
            clearTokenCookies(res);
        }

        res.status(200).json({
            success: true,
            message: "Session revoked successfully"
        });
    } catch (error) {
        next(error);
    }
};

export { register, login, refreshToken, revoke };
