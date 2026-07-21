import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { IntelligenceModel } from "../models";
import { buildQueryEmbedding } from "../agents/gria/vectorizer";

dotenv.config();

const VECTOR_COLLECTION = "griaVectorDocuments";
const VECTOR_INDEX = process.env.GRIA_VECTOR_INDEX_NAME || "griaVectorIndex";

const queryArg = (): string => {
  const raw = process.argv.find((arg) => arg.startsWith("--query="))?.slice("--query=".length);
  return raw?.trim() || "Strait of Hormuz India oil shipping sanctions";
};

const main = async (): Promise<void> => {
  await connectDB();
  const dbName = IntelligenceModel.db.name;
  const collection = IntelligenceModel.db.collection(VECTOR_COLLECTION);
  const query = queryArg();
  const { embedding: queryEmbedding, provider } = await buildQueryEmbedding(query);

  console.log(`[GRIA vector verify] Database: ${dbName}`);
  console.log(`[GRIA vector verify] Collection: ${VECTOR_COLLECTION}`);
  console.log(`[GRIA vector verify] Index expected: ${VECTOR_INDEX}`);
  console.log(`[GRIA vector verify] Query: ${query}`);
  console.log(`[GRIA vector verify] Query embedding provider: ${provider}`);

  const documentCount = await collection.countDocuments();
  console.log(`[GRIA vector verify] Vector documents: ${documentCount}`);

  const sample = await collection.findOne({}, { projection: { _id: 0, id: 1, headline: 1, embedding: 1, metadata: 1 } });
  if (!sample) {
    throw new Error("No vector documents found. Run npm run gria:backfill-vectors or npm run gria:run-once first.");
  }

  const embedding = (sample as { embedding?: unknown }).embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Sample vector document has no embedding array.");
  }
  console.log(`[GRIA vector verify] Sample embedding dimensions: ${embedding.length}`);

  try {
    const indexes = await collection.listSearchIndexes().toArray();
    const names = indexes.map((index) => String(index.name));
    console.log(`[GRIA vector verify] Search indexes visible to driver: ${names.join(", ") || "(none)"}`);
    if (!names.includes(VECTOR_INDEX)) {
      console.warn(`[GRIA vector verify] WARNING: ${VECTOR_INDEX} is not visible in listSearchIndexes(). Check Atlas DB/collection.`);
    }
  } catch (error) {
    console.warn("[GRIA vector verify] listSearchIndexes() failed. Your driver/cluster may not expose it:", error);
  }

  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 100,
          limit: 5,
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          sourceArticleId: 1,
          headline: 1,
          summary: 1,
          eventType: 1,
          severity: 1,
          "metadata.source": 1,
          "metadata.publishedAt": 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();

  console.log(`[GRIA vector verify] $vectorSearch results: ${results.length}`);
  results.forEach((result, index) => {
    console.log(
      `${index + 1}. score=${Number(result.score ?? 0).toFixed(4)} severity=${result.severity ?? "n/a"} headline=${result.headline ?? "Untitled"}`
    );
  });

  if (results.length === 0) {
    throw new Error("$vectorSearch returned zero results. Check index readiness and embedding dimensions.");
  }
};

main()
  .catch((error) => {
    console.error("[GRIA vector verify] FAILED", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
