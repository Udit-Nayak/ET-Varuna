import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  firebaseUid: string;
  email: string;
  displayName?: string;
  createdAt: Date;
  lastLoginAt: Date;
}

const userSchema = new Schema<IUser>({
  firebaseUid: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true },
  displayName: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now },
});

export default model<IUser>("User", userSchema);
