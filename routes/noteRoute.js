import express from "express";
import { createNotes, getAllNotes, getSingleNote, updateNotes, deleteNotes } from "../controllers/notes.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/notes", authenticate("user", "admin"), createNotes);

router.get("/notes", authenticate("user", "admin"), getAllNotes);

router.get("/notes/:noteId", authenticate("user", "admin"), getSingleNote);

router.put("/notes/:noteId", authenticate("user", "admin"), updateNotes);

router.delete("/notes/:noteId", authenticate("user", "admin"), deleteNotes);

export default router;
