import mongoose, { Schema, model } from "mongoose";

const accessSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "Users",
            required: [true, "User id is required !"]
        },
        ssid: {
            type: String,
            required: [true, "Session id (ssid) is required !"],
            unique: true
        },
        accessToken: {
            type: String,
            required: [true, "Access token is required !"]
        },
        refreshToken: {
            type: String,
            required: [true, "Refresh token is required !"]
        },
        expiresAt: {
            type: Date,
            required: [true, "Token expiry date is required !"]
        },
        isRevoked: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

accessSchema.index({ userId: 1, ssid: 1 }, { unique: true });
accessSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Access = model("Access", accessSchema);

export default Access;
