import dotenv from "dotenv";
import crypto from "crypto";
import AppError from "../helpers/AppError.js";
import Users from "../models/user.model.js";
import Access from "../models/access.model.js";
import { verifyAccessToken } from "../helpers/tokenHelper.js";

dotenv.config();

/**
 * Extract the access token from the request.
 * Supports both the HTTP-only cookie (set on register/login) and the
 * `Authorization: Bearer <token>` header, so browser and API clients
 * can both authenticate.
 */
const extractToken = (req) => {
    const header = req.headers.authorization;

    if (header && header.startsWith("Bearer ")) {
        return header.slice(7).trim();
    }

    return req.cookies?.accessToken || null;
};

/**
 * authenticate([...roles])
 *
 * Verifies the access token, confirms the session is still valid in the
 * database (so revoked sessions stop working immediately) and — when roles
 * are supplied — enforces role based access control.
 *
 * Usage:
 *   authenticate                -> any logged in user
 *   authenticate("admin")       -> admins only
 *   authenticate("user","admin")-> both roles
 */
const authenticate = (...roles) => {
    return async (req, res, next) => {
        try {
            const token = extractToken(req);

            if (!token) {
                throw new AppError("No token provided", 401);
            }

            // Step 1: Check signature (throws AppError 401 on failure)
            const decoded = verifyAccessToken(token);

            // Step 2: Check token validity with database
            const session = await Access.findOne({
                ssid: decoded.ssid,
                userId: decoded.userId,
                isRevoked: false
            });

            if (!session) {
                throw new AppError("Session invalid or revoked", 401);
            }

            // Step 3: Check access token hash matches
            const presentedHash = crypto.createHash("sha256").update(token).digest("hex");

            if (session.accessToken !== presentedHash) {
                throw new AppError("Token mismatch", 401);
            }

            // Attach user info to request
            const user = await Users.findById(decoded.userId);

            if (!user) {
                throw new AppError("User not found", 404);
            }

            req.user = user;
            req.ssid = decoded.ssid;

            // Role based access control
            if (roles.length > 0 && !roles.includes(user.role)) {
                throw new AppError("You do not have permission to perform this action", 403);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

export { authenticate };
