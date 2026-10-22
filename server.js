import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoute from "./routes/authRoute.js";
import noteRoute from "./routes/noteRoute.js";
import userRoute from "./routes/userRoute.js";
import postRoute from "./routes/postRoute.js";
import interestRoute from "./routes/interestRoute.js";

dotenv.config();

const app = express();

app.use(cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5500"],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoute);
app.use("/api", noteRoute);
app.use("/api", userRoute);
app.use("/api", postRoute);
app.use("/api", interestRoute);

// Unmatched route -> JSON 404 instead of Express' default HTML response
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`
    });
});

// Express only treats a middleware with exactly 4 parameters (err, req, res, next)
// as an error handler. With 3 parameters it was silently ignored and Express fell
// back to its default HTML error page.
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    // MongoDB duplicate key error -> conflict (e.g. email already registered)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || "field";
        return res.status(409).json({
            success: false,
            message: `${field} is already in use`
        });
    }

    // Mongoose schema validation error -> bad request
    if (err.name === "ValidationError") {
        const message = Object.values(err.errors).map(e => e.message).join(", ");
        return res.status(400).json({
            success: false,
            message: message || "Validation failed"
        });
    }

    // Malformed ObjectId -> bad request
    if (err.name === "CastError") {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path || "id"}`
        });
    }

    const status = err.status || 500;

    // Log unexpected server errors for debugging, but never leak internals
    if (status >= 500) {
        console.error(err);
    }

    res.status(status).json({
        success: false,
        message: status >= 500 ? "Internal Server Error" : (err.message || "Request failed")
    });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch((error) => {
    console.log("Database connection failed", error);
});
