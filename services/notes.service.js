import mongoose from "mongoose";
import Notes from "../models/notes.model.js";
import AppError from "../helpers/AppError.js";

const createNote = async (data) => {
    try {
        const { title, notes, userId } = data;

        if (!title || !notes || !userId) {
            throw new AppError("Title, notes and userId are required", 400);
        } else {
            const note = await Notes.create({
                title: title,
                notes: notes,
                userId: userId,
                status: "active"
            });

            return note;
        }
    } catch (error) {
        throw error;
    }
};

const getNotes = async (data) => {
    try {
        const { userId, page = 1, limit = 10, isAdmin = false } = data;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        if (!userId && !isAdmin) {
            throw new AppError("User id is required", 400);
        }

        const matchStage = isAdmin ? {} : { userId: new mongoose.Types.ObjectId(userId) };

        const notes = await Notes.aggregate([
            // Step 1: Match notes (admin sees all, user sees own)
            { $match: matchStage },
            // Step 2: Lookup user details from Users collection
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "userInfo"
                }
            },
            // Step 3: Unwind userInfo array
            { $unwind: "$userInfo" },
            // Step 4: Sort by createdAt descending
            { $sort: { createdAt: -1 } },
            // Step 5: Pagination
            { $skip: skip },
            { $limit: parseInt(limit) },
            // Step 6: Project output format (exclude password)
            {
                $project: {
                    _id: 1,
                    title: 1,
                    notes: 1,
                    status: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    user: {
                        _id: "$userInfo._id",
                        name: "$userInfo.name",
                        email: "$userInfo.email",
                        role: "$userInfo.role"
                    }
                }
            }
        ]);

        const total = await Notes.countDocuments(matchStage);

        return {
            notes,
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

const getNoteById = async (data) => {
    try {
        const { noteId, userId, isAdmin = false } = data;

        if (!noteId || (!userId && !isAdmin)) {
            throw new AppError("Note id and user id are required", 400);
        }

        const matchStage = isAdmin ? { _id: noteId } : { _id: noteId, userId: userId };

        const note = await Notes.findOne(matchStage);

        if (!note) {
            throw new AppError("Note not found", 404);
        }

        return note;
    } catch (error) {
        throw error;
    }
};

const updateNote = async (data) => {
    try {
        const { noteId, userId, title, notes, status, isAdmin = false } = data;

        if (!noteId || (!userId && !isAdmin)) {
            throw new AppError("Note id and user id are required", 400);
        }

        const matchStage = isAdmin ? { _id: noteId } : { _id: noteId, userId: userId };

        const note = await Notes.findOne(matchStage);

        if (!note) {
            throw new AppError("Note not found", 404);
        }

        const updateData = {};

        if (title) {
            updateData.title = title;
        }

        if (notes) {
            updateData.notes = notes;
        }

        if (status) {
            updateData.status = status;
        }

        const updatedNote = await Notes.findOneAndUpdate(
            matchStage,
            { $set: updateData },
            { returnDocument: "after" }
        );

        return updatedNote;
    } catch (error) {
        throw error;
    }
};

const deleteNote = async (data) => {
    try {
        const { noteId, userId, isAdmin = false } = data;

        if (!noteId || (!userId && !isAdmin)) {
            throw new AppError("Note id and user id are required", 400);
        }

        const matchStage = isAdmin ? { _id: noteId } : { _id: noteId, userId: userId };

        const note = await Notes.findOneAndDelete(matchStage);

        if (!note) {
            throw new AppError("Note not found", 404);
        }

        return note;
    } catch (error) {
        throw error;
    }
};

export { createNote, getNotes, getNoteById, updateNote, deleteNote };
