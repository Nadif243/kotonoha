import Database from "@tauri-apps/plugin-sql";
import { NodeEntity, EdgeEntity, DomainType, PriorityStatus } from "../types/database";
import { EnrichmentPayload } from "./enrichment";

let dbInstance: Database | null = null;

/**
 * Gets or initializes the SQLite database connection.
 * Creates the 'nodes' and 'edges' tables if they don't exist and migrates missing columns.
 */
export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  // Opens or creates 'kotonoha_v1.db' inside the app data directory
  dbInstance = await Database.load("sqlite:kotonoha_v1.db");

  // Force foreign key enforcement for cascading deletions
  await dbInstance.execute("PRAGMA foreign_keys = ON;");

  // Create Nodes table
  await dbInstance.execute(`
    CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        reading TEXT,
        meaning_en TEXT,
        domain_type TEXT NOT NULL,
        priority_status TEXT DEFAULT 'REVIEW',
        attributes TEXT,
        pos_x REAL,
        pos_y REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration Check: Add pos_x and pos_y to existing SQLite databases gracefully
  try {
    await dbInstance.execute("ALTER TABLE nodes ADD COLUMN pos_x REAL;");
  } catch {
    // Column already exists
  }

  try {
    await dbInstance.execute("ALTER TABLE nodes ADD COLUMN pos_y REAL;");
  } catch {
    // Column already exists
  }

  // Create Edges table
  await dbInstance.execute(`
    CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        source_node_id TEXT NOT NULL,
        target_node_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        is_directional BOOLEAN DEFAULT 1,
        notes TEXT,
        FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE
    );
  `);

  // Performance indexes
  await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);`);
  await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_nodes_reading ON nodes(reading);`);
  await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_node_id);`);
  await dbInstance.execute(`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_node_id);`);

  return dbInstance;
}

/**
 * Fetches all nodes ordered by sequence entry.
 */
export async function getAllNodes(): Promise<NodeEntity[]> {
  const db = await getDb();
  return await db.select<NodeEntity[]>("SELECT * FROM nodes ORDER BY created_at DESC, rowid DESC;");
}

/**
 * Checks if an exact duplicate (Label + Reading + English Meaning) already exists in SQLite.
 */
export async function checkDuplicateNode(
  label: string,
  reading: string,
  meaningEn: string
): Promise<boolean> {
  const db = await getDb();
  const result = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM nodes WHERE LOWER(label) = LOWER($1) AND LOWER(reading) = LOWER($2) AND LOWER(meaning_en) = LOWER($3);",
    [label, reading, meaningEn]
  );
  return result[0].count > 0;
}

/**
 * Inserts a new node into the database.
 */
export async function insertNode(node: Omit<NodeEntity, "created_at" | "updated_at">): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO nodes (id, label, reading, meaning_en, domain_type, priority_status, attributes, pos_x, pos_y)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
    [
      node.id,
      node.label,
      node.reading || null,
      node.meaning_en || null,
      node.domain_type,
      node.priority_status,
      node.attributes || null,
      node.pos_x ?? null,
      node.pos_y ?? null,
    ]
  );
}

/**
 * Updates a single node's canvas coordinates (called on drag end).
 */
export async function updateNodePosition(id: string, posX: number, posY: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE nodes SET pos_x = $1, pos_y = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;",
    [posX, posY, id]
  );
}

/**
 * Batch updates multiple node positions (called after Auto-Organize physics run).
 */
export async function batchUpdateNodePositions(
  positions: { id: string; x: number; y: number }[]
): Promise<void> {
  const db = await getDb();
  for (const pos of positions) {
    await db.execute(
      "UPDATE nodes SET pos_x = $1, pos_y = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;",
      [pos.x, pos.y, pos.id]
    );
  }
}

/**
 * Deletes a node AND purges any edges connected to it.
 */
export async function deleteNode(id: string): Promise<void> {
  const db = await getDb();
  // Manually delete attached edges to prevent orphan relations
  await db.execute("DELETE FROM edges WHERE source_node_id = $1 OR target_node_id = $1;", [id]);
  await db.execute("DELETE FROM nodes WHERE id = $1;", [id]);
}

export async function updateNodePriority(id: string, priority: PriorityStatus): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE nodes SET priority_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;", [
    priority,
    id,
  ]);
}

/**
 * Fetches all edges.
 */
export async function getAllEdges(): Promise<EdgeEntity[]> {
  const db = await getDb();
  return await db.select<EdgeEntity[]>("SELECT * FROM edges;");
}

/**
 * Validates edge creation: checks self-links, exact duplicates, and SYNONYM vs OPPOSITE conflicts.
 */
export async function checkEdgeConflict(
  sourceId: string,
  targetId: string,
  relationType: string
): Promise<{ hasError: boolean; message?: string }> {
  const db = await getDb();

  const sourceRes = await db.select<NodeEntity[]>("SELECT * FROM nodes WHERE id = $1", [sourceId]);
  const targetRes = await db.select<NodeEntity[]>("SELECT * FROM nodes WHERE id = $1", [targetId]);

  if (sourceRes.length === 0 || targetRes.length === 0) {
    return { hasError: true, message: "One of the selected nodes no longer exists." };
  }

  const sourceNode = sourceRes[0];
  const targetNode = targetRes[0];

  const sourceType = sourceNode.domain_type;
  const targetType = targetNode.domain_type;

  // Enforce Relation Compatibility Matrix

  //  A: Lexical Relations (LEXICAL <-> LEXICAL Only)
  const lexicalOnlyRelations = ["SIMILAR_KANJI", "SYNONYM", "OPPOSITE", "TRANSITIVE_PAIR"];
  if (lexicalOnlyRelations.includes(relationType)) {
    if (sourceType !== "LEXICAL" || targetType !== "LEXICAL") {
      return {
        hasError: true,
        message: `"${relationType}" relation can only connect two LEXICAL (word) nodes!`,
      };
    }
  }

  //  B: Grammar Relation (LEXICAL -> GRAMMAR Only)
  if (relationType === "USES_GRAMMAR") {
    if (sourceType !== "LEXICAL" || targetType !== "GRAMMAR") {
      return {
        hasError: true,
        message: `"USES_GRAMMAR" relation must point from a LEXICAL node (source) to a GRAMMAR rule (target)!`,
      };
    }
  }

  //  C: Hub Anchors (ANY -> DOMAIN_HUB)
  if (relationType === "BELONGS_TO_HUB") {
    if (targetType !== "DOMAIN_HUB") {
      return {
        hasError: true,
        message: `"BELONGS_TO_HUB" relation must point TO a DOMAIN_HUB node as its target!`,
      };
    }
  }

  //  D: Mutual Hub Anchor (DOMAIN_HUB <-> DOMAIN_HUB Only)
  if (relationType === "MUTUAL_HUB") {
    if (sourceType !== "DOMAIN_HUB" || targetType !== "DOMAIN_HUB") {
      return {
        hasError: true,
        message: `"MUTUAL_HUB" relation can only connect two DOMAIN_HUB nodes!`,
      };
    }
  }

  // 3. Prevent Duplicate Edge Creation
  const existingEdge = await db.select<EdgeEntity[]>(
    `SELECT * FROM edges
     WHERE (source_node_id = $1 AND target_node_id = $2 AND relation_type = $3)
        OR (source_node_id = $2 AND target_node_id = $1 AND relation_type = $3)`,
    [sourceId, targetId, relationType]
  );

  if (existingEdge.length > 0) {
    return {
      hasError: true,
      message: `A "${relationType}" edge already exists between "${sourceNode.label}" and "${targetNode.label}".`,
    };
  }

  return { hasError: false };
}

/**
 * Inserts a new edge connecting two existing nodes.
 */
export async function insertEdge(edge: Omit<EdgeEntity, "id">): Promise<void> {
  const db = await getDb();
  const id = `edge_${Date.now()}`;

  // Symmetric relations are flagged as non-directional
  const directionalTypes = ["TRANSITIVE_PAIR", "USES_GRAMMAR"];
  const isDirectional = directionalTypes.includes(edge.relation_type);

  await db.execute(
    `INSERT INTO edges (id, source_node_id, target_node_id, relation_type, is_directional, notes)
     VALUES ($1, $2, $3, $4, $5, $6);`,
    [
      id,
      edge.source_node_id,
      edge.target_node_id,
      edge.relation_type,
      isDirectional ? 1 : 0,
      edge.notes || null,
    ]
  );
}

/**
 * Deletes an edge by ID.
 */
export async function deleteEdge(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM edges WHERE id = $1;", [id]);
}

/**
 * Updates the attributes JSON for a node (e.g. personal context notes).
 */
export async function updateNodeContext(id: string, personalContext: string): Promise<void> {
  const db = await getDb();
  const attributesJSON = JSON.stringify({
    personal_context: personalContext || "",
    example_sentences: [],
  });
  await db.execute("UPDATE nodes SET attributes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;", [
    attributesJSON,
    id,
  ]);
}

export async function insertNodeWithHub(
  node: {
    id: string;
    label: string;
    reading?: string;
    meaning_en?: string;
    domain_type: DomainType;
    priority_status: PriorityStatus;
    attributes?: string;
  },
  targetHubId?: string
) {
  await insertNode(node);

  if (targetHubId && targetHubId !== "NONE") {
    await insertEdge({
      source_node_id: node.id,
      target_node_id: targetHubId,
      relation_type: "BELONGS_TO_HUB",
      is_directional: true,
    });
  }
}

export async function updateNodeDetails(
  id: string,
  label: string,
  reading?: string,
  meaning_en?: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE nodes SET label = $1, reading = $2, meaning_en = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
    [label, reading || null, meaning_en || null, id]
  );
}

// Interfaces for JSON attributes
export interface NoteItem {
  id: string;
  text: string;
  created_at: string;
}

export interface NodeAttributes {
  notes?: NoteItem[];
  enrichment_data?: EnrichmentPayload;
  personal_context?: string; // Legacy fallback
  enriched?: boolean;
  jlpt_level?: string;
  radicals?: string[];
  pitch_accent?: string;
}

// Helper to safely extract notes array (handles legacy single string conversion)
export function parseNodeNotes(attributesStr?: string): NoteItem[] {
  if (!attributesStr) return [];
  try {
    const parsed: NodeAttributes = JSON.parse(attributesStr);
    if (Array.isArray(parsed.notes)) {
      return parsed.notes;
    }
    // Backward compatibility for legacy single-string personal_context
    if (parsed.personal_context && parsed.personal_context.trim() !== "") {
      return [
        {
          id: `legacy_${Date.now()}`,
          text: parsed.personal_context,
          created_at: new Date().toISOString(),
        },
      ];
    }
    return [];
  } catch {
    return [];
  }
}

// Function to update the notes array in a node's attributes JSON
export async function updateNodeNotes(id: string, notes: NoteItem[]): Promise<void> {
  const db = await getDb();

  // Fetch current attributes to preserve other metadata fields
  const currentRes = await db.select<NodeEntity[]>(
    "SELECT attributes FROM nodes WHERE id = $1;",
    [id]
  );

  let existingAttrs: NodeAttributes = {};
  if (currentRes.length > 0 && currentRes[0].attributes) {
    try {
      existingAttrs = JSON.parse(currentRes[0].attributes);
    } catch {
      existingAttrs = {};
    }
  }

  const updatedAttrs: NodeAttributes = {
    ...existingAttrs,
    notes: notes,
    // Clear legacy string once migrated to array
    personal_context: "",
  };

  await db.execute(
    "UPDATE nodes SET attributes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;",
    [JSON.stringify(updatedAttrs), id]
  );
}

// Add function to persist custom reordered list indices
export async function updateNodesSortOrder(orderedNodeIds: string[]): Promise<void> {
  const db = await getDb();

  // Execute batch updates for sort_index
  for (let i = 0; i < orderedNodeIds.length; i++) {
    await db.execute(
      "UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1;",
      [orderedNodeIds[i]]
    );
  }
}

// Re-order nodes in batch by updating a sort_index or updated_at sequence
export async function reorderNodes(orderedIds: string[]): Promise<void> {
  const db = await getDb();

  // Execute sequence updates
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    await db.execute("UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1;", [id]);
  }
}
