import { getDb, NodeAttributes } from "./db";
import { NodeEntity } from "../types/database";

export interface IndividualKanjiInfo {
  kanji: string;
  jlpt?: string;
  stroke_count?: number;
  meanings: string[];
}

export interface EnrichmentPayload {
  status: "ENRICHED" | "NOT_FOUND" | "OFFLINE";
  kanji_list: IndividualKanjiInfo[];
  enriched_at?: string;
}

// Fetch details for a single kanji character
async function fetchSingleKanji(kanjiChar: string): Promise<IndividualKanjiInfo | null> {
  try {
    const res = await fetch(
      `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanjiChar)}`
    );
    if (!res.ok) return null;
    const data = await res.json();

    return {
      kanji: kanjiChar,
      jlpt: data.jlpt ? `N${data.jlpt}` : "N/A",
      stroke_count: data.stroke_count || 0,
      meanings: (data.meanings || []).slice(0, 3), // Grab top 3 meanings
    };
  } catch {
    return null;
  }
}

// Parse string and enrich ALL kanji characters found
export async function enrichAndCacheNode(nodeId: string): Promise<NodeEntity | null> {
  const db = await getDb();

  const res = await db.select<NodeEntity[]>(
    "SELECT * FROM nodes WHERE id = $1;",
    [nodeId]
  );

  if (res.length === 0) return null;

  const node = res[0];
  let attributes: NodeAttributes = {};

  try {
    if (node.attributes) {
      attributes = JSON.parse(node.attributes);
    }
  } catch {
    attributes = {};
  }

  // Skip if already attempted enrichment
  if (attributes.enrichment_data) {
    return node;
  }

  // Extract ALL kanji characters from the label
  const kanjiRegex = /[\u4e00-\u9faf]/g;
  const matches = Array.from(new Set(node.label.match(kanjiRegex) || []));

  // Case A: Pure Hiragana / Non-Japanese / No Kanji found
  if (matches.length === 0) {
    const notFoundPayload: EnrichmentPayload = {
      status: "NOT_FOUND",
      kanji_list: [],
      enriched_at: new Date().toISOString(),
    };

    const updatedAttrs = { ...attributes, enrichment_data: notFoundPayload };
    await db.execute(
      "UPDATE nodes SET attributes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;",
      [JSON.stringify(updatedAttrs), nodeId]
    );

    return { ...node, attributes: JSON.stringify(updatedAttrs) };
  }

  // Case B: Fetch metadata for each kanji in parallel
  try {
    const results = await Promise.all(matches.map((k) => fetchSingleKanji(k)));
    const validKanjiList = results.filter((item): item is IndividualKanjiInfo => item !== null);

    const payload: EnrichmentPayload = {
      status: validKanjiList.length > 0 ? "ENRICHED" : "NOT_FOUND",
      kanji_list: validKanjiList,
      enriched_at: new Date().toISOString(),
    };

    const updatedAttrs = { ...attributes, enrichment_data: payload };
    await db.execute(
      "UPDATE nodes SET attributes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;",
      [JSON.stringify(updatedAttrs), nodeId]
    );

    return { ...node, attributes: JSON.stringify(updatedAttrs) };
  } catch {
    // Case C: Offline or network error
    return node;
  }
}
