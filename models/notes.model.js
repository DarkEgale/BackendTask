import mongoose, { Schema, model } from "mongoose";

const notesSchema=new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:'Users',
        required:[true,"User id is required !"]
    },
    title:{
        type:String,
        required:[true,"Title is required !"]
    },
    notes:{
        type:String,
        required:[true,"Notes is required !"]
    },
    status:{
        type:String,
        default:"active",
        enum:['active','archived','deleted']
    }
},{timestamps:true})
notesSchema.index({title:'text',notes:'text',userId:1})

const Notes=model('Notes',notesSchema);

export default Notes;
