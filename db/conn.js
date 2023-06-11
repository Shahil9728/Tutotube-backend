import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Database connection is successful');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const userSchema = new mongoose.Schema({
  googleId: String,
  name:String,
  email:String,
  imgsrc:String,
  credits:Number
});

const User = mongoose.model('users', userSchema);

export { connectDB, User };
