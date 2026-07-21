import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
  firebaseUid: string;
  email: string;
  displayName?: string;
  phone?: string;
  occupation?: string;
  photoURL?: string;
  isProfileComplete: boolean;
  role: "user" | "admin";
  isActive: boolean;
  lastLoginAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, index: true },
    displayName: { type: String },
    phone: { type: String },
    occupation: { type: String },
    photoURL: { type: String },
    isProfileComplete: { type: Boolean, required: true, default: false, index: true },
    role: { type: String, required: true, enum: ["user", "admin"], default: "user" },
    isActive: { type: Boolean, required: true, default: true, index: true },
    lastLoginAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, strict: true }
);

userSchema.index({ firebaseUid: 1, email: 1 });

const User: Model<IUser> = mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);

export default User;

