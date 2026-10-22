import {
    getAllInterests as getAllInterestsService,
    getInterestById as getInterestByIdService,
    addInterestToUser as addInterestToUserService,
    removeInterestFromUser as removeInterestFromUserService,
    updateInterest as updateInterestService,
    updateUserInterest as updateUserInterestService,
    getUserInterests as getUserInterestsService
} from "../services/interest.service.js";

/**
 * GET /api/interests
 * List the global interest catalog (optionally filtered by ?search=).
 */
const getInterests = async (req, res, next) => {
    try {
        const data = {
            page: req.query.page,
            limit: req.query.limit,
            search: req.query.search
        };

        const result = await getAllInterestsService(data);

        res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/interests/:interestId
 */
const getInterest = async (req, res, next) => {
    try {
        const data = {
            interestId: req.params.interestId
        };

        const interest = await getInterestByIdService(data);

        res.status(200).json({
            success: true,
            interest: interest
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/users/me/interests
 * Add an interest to the authenticated user's own profile.
 * Body: { "name": "Chess" } or { "interestId": "<id>" }
 */
const addInterest = async (req, res, next) => {
    try {
        const data = {
            userId: req.user._id,
            interestId: req.body.interestId,
            name: req.body.name
        };

        const { user, interest } = await addInterestToUserService(data);

        res.status(201).json({
            success: true,
            message: "Interest added successfully",
            interest: interest,
            user: user
        });
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /api/users/me/interests/:interestId
 */
const removeInterest = async (req, res, next) => {
    try {
        const data = {
            userId: req.user._id,
            interestId: req.params.interestId
        };

        const user = await removeInterestFromUserService(data);

        res.status(200).json({
            success: true,
            message: "Interest removed successfully",
            user: user
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/users/me/interests
 */
const getMyInterests = async (req, res, next) => {
    try {
        const data = {
            userId: req.user._id
        };

        const interests = await getUserInterestsService(data);

        res.status(200).json({
            success: true,
            count: interests.length,
            interests: interests
        });
    } catch (error) {
        next(error);
    }
};


/**
 * PUT /api/interests/:interestId  (admin)
 * Rename an interest in the global catalog.
 * Body: { "name": "Board Games" }
 */
const updateInterest = async (req, res, next) => {
    try {
        const data = {
            interestId: req.params.interestId,
            name: req.body.name
        };

        const interest = await updateInterestService(data);

        res.status(200).json({
            success: true,
            message: "Interest updated successfully",
            interest: interest
        });
    } catch (error) {
        next(error);
    }
};


/**
 * PUT /api/users/me/interests/:interestId
 * Rename one of the authenticated user's own interests.
 * Body: { "name": "Board Games" }
 */
const updateMyInterest = async (req, res, next) => {
    try {
        const data = {
            userId: req.user._id,
            interestId: req.params.interestId,
            name: req.body.name
        };

        const { user, interest } = await updateUserInterestService(data);

        res.status(200).json({
            success: true,
            message: "Interest updated successfully",
            interest: interest,
            user: user
        });
    } catch (error) {
        next(error);
    }
};

export {
    getInterests,
    getInterest,
    addInterest,
    removeInterest,
    getMyInterests,
    updateInterest,
    updateMyInterest
};
