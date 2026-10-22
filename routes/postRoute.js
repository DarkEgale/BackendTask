import express from "express";
import { getUserPosts } from "../controllers/users.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/users/:userId/posts", authenticate("user", "admin"), getUserPosts);

export default router;
