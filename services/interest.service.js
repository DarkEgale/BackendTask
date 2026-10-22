import Interest from "../models/interest.model.js";
import Users from "../models/user.model.js";
import AppError from "../helpers/AppError.js";

// A user may not select an unlimited number of interests.
const MAX_INTERESTS_PER_USER = 20;

const MAX_INTEREST_NAME_LENGTH = 50;

/**
 * Escape a user supplied string so it can safely be used inside a
 * RegExp. Without this, a name like "c++" would throw an invalid
 * regular expression error.
 */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Trim and collapse whitespace. Returns null when nothing usable is left.
 */
const normalizeInterestName = (name) => {
    if (typeof name !== "string") return null;

    const trimmed = name.trim().replace(/\s+/g, " ");

    return trimmed.length > 0 ? trimmed : null;
};

const isValidObjectId = (value) =>
    typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);

/**
 * List the global interest catalog.
 */
const getAllInterests = async (data) => {
    try {
        const { page = 1, limit = 20, search = "" } = data;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const filter = {};

        if (search) {
            filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
        }

        const interests = await Interest.find(filter)
            .sort({ name: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Interest.countDocuments(filter);

        return {
            interests,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Look up an interest by its id.
 */
const getInterestById = async (data) => {
    try {
        const { interestId } = data;

        if (!interestId) {
            throw new AppError("Interest id is required", 400);
        }

        const interest = await Interest.findById(interestId);

        if (!interest) {
            throw new AppError("Interest not found", 404);
        }

        return interest;
    } catch (error) {
        throw error;
    }
};

/**
 * Find an existing interest by name (case insensitive) or create it.
 *
 * This is what allows a user to type a brand new interest of their own
 * instead of being limited to the pre-seeded catalog.
 */
const findOrCreateInterest = async (name) => {
    try {
        const cleanName = normalizeInterestName(name);

        if (!cleanName) {
            throw new AppError("Interest name is required", 400);
        }

        if (cleanName.length > MAX_INTEREST_NAME_LENGTH) {
            throw new AppError(`Interest name must be at most ${MAX_INTEREST_NAME_LENGTH} characters long`, 400);
        }

        // Case insensitive lookup first — "web development" and
        // "Web Development" should resolve to the same interest.
        let interest = await Interest.findOne({
            name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" }
        });

        if (interest) return interest;

        try {
            interest = await Interest.create({ name: cleanName });
        } catch (error) {
            // Two concurrent requests may try to create the same name.
            // The unique index rejects the loser — re-read the winner.
            if (error.code === 11000) {
                const existing = await Interest.findOne({
                    name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" }
                });

                if (existing) return existing;
            }

            throw error;
        }

        return interest;
    } catch (error) {
        throw error;
    }
};



/**
 * Resolve a list of interests supplied as ids OR names.
 * Unknown ids raise 404, unknown names create the interest.
 */
const resolveInterests = async (interests) => {
    try {
        if (!Array.isArray(interests)) {
            throw new AppError("Interests must be an array", 400);
        }

        if (interests.length > MAX_INTERESTS_PER_USER) {
            throw new AppError(`You can select at most ${MAX_INTERESTS_PER_USER} interests`, 400);
        }

        const resolved = [];

        for (const entry of interests) {
            if (isValidObjectId(entry)) {
                const existing = await Interest.findById(entry);

                if (!existing) {
                    throw new AppError("Interest not found", 404);
                }

                resolved.push(existing);
            } else {
                resolved.push(await findOrCreateInterest(entry));
            }
        }

        // Remove duplicates while keeping the original order.
        const unique = resolved.filter(
            (interest, index) =>
                resolved.findIndex(i => i._id.toString() === interest._id.toString()) === index
        );

        return unique;
    } catch (error) {
        throw error;
    }
};


/**
 * Add a single interest to the authenticated user's own profile.
 */
const addInterestToUser = async (data) => {
    try {
        const { userId, interestId, name } = data;

        if (!userId) {
            throw new AppError("User id is required", 400);
        }

        if (!interestId && !name) {
            throw new AppError("Interest id or name is required", 400);
        }

        const user = await Users.findById(userId);

        if (!user) {
            throw new AppError("User not found", 404);
        }

        const interest = interestId
            ? await getInterestById({ interestId })
            : await findOrCreateInterest(name);

        const alreadyAdded = user.interests.some(
            id => id.toString() === interest._id.toString()
        );

        if (alreadyAdded) {
            throw new AppError("Interest already added", 409);
        }

        if (user.interests.length >= MAX_INTERESTS_PER_USER) {
            throw new AppError(`You can select at most ${MAX_INTERESTS_PER_USER} interests`, 400);
        }

        user.interests.push(interest._id);
        await user.save();

        return {
            user,
            interest
        };
    } catch (error) {
        throw error;
    }
};


/**
 * Remove one of the authenticated user's own interests.
 */
const removeInterestFromUser = async (data) => {
    try {
        const { userId, interestId } = data;

        if (!userId) {
            throw new AppError("User id is required", 400);
        }

        if (!interestId) {
            throw new AppError("Interest id is required", 400);
        }

        const user = await Users.findById(userId);

        if (!user) {
            throw new AppError("User not found", 404);
        }

        const before = user.interests.length;

        user.interests = user.interests.filter(
            id => id.toString() !== interestId.toString()
        );

        if (user.interests.length === before) {
            throw new AppError("Interest not found on your profile", 404);
        }

        await user.save();

        return user;
    } catch (error) {
        throw error;
    }
};


/**
 * Rename an interest in the global catalog.
 *
 * This is the ADMIN level operation: the interest document is shared by every
 * user that has it, so renaming it here changes the name for all of them.
 */
const updateInterest = async (data) => {
    try {
        const { interestId, name } = data;

        if (!interestId) {
            throw new AppError("Interest id is required", 400);
        }

        const cleanName = normalizeInterestName(name);

        if (!cleanName) {
            throw new AppError("Interest name is required", 400);
        }

        if (cleanName.length > MAX_INTEREST_NAME_LENGTH) {
            throw new AppError(`Interest name must be at most ${MAX_INTEREST_NAME_LENGTH} characters long`, 400);
        }

        const interest = await Interest.findById(interestId);

        if (!interest) {
            throw new AppError("Interest not found", 404);
        }

        // Another interest must not already carry this name.
        const duplicate = await Interest.findOne({
            _id: { $ne: interest._id },
            name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" }
        });

        if (duplicate) {
            throw new AppError("Interest with this name already exists", 409);
        }

        interest.name = cleanName;

        try {
            await interest.save();
        } catch (error) {
            // The unique index rejected a concurrent rename.
            if (error.code === 11000) {
                throw new AppError("Interest with this name already exists", 409);
            }

            throw error;
        }

        return interest;
    } catch (error) {
        throw error;
    }
};


/**
 * Rename one of the authenticated user's OWN interests.
 *
 * Interests are a shared catalog, so renaming the underlying document would
 * silently change the name for every other user that has it. To keep the
 * operation isolated to the caller:
 *
 *  - if nobody else uses the interest, it is renamed in place (no leftover);
 *  - otherwise the caller is moved onto a separate interest carrying the new
 *    name and the old one is detached from their profile.
 */
const updateUserInterest = async (data) => {
    try {
        const { userId, interestId, name } = data;

        if (!userId) {
            throw new AppError("User id is required", 400);
        }

        if (!interestId) {
            throw new AppError("Interest id is required", 400);
        }

        const cleanName = normalizeInterestName(name);

        if (!cleanName) {
            throw new AppError("Interest name is required", 400);
        }

        if (cleanName.length > MAX_INTEREST_NAME_LENGTH) {
            throw new AppError(`Interest name must be at most ${MAX_INTEREST_NAME_LENGTH} characters long`, 400);
        }

        const user = await Users.findById(userId);

        if (!user) {
            throw new AppError("User not found", 404);
        }

        const current = await Interest.findById(interestId);

        if (!current) {
            throw new AppError("Interest not found", 404);
        }

        const hasCurrent = user.interests.some(
            id => id.toString() === interestId.toString()
        );

        if (!hasCurrent) {
            throw new AppError("Interest not found on your profile", 404);
        }

        // Does a different interest already carry the new name?
        const existingWithName = await Interest.findOne({
            _id: { $ne: current._id },
            name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" }
        });

        // Is anybody else using the interest that is being renamed?
        const otherUsers = await Users.countDocuments({
            interests: current._id,
            _id: { $ne: user._id }
        });

        // Case 1 — the caller is the only owner and the new name is free:
        // rename in place so no orphan is left in the catalog.
        if (!existingWithName && otherUsers === 0) {
            current.name = cleanName;

            try {
                await current.save();
            } catch (error) {
                if (error.code === 11000) {
                    throw new AppError("Interest with this name already exists", 409);
                }

                throw error;
            }

            return { user, interest: current };
        }

        // Case 2 — the name is already taken by another interest, or the
        // interest is shared: move the caller onto the interest carrying the
        // new name and detach the old one.
        const target = existingWithName || (await findOrCreateInterest(cleanName));

        if (target._id.toString() === current._id.toString()) {
            // Only the casing / spacing differs — rename in place.
            current.name = cleanName;

            try {
                await current.save();
            } catch (error) {
                if (error.code === 11000) {
                    throw new AppError("Interest with this name already exists", 409);
                }

                throw error;
            }

            return { user, interest: current };
        }

        const alreadyHas = user.interests.some(
            id => id.toString() === target._id.toString()
        );

        if (alreadyHas) {
            throw new AppError("You already have an interest with this name", 409);
        }

        user.interests = user.interests.map(id =>
            id.toString() === interestId.toString() ? target._id : id
        );

        await user.save();

        return { user, interest: target };
    } catch (error) {
        throw error;
    }
};


/**
 * List the authenticated user's own interests.
 */
const getUserInterests = async (data) => {
    try {
        const { userId } = data;

        if (!userId) {
            throw new AppError("User id is required", 400);
        }

        const user = await Users.findById(userId)
            .select("-password")
            .populate({
                path: "interests",
                select: "name createdAt updatedAt"
            });

        if (!user) {
            throw new AppError("User not found", 404);
        }

        return user.interests;
    } catch (error) {
        throw error;
    }
};

export {
    MAX_INTERESTS_PER_USER,
    MAX_INTEREST_NAME_LENGTH,
    getAllInterests,
    getInterestById,
    findOrCreateInterest,
    resolveInterests,
    addInterestToUser,
    removeInterestFromUser,
    updateInterest,
    updateUserInterest,
    getUserInterests
};
