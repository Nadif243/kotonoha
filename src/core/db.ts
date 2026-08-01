import Database from "@tauri-apps/plugin-sql";
import { NodeEntity, EdgeEntity, DomainType, PriorityStatus } from "../types/database";

let dbInstance: Database | null = null;

/**
 * Gets or initializes the SQLite database connection.
 * Creates the 'nodes' and 'edges' tables if they don't exist.
 */
export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  // Opens or creates 'kotonoha.db' inside the app data directory
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

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
    `INSERT INTO nodes (id, label, reading, meaning_en, domain_type, priority_status, attributes)
     VALUES ($1, $2, $3, $4, $5, $6, $7);`,
    [
      node.id,
      node.label,
      node.reading || null,
      node.meaning_en || null,
      node.domain_type,
      node.priority_status,
      node.attributes || null,
    ]
  );
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
  // 1. Block Self-linking
  if (sourceId === targetId) {
    return { hasError: true, message: "A node cannot link to itself!" };
  }

  const db = await getDb();

  // 2. Check exact duplicate (either direction)
  const dupResult = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM edges
     WHERE relation_type = $3
     AND ((source_node_id = $1 AND target_node_id = $2) OR (source_node_id = $2 AND target_node_id = $1));`,
    [sourceId, targetId, relationType]
  );

  if (dupResult[0].count > 0) {
    return { hasError: true, message: `The connection "${relationType}" already exists between these nodes!` };
  }

  // 3. Mutual exclusion check between SYNONYM and OPPOSITE
  if (relationType === "SYNONYM" || relationType === "OPPOSITE") {
    const conflictingType = relationType === "SYNONYM" ? "OPPOSITE" : "SYNONYM";
    const conflictResult = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM edges
       WHERE relation_type = $3
       AND ((source_node_id = $1 AND target_node_id = $2) OR (source_node_id = $2 AND target_node_id = $1));`,
      [sourceId, targetId, conflictingType]
    );

    if (conflictResult[0].count > 0) {
      return {
        hasError: true,
        message: `Cannot add "${relationType}" because these nodes are already linked as "${conflictingType}"!`,
      };
    }
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
