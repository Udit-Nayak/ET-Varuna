import mongoose, { Model, Schema } from "mongoose";
import { IntelligenceMongooseDocument } from "./types";

const IntelligenceSchema = new Schema<IntelligenceMongooseDocument>(
  {
    headline: { type: String, required: true, index: true },
    content: { type: String, required: true },
    summary: { type: String, required: true },
    source: { type: String, required: true, index: true },
    sourceUrl: { type: String, required: true, unique: true, index: true },
    country: { type: String, required: true, index: true },
    affectedCountries: [{ type: String, required: true }],
    corridor: { type: String, required: true, index: true },
    affectedCorridors: [{ type: String, required: true }],
    eventType: { type: String, required: true, index: true },
    severity: { type: String, required: true, index: true },
    confidence: { type: Number, required: true },
    riskScore: { type: Number, required: true, index: true },
    riskLevel: { type: String, required: true, index: true },
    reasoning: { type: String, required: true },
    sanctions: { type: Number, required: true },
    oilPriceImpact: { type: Number, required: true },
    aisImpact: { type: Number, required: true },
    extractedEntities: { type: Schema.Types.Mixed, default: {} },
    keywords: [{ type: String, required: true }],
    llmModel: { type: String, required: true },
    processingStatus: {
      type: String,
      required: true,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    fetchedAt: { type: Date, required: true, index: true },
    publishedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, strict: true }
);

IntelligenceSchema.index({ riskScore: -1, publishedAt: -1 });
IntelligenceSchema.index({ corridor: 1, country: 1, eventType: 1, severity: 1, source: 1 });
IntelligenceSchema.set("collection", "griaIntelligence");

export const IntelligenceModel: Model<IntelligenceMongooseDocument> =
  mongoose.models.GriaIntelligence ?? mongoose.model<IntelligenceMongooseDocument>("GriaIntelligence", IntelligenceSchema);

export default IntelligenceModel;
