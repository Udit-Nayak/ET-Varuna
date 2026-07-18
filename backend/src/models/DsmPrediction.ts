import mongoose, { Model, Schema } from "mongoose";
import { DsmPredictionMongooseDocument } from "./types";

const DsmEventClassificationSchema = new Schema(
  {
    event_type: { type: String, required: true, index: true },
    severity: { type: String, required: true, enum: ["low", "medium", "high", "critical"], index: true },
    affected_market: { type: String, required: true, index: true },
    expected_impact: { type: String, required: true },
    direction: { type: String, required: true, enum: ["up", "down", "mixed", "flat"], index: true },
    confidence: { type: Number, required: true },
    rationale: { type: String, required: true },
  },
  { _id: false }
);

const DsmHistoricalEventReactionSchema = new Schema(
  {
    event_id: { type: String, required: true, index: true },
    headline: { type: String, required: true },
    publishedAt: { type: String, required: true, index: true },
    event_type: { type: String, required: true, index: true },
    severity: { type: String, required: true, enum: ["low", "medium", "high", "critical"], index: true },
    affected_market: { type: String, required: true, index: true },
    historical_price_change_pct: { type: Number, required: true },
    notes: { type: String, required: true },
  },
  { _id: false }
);

const DsmPredictedPricePointSchema = new Schema(
  {
    horizon_days: { type: Number, required: true, enum: [1, 7, 30], index: true },
    predicted_price: { type: Number, required: true },
    predicted_change_pct: { type: Number, required: true },
    explanation: { type: String, required: true },
  },
  { _id: false }
);

const DsmHistoricalAnalysisSchema = new Schema(
  {
    matched_events: { type: [DsmHistoricalEventReactionSchema], required: true, default: [] },
    average_historical_price_change_pct: { type: Number, required: true },
    sample_size: { type: Number, required: true },
    market_condition_note: { type: String, required: true },
  },
  { _id: false }
);

const DsmPredictionSchema = new Schema<DsmPredictionMongooseDocument>(
  {
    event_id: { type: String, required: true, unique: true, index: true },
    event_details: { type: DsmEventClassificationSchema, required: true },
    news_references: { type: [{ type: Schema.Types.Mixed }], required: true, default: [] },
    current_price: { type: Number, required: true, index: true },
    historical_analysis: { type: DsmHistoricalAnalysisSchema, required: true },
    predicted_prices: { type: [DsmPredictedPricePointSchema], required: true, default: [] },
    confidence_score: { type: Number, required: true, index: true },
    warning_level: {
      type: String,
      required: true,
      enum: ["low", "medium", "high", "critical"],
      index: true,
    },
    recommendation: { type: String, required: true },
    market_impact_explanation: { type: String, required: true },
    source: { type: String, required: true, default: "dsm", index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, strict: true }
);

DsmPredictionSchema.index({ "event_details.event_type": 1, "event_details.affected_market": 1, createdAt: -1 });
DsmPredictionSchema.index({ warning_level: 1, confidence_score: -1, createdAt: -1 });
DsmPredictionSchema.set("collection", "dsm_predictions");

export const DsmPredictionModel: Model<DsmPredictionMongooseDocument> =
  mongoose.models.DsmPrediction ?? mongoose.model<DsmPredictionMongooseDocument>("DsmPrediction", DsmPredictionSchema);

export default DsmPredictionModel;
