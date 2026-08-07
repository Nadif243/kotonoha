export type PriorityStatus = "HARD" | "REVIEW" | "SETTLED";
export type DomainType = "LEXICAL" | "GRAMMAR" | "DOMAIN_HUB";

export interface NodeAttributes {
  reading?: string;
  meanings_en?: string[];
  personal_context?: string;
  example_sentences?: Array<{
    ja: string;
    translation?: string;
  }>;
  [key: string]: unknown; // Flexible payload for domain-agnostic extensions
}

export interface NodeEntity {
  id: string;
  label: string;
  reading?: string;
  meaning_en?: string;
  domain_type: DomainType;
  priority_status: PriorityStatus;
  sequence_order?: number;
  attributes?: string; // Stored as JSON string in SQLite
  created_at?: string;
  updated_at?: string;

  // Dynamic Canvas Layout Persistence
  pos_x?: number | null;
  pos_y?: number | null;
}

export interface EdgeEntity {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string; // e.g., 'TRANSITIVE_PAIR', 'SIMILAR_KANJI', 'SYNONYM'
  is_directional: boolean; // true = directed arrow, false = bi-directional link
  notes?: string;
}
