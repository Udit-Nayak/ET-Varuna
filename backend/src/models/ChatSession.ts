import mongoose, { Document, Model, Schema } from "mongoose";

export type ChatMessageRole = "system" | "gria" | "dsm" | "sroa" | "apo" | "user";
export type ChatMessageStatus = "pending" | "streaming" | "done" | "error";

export interface ChatMessageDocument {
  id: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  timestamp: number;
}

export interface ChatMemorySummaryDocument {
  summary: string;
  provider: "langchain-groq" | "deterministic";
  generatedAt: Date;
  messageCount: number;
}

export interface ChatSessionDocument {
  firebaseUid: string;
  title: string;
  messages: ChatMessageDocument[];
  latestWorkflow?: Record<string, unknown> | null;
  memorySummary?: ChatMemorySummaryDocument | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatSessionMongooseDocument extends ChatSessionDocument, Document {}

const ChatMessageSchema = new Schema<ChatMessageDocument>(
  {
    id: { type: String, required: true },
    role: { type: String, required: true, enum: ["system", "gria", "dsm", "sroa", "apo", "user"] },
    content: { type: String, required: true },
    status: { type: String, required: true, enum: ["pending", "streaming", "done", "error"] },
    timestamp: { type: Number, required: true },
  },
  { _id: false }
);

const ChatMemorySummarySchema = new Schema<ChatMemorySummaryDocument>(
  {
    summary: { type: String, required: true },
    provider: { type: String, required: true, enum: ["langchain-groq", "deterministic"] },
    generatedAt: { type: Date, required: true },
    messageCount: { type: Number, required: true },
  },
  { _id: false }
);

const ChatSessionSchema = new Schema<ChatSessionMongooseDocument>(
  {
    firebaseUid: { type: String, required: true, index: true },
    title: { type: String, required: true, default: "New chat" },
    messages: { type: [ChatMessageSchema], default: [] },
    latestWorkflow: { type: Schema.Types.Mixed, default: null },
    memorySummary: { type: ChatMemorySummarySchema, default: null },
    archived: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: true, strict: true }
);

ChatSessionSchema.index({ firebaseUid: 1, updatedAt: -1 });
ChatSessionSchema.index({ firebaseUid: 1, archived: 1, updatedAt: -1 });

const ChatSession: Model<ChatSessionMongooseDocument> =
  mongoose.models.ChatSession ?? mongoose.model<ChatSessionMongooseDocument>("ChatSession", ChatSessionSchema);

export default ChatSession;
