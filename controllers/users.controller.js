import { updateOwnPassword, getAllUsers, getUserById, updateUser, deleteUser, getUsersGroupedByInterest as getUsersGroupedByInterestService, getUserPosts as getUserPostsService } from "../services/users.service.js";
import AppError from "../helpers/AppError.js";

const updatePassword = async (req, res, next) => {
    try {
        const data = {
            userId: req.user._id,
            oldPassword: req.body.oldPassword,
            newPassword: req.body.newPassword
        };

        const user = await updateOwnPassword(data);

        res.status(200).json({
            success: true,
            message: "Password updated successfully",
            user: user
        });
    } catch (error) {
        next(error);
    }
};

const getUsers = async (req, res, next) => {
    try {
        const data = {
            page: req.query.page,
            limit: req.query.limit
        };

        const result = await getAllUsers(data);

        res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        next(error);
    }
};

const getUser = async (req, res, next) => {
    try {
        const data = {
            userId: req.params.userId
        };

        const user = await getUserById(data);

        res.status(200).json({
            success: true,
            user: user
        });
    } catch (error) {
        next(error);
    }
};

const updateUsers = async (req, res, next) => {
    try {
        const data = {
            userId: req.params.userId,
            name: req.body.name,
            email: req.body.email,
            role: req.body.role,
            interests: req.body.interests
        };

        const user = await updateUser(data);

        res.status(200).json({
            success: true,
            message: "User updated successfully",
            user: user
        });
    } catch (error) {
        next(error);
    }
};

const deleteUsers = async (req, res, next) => {
    try {
        const data = {
            userId: req.params.userId
        };

        await deleteUser(data);

        res.status(200).json({
            success: true,
            message: "User deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

const getUsersGroupedByInterest = async (req, res, next) => {
    try {
        const data = {
            page: req.query.page,
            limit: req.query.limit
        };

        const users = await getUsersGroupedByInterestService(data);

        res.status(200).json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (error) {
        next(error);
    }
};

const getUserPosts = async (req, res, next) => {
    try {
        const userId = req.params.userId;

        // A user may only read their own posts; admins may read anyone's.
        if (req.user.role !== "admin" && userId !== req.user._id.toString()) {
            throw new AppError("You can only access your own posts", 403);
        }

        const data = {
            userId: userId,
            page: req.query.page,
            limit: req.query.limit
        };

        const posts = await getUserPostsService(data);

        res.status(200).json({
            success: true,
            count: posts.length,
            posts: posts
        });
    } catch (error) {
        next(error);
    }
};

export { updatePassword, getUsers, getUser, updateUsers, deleteUsers, getUsersGroupedByInterest, getUserPosts };
