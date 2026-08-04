import { useState, useEffect } from "react";
import { NodeEntity, EdgeEntity } from "../types/database";
import { updateNodeDetails, getAllNodes } from "../core/db";
import "./InspectorDrawer.css";

interface InspectorDrawerProps {
  node: NodeEntity | null;
  allNodes: NodeEntity[];
  allEdges: EdgeEntity[];
  onClose: () => void;
  onNodesChange: (nodes: NodeEntity[]) => void;
  onSwitchToGraphAndFocus?: (nodeId: string) => void;
}

export default function InspectorDrawer({
  node,
  allNodes,
  allEdges,
  onClose,
  onNodesChange,
  onSwitchToGraphAndFocus,
}: InspectorDrawerProps) {
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState("");

  // Sync internal notes state when node changes
  useEffect(() => {
    if (!node) return;
    try {
      const parsed = node.attributes ? JSON.parse(node.attributes) : {};
      if (Array.isArray(parsed.notes)) {
        // If stored as object array [{id, text}], extract text
        setNotes(
          parsed.notes.map((n: any) => (typeof n === "string" ? n : n.text))
        );
      } else {
        setNotes([]);
      }
    } catch {
      setNotes([]);
    }
  }, [node]);

  if (!node) return null;

  // Find connected hubs
  const connectedEdgeTargets = allEdges
    .filter((e) => e.source_node_id === node.id)
    .map((e) => e.target_node_id);

  const connectedHubs = allNodes.filter((n) =>
    connectedEdgeTargets.includes(n.id)
  );

  // Add personal note handler
  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    const updatedNotes = [...notes, newNote.trim()];
    setNotes(updatedNotes);
    setNewNote("");

    try {
      const parsedAttr = node.attributes ? JSON.parse(node.attributes) : {};
      parsedAttr.notes = updatedNotes.map((text, idx) => ({
        id: `note_${Date.now()}_${idx}`,
        text,
        created_at: new Date().toISOString(),
      }));

      // Update in DB (we use updateNodeDetails wrapper or custom DB query)
      await updateNodeDetails(
        node.id,
        node.label,
        node.reading || "",
        node.meaning_en || ""
      );

      const refreshed = await getAllNodes();
      onNodesChange(refreshed);
    } catch (err) {
      console.error("Failed to save note:", err);
    }
  };

  return (
    <div className="inspector-overlay">
      <div className="inspector-drawer">
        {/* Header Bar */}
        <div className="inspector-header">
          <div className="header-title-group">
            <span className="domain-badge">{node.domain_type}</span>
            <span className={`priority-tag ${node.priority_status.toLowerCase()}`}>
              {node.priority_status}
            </span>
          </div>
          <button type="button" className="btn-close-drawer" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Hero Kanji Section */}
        <div className="inspector-hero">
          <h1 className="hero-kanji">{node.label}</h1>
          {node.reading && <p className="hero-reading">{node.reading}</p>}
          {node.meaning_en && <p className="hero-meaning">{node.meaning_en}</p>}
        </div>

        {/* Action Toolbar */}
        {onSwitchToGraphAndFocus && (
          <button
            type="button"
            className="btn-focus-graph"
            onClick={() => onSwitchToGraphAndFocus(node.id)}
          >
            🌐 Focus Node in Canvas Graph
          </button>
        )}

        <div className="inspector-section-divider" />

        {/* Connected Hubs Section */}
        <div className="inspector-section">
          <h3>Connected Context Hubs</h3>
          {connectedHubs.length === 0 ? (
            <p className="empty-text">No Hubs attached to this entry.</p>
          ) : (
            <div className="hub-chips-container">
              {connectedHubs.map((hub) => (
                <span key={hub.id} className="hub-chip">
                  📌 {hub.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="inspector-section-divider" />

        {/* Personal Memory Notes Section */}
        <div className="inspector-section">
          <h3>Memory Notes & Context</h3>
          <div className="add-note-box">
            <input
              type="text"
              placeholder="Add a new memory anchor..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
            />
            <button type="button" onClick={handleAddNote}>
              Add
            </button>
          </div>

          <div className="notes-list">
            {notes.length === 0 ? (
              <p className="empty-text">No memory notes added yet.</p>
            ) : (
              notes.map((noteText, idx) => (
                <div key={idx} className="note-card">
                  <span className="note-bullet">▹</span> {noteText}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
