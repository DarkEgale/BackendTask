import bcrypt from "bcryptjs";
import mongoose, { Schema,model } from "mongoose";



const userSchema=new Schema({
    name:{
        type:String,
        required:[true,"User name is required !"]
    },
    email:{
        type:String,
        unique:true,
        required:[true,"User email is required !"]
    },
    password:{
        type:String,
        required:[true,"Password is required !"],
        select:false
    },
    role:{
        type:String,
        default:"user",
        enum:['user','admin']
    },
    interests:[{
        type: Schema.Types.ObjectId,
        ref: "Interest"
    }]
},{timestamps:true,toJSON:{
    transform(doc,ret){
        // Never expose the password hash in API responses
        delete ret.password;
        return ret;
    }
}})

// Mongoose 9: pre hooks no longer receive a `next` callback.
// Returning a promise (or throwing) is the supported way to signal failure.
userSchema.pre('save', async function(){
    if(!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function(candidatePassword){
    return await bcrypt.compare(candidatePassword, this.password);
};

// Note: `unique: true` on the email field already creates a unique index.
// Declaring it again here would produce a duplicate index (MongoDB IndexOptionsConflict).
userSchema.index({ role: 1 });
userSchema.index({ interests: 1 });

const Users=model('Users',userSchema);

export default Users;