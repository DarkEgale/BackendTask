import mongoose, { Schema, model } from "mongoose";

const postSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "Users",
        required: [true, "User id is required !"]
    },
    title: {
        type: String,
        required: [true, "Post title is required !"]
    },
    content: {
        type: String,
        required: [true, "Post content is required !"]
    },
    status: {
        type: String,
        default: "published",
        enum: ['published', 'draft', 'archived']
    }
}, { timestamps: true });

postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ title: 'text', content: 'text' });

const Post = model("Post", postSchema);

export default Post;
