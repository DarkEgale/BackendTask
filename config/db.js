import mongoose from "mongoose";
import dotenv from "dotenv";




const connectDB=async()=>{
    const dbUrl=process.env.MONGODB_URI
    if(!dbUrl){
        throw new Error("MongoDB Connection String Not Found")
    }
    try{
        await mongoose.connect(dbUrl,{
            minPoolSize:2,
            maxPoolSize:10
        })
        console.log("Database Connected !")
    }catch(error){
        // Re-throw so the server does not start listening without a database
        console.log(error)
        throw error
    }
}

export default connectDB;