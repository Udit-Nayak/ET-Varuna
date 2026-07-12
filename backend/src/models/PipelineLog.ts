import mongoose, { Model, Schema } from "mongoose";
import { PipelineLogMongooseDocument } from "./types";

const PipelineLogSchema = new Schema<PipelineLogMongooseDocument>(
  {
    startTime: { type: Date, required: true, index: true, unique: true },
    endTime: { type: Date, required: true, index: true },
    articlesFetched: { type: Number, required: true, default: 0 },
    articlesProcessed: { type: Number, required: true, default: 0 },
    successfulAnalyses: { type: Number, required: true, default: 0 },
    failedAnalyses: { type: Number, required: true, default: 0 },
    executionTime: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      required: true,
      enum: ["success", "partial_success", "failed", "running"],
      default: "running",
      index: true,
    },
    errorMessage: { type: String },
    duplicatesRemoved: { type: Number, default: 0 },
  },
  { timestamps: true, strict: true }
);

PipelineLogSchema.index({ startTime: -1, status: 1 });

export const PipelineLogModel: Model<PipelineLogMongooseDocument> =
  mongoose.models.GriaPipelineLog ?? mongoose.model<PipelineLogMongooseDocument>("GriaPipelineLog", PipelineLogSchema);

export default PipelineLogModel;

