import mongoose from "mongoose";
import Users from "../models/user.model.js";
import Interest from "../models/interest.model.js";
import Post from "../models/post.model.js";
import AppError from "../helpers/AppError.js";
import bcrypt from "bcryptjs";
import { resolveInterests } from "./interest.service.js";

const updateOwnPassword = async (data) => {
    try {
        const { userId, oldPassword, newPassword } = data;

        if (!userId || !oldPassword || !newPassword) {
            throw new AppError("User id, old password and new password are required", 400);
        } else {
            // `password` is declared with `select: false` on the schema, so it
            // must be explicitly requested here to run the password comparison.
            const user = await Users.findById(userId).select("+password");

            if (!user) {
                throw new AppError("User not found", 404);
            } else {
                const isPasswordMatch = await user.comparePassword(oldPassword);

                if (!isPasswordMatch) {
                    throw new AppError("Old password is incorrect", 401);
                } else if (newPassword.length < 6) {
                    throw new AppError("New password must be at least 6 characters long", 400);
                } else {
                    user.password = newPassword;
                    await user.save();

                    return user;
                }
            }
        }
    } catch (error) {
        throw error;
    }
};

const getAllUsers = async (data) => {
    try {
        const { page = 1, limit = 10 } = data;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const users = await Users.find()
            .select("-password")
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await Users.countDocuments();

        return {
            users,
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

const getUserById = async (data) => {
    try {
        const { userId } = data;

        if (!userId) {
            throw new AppError("User id is required", 400);
        }

        const user = await Users.findById(userId).select("-password");

        if (!user) {
            throw new AppError("User not found", 404);
        }

        return user;
    } catch (error) {
        throw error;
    }
};

const updateUser = async (data) => {
    try {
        const { userId, name, email, role, interests } = data;

        if (!userId) {
            throw new AppError("User id is required", 400);
        }

        const user = await Users.findById(userId);

        if (!user) {
            throw new AppError("User not found", 404);
        } else {
            const updateData = {};

            if (name) {
                updateData.name = name;
            }

            if (email) {
                updateData.email = email;
            }

            if (role) {
                updateData.role = role;
            }

            if (interests) {
                // Interests may be given as ids OR as names. Unknown names are
                // created on the fly so a user can add their own interest.
                const resolved = await resolveInterests(interests);
                updateData.interests = resolved.map(interest => interest._id);
            }

            const updatedUser = await Users.findByIdAndUpdate(
                userId,
                { $set: updateData },
                { returnDocument: "after" }
            ).select("-password");

            return updatedUser;
        }
    } catch (error) {
        throw error;
    }
};

const deleteUser = async (data) => {
    try {
        const { userId } = data;

        if (!userId) {
            throw new AppError("User id is required", 400);
        }

        const user = await Users.findByIdAndDelete(userId);

        if (!user) {
            throw new AppError("User not found", 404);
        }

        return user;
    } catch (error) {
        throw error;
    }
};

const getUsersGroupedByInterest = async (data) => {
    try {
        const { page = 1, limit = 10 } = data;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const users = await Users.aggregate([
            // Step 1: First $unwind the interests array
            { $unwind: "$interests" },
            // Step 2: Look up the interest document so the group can carry
            // a human readable name alongside the raw id.
            {
                $lookup: {
                    from: "interests",
                    localField: "interests",
                    foreignField: "_id",
                    as: "interestDoc"
                }
            },
            // Step 3: Group by interest ID and use $addToSet to remove duplicates
            {
                $group: {
                    _id: "$interests",
                    name: { $first: { $arrayElemAt: ["$interestDoc.name", 0] } },
                    users: {
                        $addToSet: {
                            _id: "$_id",
                            name: "$name",
                            email: "$email",
                            role: "$role"
                        }
                    }
                }
            },
            // Step 4: Sort by interest ID
            { $sort: { _id: 1 } },
            // Step 5: Pagination
            { $skip: skip },
            { $limit: parseInt(limit) },
            // Step 6: Project output format
            {
                $project: {
                    _id: 0,
                    interest: "$_id",
                    name: 1,
                    users: 1
                }
            }
        ]);

        return users;
    } catch (error) {
        throw error;
    }
};

const getUserPosts = async (data) => {
    try {
        const { userId, page = 1, limit = 10 } = data;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        if (!userId) {
            throw new AppError("User id is required", 400);
        }

        const posts = await Users.aggregate([
            // Step 1: Match the specific user
            { $match: { _id: new mongoose.Types.ObjectId(userId) } },
            // Step 2: Lookup posts from Post collection
            {
                $lookup: {
                    from: "posts",
                    localField: "_id",
                    foreignField: "userId",
                    as: "posts"
                }
            },
            // Step 3: Unwind posts array
            { $unwind: "$posts" },
            // Step 4: Sort posts by createdAt descending
            { $sort: { "posts.createdAt": -1 } },
            // Step 5: Pagination
            { $skip: skip },
            { $limit: parseInt(limit) },
            // Step 6: Project output format
            {
                $project: {
                    _id: 0,
                    userId: "$_id",
                    name: "$name",
                    email: "$email",
                    post: {
                        _id: "$posts._id",
                        title: "$posts.title",
                        content: "$posts.content",
                        status: "$posts.status",
                        createdAt: "$posts.createdAt",
                        updatedAt: "$posts.updatedAt"
                    }
                }
            }
        ]);

        return posts;
    } catch (error) {
        throw error;
    }
};

export { updateOwnPassword, getAllUsers, getUserById, updateUser, deleteUser, getUsersGroupedByInterest, getUserPosts };
