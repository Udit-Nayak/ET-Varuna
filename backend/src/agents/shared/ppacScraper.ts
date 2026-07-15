import axios from "axios";
import * as cheerio from "cheerio";

const PPAC_CRUDE_PRICE_URL = "https://ppac.gov.in/prices/international-prices-of-crude-oil";
const PPAC_CRUDE_PRICE_DATA_URL = "https://ppac.gov.in/AjaxController/getInternationalPricesCrudeOil";

export interface PPACLivePrice {
  current_price_usd_per_barrel: number | null;
  month_to_date_avg_usd: number | null;
  basket_ratio_sweet_pct: number | null;
  basket_ratio_sour_pct: number | null;
  ppac_last_updated: string | null;
}

const normaliseText = (value: string): string => value.replace(/\s+/g, " ").trim();

const toNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const lastNumberIn = (value: string): number | null => {
  const matches = value.match(/\d+(?:\.\d+)?/g);
  return matches ? toNumber(matches[matches.length - 1]) : null;
};

const currentMonthKey = (): string =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "Asia/Kolkata" }).format(new Date()).toLowerCase();

const parsePpacDataResponse = (data: unknown, month: string): Partial<PPACLivePrice> => {
  if (!data || typeof data !== "object") return {};
  const result = (data as { result?: unknown }).result;
  if (!result || typeof result !== "object") return {};

  const rows = Object.values(result as Record<string, unknown>).filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object",
  );
  const dataRow = rows.find((row) => typeof row[month] === "number" || typeof row[month] === "string");
  const notes = rows
    .map((row) => (typeof row.title === "string" ? row.title : ""))
    .filter(Boolean)
    .join(" ");

  const spotMatch = notes.match(
    /Crude\s+Oil\s+Indian\s+Basket\s+as\s+on\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s+is\s+\$?\s*([\d,.]+)\s*\/?\s*bbl/i,
  );
  // PPAC may write "ICB Ratio for April ... & July 79.40:20.60", with
  // "ICB Ratio for" appearing only once before the first month.
  const ratioMatch = notes.match(
    new RegExp(`(?:ICB\\s+Ratio\\s+for\\s+)?\\b${month}(?:\\s*(?:19|20)\\d{2})?\\s*(?:is)?\\s*([\\d.]+)\\s*:\\s*([\\d.]+)`, "i"),
  );
  const updated = rows.find((row) => typeof row.modified_date === "string")?.modified_date;

  return {
    month_to_date_avg_usd: toNumber(typeof dataRow?.[month] === "string" ? dataRow[month] : String(dataRow?.[month] ?? "")),
    current_price_usd_per_barrel: toNumber(spotMatch?.[1]),
    basket_ratio_sweet_pct: toNumber(ratioMatch?.[1]),
    basket_ratio_sour_pct: toNumber(ratioMatch?.[2]),
    ppac_last_updated: typeof updated === "string" ? updated : null,
  };
};

/**
 * Reads PPAC's server-rendered crude-price page.  Each value is parsed
 * independently so a wording or markup change cannot prevent a snapshot from
 * being stored.
 */
export async function fetchLivePriceFromPPAC(): Promise<PPACLivePrice> {
  const emptyResult: PPACLivePrice = {
    current_price_usd_per_barrel: null,
    month_to_date_avg_usd: null,
    basket_ratio_sweet_pct: null,
    basket_ratio_sour_pct: null,
    ppac_last_updated: null,
  };

  try {
    const response = await axios.get<string>(PPAC_CRUDE_PRICE_URL, {
      timeout: 20_000,
      headers: { "User-Agent": "ET-Sentrix live-price scraper/1.0" },
    });
    const $ = cheerio.load(response.data);
    const pageText = normaliseText($.root().text());

    const spotMatch = pageText.match(
      /Crude\s+Oil\s+Indian\s+Basket\s+as\s+on\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s+is\s+\$?\s*([\d,.]+)\s*\/?\s*bbl/i,
    );
    emptyResult.current_price_usd_per_barrel = toNumber(spotMatch?.[1]);

    const updatedMatch = pageText.match(
      /Last\s+updated(?:\s+Date)?(?:\s+on)?\s*:\s*([0-3]?\d[./-][01]?\d[./-]\d{2,4})/i,
    );
    emptyResult.ppac_last_updated = updatedMatch?.[1] ?? null;

    // PPAC presents the running monthly average in the current month's table.
    // Prefer explicitly-labelled rows, then accept an Average row in a table
    // that contains Indian Basket data.
    $("table").each((_index, table) => {
      if (emptyResult.month_to_date_avg_usd !== null) return;
      const tableText = normaliseText($(table).text());
      if (!/indian\s+basket|crude\s+oil/i.test(tableText)) return;

      $(table)
        .find("tr")
        .each((_rowIndex, row) => {
          if (emptyResult.month_to_date_avg_usd !== null) return;
          const rowText = normaliseText($(row).text());
          if (/\b(?:monthly|month\s*to\s*date|mtd)?\s*average\b/i.test(rowText)) {
            emptyResult.month_to_date_avg_usd = lastNumberIn(rowText);
          }
        });
    });

    // Some PPAC revisions put the label beside the table rather than in a row.
    if (emptyResult.month_to_date_avg_usd === null) {
      const averageMatch = pageText.match(
        /(?:current\s+month(?:'s)?\s+)?(?:daily\s+)?(?:month\s*to\s*date\s+|monthly\s+)?average(?:\s+(?:price|of\s+(?:the\s+)?indian\s+basket))?\s*[:=-]?\s*\$?\s*([\d,.]+)/i,
      );
      emptyResult.month_to_date_avg_usd = toNumber(averageMatch?.[1]);
    }

    const sweetPercent = pageText.match(/Sweet(?:\s+Crude)?\s*(?:is|:|-)?\s*([\d.]+)\s*%/i);
    const sourPercent = pageText.match(/Sour(?:\s+Crude)?\s*(?:is|:|-)?\s*([\d.]+)\s*%/i);
    emptyResult.basket_ratio_sweet_pct = toNumber(sweetPercent?.[1]);
    emptyResult.basket_ratio_sour_pct = toNumber(sourPercent?.[1]);

    // The ICB note is also published as a Sweet:Sour ratio on some versions.
    if (emptyResult.basket_ratio_sweet_pct === null || emptyResult.basket_ratio_sour_pct === null) {
      const ratioMatch = pageText.match(/Sweet\s*:\s*Sour(?:\s+(?:basket|crude))?\s*[:=-]?\s*([\d.]+)\s*:\s*([\d.]+)/i);
      if (ratioMatch) {
        emptyResult.basket_ratio_sweet_pct ??= toNumber(ratioMatch[1]);
        emptyResult.basket_ratio_sour_pct ??= toNumber(ratioMatch[2]);
      }
    }

    // PPAC currently inserts the table with this first-party request after the
    // initial HTML loads. Use it only as a fallback when a field is absent from
    // the server-rendered page, so either PPAC delivery format remains usable.
    if (Object.values(emptyResult).some((value) => value === null)) {
      try {
        const month = currentMonthKey();
        const financialYear = String($("#financialYear").val() ?? "");
        const reportBy = String($("#getReportBy").val() ?? "");
        const pageId = String($("#page_id").val() ?? "");
        const liveData = await axios.post<unknown>(
          PPAC_CRUDE_PRICE_DATA_URL,
          new URLSearchParams({ financialYear, reportBy, pageId }),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 },
        );
        const fallback = parsePpacDataResponse(liveData.data, month);
        emptyResult.current_price_usd_per_barrel ??= fallback.current_price_usd_per_barrel ?? null;
        emptyResult.month_to_date_avg_usd ??= fallback.month_to_date_avg_usd ?? null;
        emptyResult.basket_ratio_sweet_pct ??= fallback.basket_ratio_sweet_pct ?? null;
        emptyResult.basket_ratio_sour_pct ??= fallback.basket_ratio_sour_pct ?? null;
        emptyResult.ppac_last_updated ??= fallback.ppac_last_updated ?? null;
      } catch (error) {
        console.error("Failed to fetch PPAC live-price table data", error);
      }
    }

    return emptyResult;
  } catch (error) {
    console.error("Failed to fetch or parse PPAC live crude price", error);
    return emptyResult;
  }
}
