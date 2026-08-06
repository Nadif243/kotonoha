import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getDb, NodeAttributes } from "./db";
import { NodeEntity } from "../types/database";
import { invoke } from "@tauri-apps/api/core";

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

// Universal Fetcher: Utamakan Tauri Native Fetch (Bypass CORS 100%), fallback ke standard fetch
async function safeFetch(url: string, timeoutMs = 4000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Coba Tauri Plugin HTTP (Native Rust Fetch - No CORS)
    const res = await tauriFetch(url, { method: "GET", connectTimeout: timeoutMs });
    clearTimeout(id);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // 2. Fallback Standard Fetch jika tauriFetch tidak tersedia
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (res.ok) return await res.json();
    } catch {
      clearTimeout(id);
    }
  }
  return null;
}

// 1. Fetch Word Definitions & Parts of Speech langsung dari Jisho
async function fetchWordDefinitions(keyword: string): Promise<SenseDefinition[]> {
  try {
    const senses = await invoke<SenseDefinition[]>("fetch_jisho_word", { keyword });
    return senses || [];
  } catch (err) {
    console.error("Rust Fetch Jisho Error:", err);
    return [];
  }
}

// 2. Fetch Detailed Kanji + Radical, Forms, Parts, & Variants dari Unofficial Jisho API
async function fetchSingleKanji(kanjiChar: string): Promise<IndividualKanjiInfo | null> {
  const url = `https://unofficial-jisho-api.vercel.app/api/search/kanji/${encodeURIComponent(kanjiChar)}`;
  const data = await safeFetch(url);

  if (data && data.found) {
    const formattedGrade = data.taughtIn ? `Grade ${data.taughtIn}` : undefined;

    return {
      kanji: kanjiChar,
      jlpt: data.jlptLevel ? `JLPT ${data.jlptLevel.toUpperCase()}` : undefined,
      grade: formattedGrade,
      stroke_count: data.strokeCount || 0,
      meanings: data.meaning ? data.meaning.split(",").map((s: string) => s.trim()) : [],
      readings_kun: data.kunYomi || [],
      readings_on: data.onYomi || [],
      radical: {
        symbol: data.radical?.symbol || kanjiChar,
        meaning: data.radical?.meaning || "radical",
        forms: data.radical?.forms ? `(${data.radical.forms.join(", ")})` : undefined,
        parts: data.parts || [],
        variants: data.variants || [],
      },
    };
  }

  // Fallback ke KanjiAPI.dev jika Unofficial Jisho Unreachable
  const fallbackUrl = `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanjiChar)}`;
  const fallbackData = await safeFetch(fallbackUrl);

  if (fallbackData) {
    return {
      kanji: kanjiChar,
      jlpt: fallbackData.jlpt ? `N${fallbackData.jlpt}` : undefined,
      grade: fallbackData.grade ? `Grade ${fallbackData.grade}` : undefined,
      stroke_count: fallbackData.stroke_count || 0,
      meanings: fallbackData.meanings || [],
      readings_kun: fallbackData.kun_readings || [],
      readings_on: fallbackData.on_readings || [],
      radical: {
        symbol: fallbackData.unicode_radical || kanjiChar,
        meaning: fallbackData.radical_name || "main radical",
        parts: fallbackData.parts || [],
        variants: fallbackData.variants || [],
      },
    };
  }

  return null;
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

  // FORCE CLEAR CACHE RUSAK
  const existingEnrichment = attributes.enrichment_data as EnrichmentPayload | undefined;
  const isCorruptedOrOldCache =
    !existingEnrichment ||
    !Array.isArray(existingEnrichment.dictionary_senses) ||
    existingEnrichment.dictionary_senses.length === 0 ||
    existingEnrichment.kanji_list.some(
      (k) => !k.radical?.parts || k.radical.parts.length === 0 || k.grade?.includes("Taught in")
    );

  if (!isCorruptedOrOldCache && existingEnrichment) {
    return node;
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
