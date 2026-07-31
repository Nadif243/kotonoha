import Database from "@tauri-apps/plugin-sql";
import { NodeEntity, EdgeEntity, PriorityStatus } from "../types/database";

let dbInstance: Database | null = null;

/**
 * Gets or initializes the SQLite database connection.
 * Creates the 'nodes' and 'edges' tables if they don't exist.
 */
export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  // Opens or creates 'kotonoha.db' inside the app data directory
  dbInstance = await Database.load("sqlite:kotonoha_v1.db");

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

export async function deleteNode(id: string): Promise<void> {
  const db = await getDb();
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
