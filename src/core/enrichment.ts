import { invoke } from "@tauri-apps/api/core";
import { getDb, NodeAttributes } from "./db";
import { NodeEntity } from "../types/database";

export interface RadicalInfo {
  symbol: string;
  meaning: string;
  forms?: string;
  parts?: string[];
  variants?: string[];
}

export interface IndividualKanjiInfo {
  kanji: string;
  jlpt?: string;
  grade?: string;
  stroke_count?: number;
  meanings: string[];
  readings_kun: string[];
  readings_on: string[];
  radical?: RadicalInfo;
}

export interface SenseDefinition {
  parts_of_speech: string[];
  definitions: string[];
  see_also?: string;
}

export interface EnrichmentPayload {
  status: "ENRICHED" | "NOT_FOUND" | "OFFLINE";
  dictionary_senses: SenseDefinition[];
  kanji_list: IndividualKanjiInfo[];
  enriched_at?: string;
}

// 1. Fetch Word Definitions & Parts of Speech
async function fetchWordDefinitions(keyword: string): Promise<SenseDefinition[]> {
  try {
    const senses = await invoke<SenseDefinition[]>("fetch_jisho_word", { keyword });
    return senses || [];
  } catch (err) {
    console.error("Rust Fetch Jisho Error:", err);
    return [];
  }
}

// 2. Fetch Detailed Kanji + Radical, Forms, Parts, & Variants
async function fetchSingleKanji(kanjiChar: string): Promise<IndividualKanjiInfo | null> {
  try {
    const kanjiDetail = await invoke<IndividualKanjiInfo | null>("fetch_jisho_kanji", { kanji: kanjiChar });
    return kanjiDetail;
  } catch (err) {
    console.error("Rust Fetch Jisho Kanji Error:", err);
    return null;
  }
}

// Main Enrichment Pipeline
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

  // FORCE CLEAR BROKEN CACHE
  const existingEnrichment = attributes.enrichment_data as EnrichmentPayload | undefined;

  // Ask to re-enrichment if:
  // 1. No cache enrichment yet.
  // 2. Dictionary senses haven't been filled yet.
  // 3. Kanji list hasn't been filled yet, OR there are kanji that do not yet have Radical Parts/Forms data.
  const isIncompleteCache =
    !existingEnrichment ||
    !Array.isArray(existingEnrichment.dictionary_senses) ||
    existingEnrichment.dictionary_senses.length === 0 ||
    !Array.isArray(existingEnrichment.kanji_list) ||
    existingEnrichment.kanji_list.length === 0 ||
    existingEnrichment.kanji_list.some(
      (k) => !k.radical || k.radical.meaning === "radical" || k.radical.meaning === "main radical" ||  k.stroke_count === 0 || k.readings_kun.length === 0
    );

  if (!isIncompleteCache && existingEnrichment) {
    return node; // Hanya pakai cache jika DUA-DUANYA (Definitions & Radical Breakdown) sudah komplit!
  }

  const kanjiRegex = /[\u4e00-\u9faf]/g;
  const matches = Array.from(new Set(node.label.match(kanjiRegex) || []));

  try {
    const [senses, kanjiResults] = await Promise.all([
      fetchWordDefinitions(node.label),
      Promise.all(matches.map((k) => fetchSingleKanji(k))),
    ]);

    const validKanjiList = kanjiResults.filter(
      (item): item is IndividualKanjiInfo => item !== null
    );

    const isEnriched = senses.length > 0 || validKanjiList.length > 0;

    const payload: EnrichmentPayload = {
      status: isEnriched ? "ENRICHED" : "NOT_FOUND",
      dictionary_senses: senses,
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
    return node;
  }
}
