import mongoose, { Schema, model } from "mongoose";

const interestSchema = new Schema({
    name: {
        type: String,
        required: [true, "Interest name is required !"],
        unique: true
    }
}, { timestamps: true });

// Note: `unique: true` on the name field already creates a unique index.
// Declaring it again here would produce a duplicate index definition.
const Interest = model("Interest", interestSchema);

export default Interest;
