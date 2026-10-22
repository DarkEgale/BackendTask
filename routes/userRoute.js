import express from "express";
import {
    updatePassword, getUsers, getUser, updateUsers, deleteUsers,
    getUsersGroupedByInterest
} from "../controllers/users.controller.js";
import {
    getMyInterests, addInterest, removeInterest, updateMyInterest
} from "../controllers/interests.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.put("/users/password", authenticate(), updatePassword);

router.get("/users", authenticate("admin"), getUsers);

// A user manages their OWN interests — any logged in user may call these.
// Registered before `/users/:userId` so the literal "me" always wins.
router.get("/users/me/interests", authenticate(), getMyInterests);

router.post("/users/me/interests", authenticate(), addInterest);

router.delete("/users/me/interests/:interestId", authenticate(), removeInterest);

// Rename one of the caller's own interests. Kept isolated from other users'
// profiles even though the catalog itself is shared.
router.put("/users/me/interests/:interestId", authenticate(), updateMyInterest);

router.get("/users/:userId", authenticate("admin"), getUser);

router.put("/users/:userId", authenticate("admin"), updateUsers);

router.delete("/users/:userId", authenticate("admin"), deleteUsers);

router.get("/users/grouped/interest", authenticate(), getUsersGroupedByInterest);

export default router;
