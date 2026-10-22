import Users from "../models/user.model.js";
import AppError from "../helpers/AppError.js";
import { resolveInterests } from "./interest.service.js";

const userRegistration = async (data) => {
    const { name, email, password, interests } = data;

    if (!name || !email || !password) {
        throw new AppError("Name, email and password are required", 400);
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new AppError("Please provide a valid email", 400);
        } else if (password.length < 6) {
            throw new AppError("Password must be at least 6 characters long", 400);
        } else {
            // Interests may be sent as ids OR as plain names. A name that does
            // not exist yet is created, so a new user can pick their own.
            let interestIds = [];

            if (interests) {
                const resolved = await resolveInterests(interests);
                interestIds = resolved.map(interest => interest._id);
            }

            const user = await Users.create({
                name: name,
                email: email,
                password: password,
                interests: interestIds
            });

            return user;
        }
    }
};

const userLogin = async (data) => {
    const { email, password } = data;

    if (!email || !password) {
        throw new AppError("Email and password are required", 400);
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new AppError("Please provide a valid email", 400);
        } else {
            // `password` is declared with `select: false` on the schema, so it
            // must be explicitly requested here to run the password comparison.
            const user = await Users.findOne({ email: email }).select("+password");

            if (!user) {
                throw new AppError("User not found with this email", 404);
            } else {
                const isPasswordMatch = await user.comparePassword(password);

                if (!isPasswordMatch) {
                    throw new AppError("Invalid email or password", 401);
                } else {
                    return user;
                }
            }
        }
    }
};

export { userRegistration, userLogin };
