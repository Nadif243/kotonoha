import { useState } from "react";
import { NodeEntity, PriorityStatus, DomainType } from "../types/database";
import { insertNode, deleteNode, updateNodePriority, getAllNodes } from "../core/db";
import "./GridView.css";

interface GridViewProps {
  nodes: NodeEntity[];
  onNodesChange: (nodes: NodeEntity[]) => void;
}

export default function GridView({ nodes, onNodesChange }: GridViewProps) {
  // Form input states for fast entry
  const [label, setLabel] = useState("");
  const [reading, setReading] = useState("");
  const [meaningEn, setMeaningEn] = useState("");
  const [domainType, setDomainType] = useState<DomainType>("LEXICAL");
  const [priorityStatus, setPriorityStatus] = useState<PriorityStatus>("REVIEW");
  const [personalContext, setPersonalContext] = useState("");

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();

    // Require all 3 fields to exist before inserting
    if (!label.trim() || !reading.trim() || !meaningEn.trim()) return;

    const id = `node_${Date.now()}`;
    const attributesJSON = JSON.stringify({
      personal_context: personalContext || "",
      example_sentences: [],
    });

    try {
      await insertNode({
        id,
        label: label.trim(),
        reading: reading.trim(),
        meaning_en: meaningEn.trim(),
        domain_type: domainType,
        priority_status: priorityStatus,
        attributes: attributesJSON,
      });

      // Refresh list
      const updated = await getAllNodes();
      onNodesChange(updated);

      // Reset form
      setLabel("");
      setReading("");
      setMeaningEn("");
      setPersonalContext("");
    } catch (err) {
      console.error("Failed to insert node:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNode(id);
      const updated = await getAllNodes();
      onNodesChange(updated);
    } catch (err) {
      console.error("Failed to delete node:", err);
    }
  };

  const handleCyclePriority = async (node: NodeEntity) => {
    const cycleMap: Record<PriorityStatus, PriorityStatus> = {
      HARD: "REVIEW",
      REVIEW: "SETTLED",
      SETTLED: "HARD",
    };

    const nextPriority = cycleMap[node.priority_status];

    try {
      await updateNodePriority(node.id, nextPriority);
      const updated = await getAllNodes();
      onNodesChange(updated);
    } catch (err) {
      console.error("Failed to update priority:", err);
    }
  };

  return (
    <div className="grid-workbench">
      {/* Entry Toolbar */}
      <form className="entry-form" onSubmit={handleAddNode}>
        <input
          type="text"
          placeholder="Word / Kanji (e.g., 開ける)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Reading (e.g., あける)"
          value={reading}
          onChange={(e) => setReading(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="English Meaning (e.g., To open)"
          value={meaningEn}
          onChange={(e) => setMeaningEn(e.target.value)}
          required
        />
        <select
          value={domainType}
          onChange={(e) => setDomainType(e.target.value as DomainType)}
        >
          <option value="LEXICAL">Lexical (Word/Kanji)</option>
          <option value="GRAMMAR">Grammar Pattern</option>
          <option value="DOMAIN_HUB">Domain Hub</option>
        </select>
        <select
          value={priorityStatus}
          onChange={(e) => setPriorityStatus(e.target.value as PriorityStatus)}
        >
          <option value="HARD">HARD (Friction)</option>
          <option value="REVIEW">REVIEW (Normal)</option>
          <option value="SETTLED">SETTLED (Mastered)</option>
        </select>
        <input
          type="text"
          placeholder="Personal Context / Memory Note"
          value={personalContext}
          onChange={(e) => setPersonalContext(e.target.value)}
        />
        <button type="submit">+ Add Entry</button>
      </form>

      {/* Data Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Word / Entity</th>
              <th>Reading</th>
              <th>English Meaning</th>
              <th>Type</th>
              <th>Priority (Click to Cycle)</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {nodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-row">
                  No items logged yet. Use the bar above to manually create your first node.
                </td>
              </tr>
            ) : (
              nodes.map((node, index) => (
                <tr key={node.id} className={node.priority_status.toLowerCase()}>
                  <td className="col-seq">{nodes.length - index}</td>
                  <td className="col-label">{node.label}</td>
                  <td className="col-reading">{node.reading || "—"}</td>
                  <td className="col-meaning">{node.meaning_en || "—"}</td>
                  <td>
                    <span className="type-badge">{node.domain_type}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`priority-badge clickable ${node.priority_status.toLowerCase()}`}
                      onClick={() => handleCyclePriority(node)}
                      title="Click to toggle priority status"
                    >
                      {node.priority_status}
                    </button>
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="btn-delete"
                      onClick={() => handleDelete(node.id)}
                      title="Delete entry"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
