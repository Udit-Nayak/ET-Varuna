import dotenv from "dotenv";
import { fetchNews } from "../agents/gria/newsFetcher";

dotenv.config();

const getArgValue = (name: string, fallback: number): number => {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const main = async (): Promise<void> => {
  const limit = getArgValue("--limit", 10);
  const result = await fetchNews({ limit });

  console.log(`[GRIA fetch verify] Articles returned: ${result.articles.length}`);
  console.log("[GRIA fetch verify] Source stats:");
  result.sourceStats.forEach((source) => {
    console.log(`- ${source.source}: fetched=${source.fetched}, normalized=${source.normalized}, errors=${source.errors.join(" | ") || "none"}`);
  });
  result.articles.slice(0, 5).forEach((article, index) => {
    console.log(`${index + 1}. ${article.source} | ${article.publishedAt} | ${article.title}`);
  });
};

main().catch((error) => {
  console.error("[GRIA fetch verify] FAILED", error);
  process.exitCode = 1;
});
