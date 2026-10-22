import { createNote, getNotes, getNoteById, updateNote, deleteNote } from "../services/notes.service.js";
import AppError from "../helpers/AppError.js";

const createNotes = async (req, res, next) => {
    try {
        const data = {
            title: req.body.title,
            notes: req.body.notes,
            userId: req.user._id
        };

        const note = await createNote(data);

        res.status(201).json({
            success: true,
            message: "Note created successfully",
            note: note
        });
    } catch (error) {
        next(error);
    }
};

const getAllNotes = async (req, res, next) => {
    try {
        const data = {
            userId: req.user._id,
            page: req.query.page,
            limit: req.query.limit,
            isAdmin: req.user.role === "admin"
        };

        const result = await getNotes(data);

        res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        next(error);
    }
};

const getSingleNote = async (req, res, next) => {
    try {
        const data = {
            noteId: req.params.noteId,
            userId: req.user._id,
            isAdmin: req.user.role === "admin"
        };

        const note = await getNoteById(data);

        res.status(200).json({
            success: true,
            note: note
        });
    } catch (error) {
        next(error);
    }
};

const updateNotes = async (req, res, next) => {
    try {
        const data = {
            noteId: req.params.noteId,
            userId: req.user._id,
            title: req.body.title,
            notes: req.body.notes,
            status: req.body.status,
            isAdmin: req.user.role === "admin"
        };

        const note = await updateNote(data);

        res.status(200).json({
            success: true,
            message: "Note updated successfully",
            note: note
        });
    } catch (error) {
        next(error);
    }
};

const deleteNotes = async (req, res, next) => {
    try {
        const data = {
            noteId: req.params.noteId,
            userId: req.user._id,
            isAdmin: req.user.role === "admin"
        };

        await deleteNote(data);

        res.status(200).json({
            success: true,
            message: "Note deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

export { createNotes, getAllNotes, getSingleNote, updateNotes, deleteNotes };