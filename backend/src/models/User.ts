import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
  firebaseUid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: "user" | "admin";
  isActive: boolean;
  lastLoginAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, index: true },
    displayName: { type: String },
    photoURL: { type: String },
    role: { type: String, required: true, enum: ["user", "admin"], default: "user" },
    isActive: { type: Boolean, required: true, default: true, index: true },
    lastLoginAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, strict: true }
);

userSchema.index({ firebaseUid: 1, email: 1 });

const User: Model<IUser> = mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);

export default User;

