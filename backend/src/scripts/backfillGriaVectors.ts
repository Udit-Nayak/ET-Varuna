import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { IntelligenceModel } from "../models";
import { replaceVectorDocumentsForArticle } from "../agents/gria/mongoRepository";
import { vectorDocumentsFromIntelligence } from "../agents/gria/vectorizer";
import { IntelligenceDocument } from "../agents/gria/types";

dotenv.config();

const getArgValue = (name: string, fallback: number): number => {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const main = async (): Promise<void> => {
  const batchSize = getArgValue("--batchSize", 100);
  const deleteSource = process.argv.includes("--deleteSource=true");
  await connectDB();

  const total = await IntelligenceModel.countDocuments();
  let processed = 0;
  let vectorChunks = 0;
  let failures = 0;
  let lastId: unknown = null;

  console.log(`[GRIA backfill] Found ${total} griaIntelligence documents`);

  while (processed < total) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const docs = await IntelligenceModel.find(query).sort({ _id: 1 }).limit(batchSize).lean();
    if (docs.length === 0) break;

    for (const doc of docs) {
      lastId = doc._id;
      processed += 1;
      try {
        const intelligence = {
          ...doc,
          fetchedAt: doc.fetchedAt?.toISOString?.() ?? String(doc.fetchedAt ?? new Date().toISOString()),
          publishedAt: doc.publishedAt?.toISOString?.() ?? String(doc.publishedAt ?? new Date().toISOString()),
        } as unknown as IntelligenceDocument;
        const chunks = await vectorDocumentsFromIntelligence(intelligence);
        const saved = await replaceVectorDocumentsForArticle(intelligence.sourceUrl, chunks);
        if (deleteSource && saved.length > 0) {
          await IntelligenceModel.deleteOne({ _id: doc._id });
        }
        vectorChunks += saved.length;
        console.log(`[GRIA backfill] ${processed}/${total} ${intelligence.sourceUrl} -> ${saved.length} chunks${deleteSource && saved.length > 0 ? " and deleted source" : ""}`);
      } catch (error) {
        failures += 1;
        console.error(`[GRIA backfill] Failed document ${String(doc._id)}`, error);
      }
    }
  }

  console.log(
    `[GRIA backfill] Complete. processed=${processed}, vectorChunks=${vectorChunks}, failures=${failures}`
  );
};

main()
  .catch((error) => {
    console.error("[GRIA backfill] Fatal error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
