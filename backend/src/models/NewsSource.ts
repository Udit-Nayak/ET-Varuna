import mongoose, { Model, Schema } from "mongoose";
import { NewsSourceMongooseDocument } from "./types";

const NewsSourceSchema = new Schema<NewsSourceMongooseDocument>(
  {
    name: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ["NewsAPI", "RSS", "GDELT", "Custom"],
      index: true,
    },
    baseUrl: { type: String, required: true },
    apiKey: { type: String, required: false },
    enabled: { type: Boolean, required: true, default: true, index: true },
    fetchInterval: { type: Number, required: true, default: 5 },
    lastFetchedAt: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: ["active", "inactive", "error"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true, strict: true }
);

NewsSourceSchema.index({ enabled: 1, status: 1, type: 1 });

export const NewsSourceModel: Model<NewsSourceMongooseDocument> =
  mongoose.models.GriaNewsSource ?? mongoose.model<NewsSourceMongooseDocument>("GriaNewsSource", NewsSourceSchema);

export default NewsSourceModel;

