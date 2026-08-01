import { useState } from "react";
import { NodeEntity, PriorityStatus, DomainType } from "../types/database";
import { insertNode, deleteNode, updateNodePriority, checkDuplicateNode, getAllNodes, insertEdge, updateNodeDetails, getAllEdges } from "../core/db";
import "./GridView.css";

interface GridViewProps {
  nodes: NodeEntity[];
  onNodesChange: (nodes: NodeEntity[]) => void;
  onEdgesChange?: (edges: any[]) => void;
}

type TabType = "LEXICAL" | "GRAMMAR" | "DOMAIN_HUB" | "DICT_INDEX";

export default function GridView({ nodes, onNodesChange, onEdgesChange }: GridViewProps) {
  // Navigation Tab State (Default: LEXICAL)
  const [activeTab, setActiveTab] = useState<TabType>("LEXICAL");

  // Form input states
  const [label, setLabel] = useState("");
  const [reading, setReading] = useState("");
  const [meaningEn, setMeaningEn] = useState("");
  const [domainType, setDomainType] = useState<DomainType>("LEXICAL");
  const [priorityStatus, setPriorityStatus] = useState<PriorityStatus>("REVIEW");
  const [selectedHubId, setSelectedHubId] = useState<string>("NONE");
  const [personalContext, setPersonalContext] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit State
  const [editingNode, setEditingNode] = useState<NodeEntity | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editReading, setEditReading] = useState("");
  const [editMeaning, setEditMeaning] = useState("");

  const domainHubs = nodes.filter((n) => n.domain_type === "DOMAIN_HUB");

  // Sync Form Domain Type when Tab Changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab !== "DICT_INDEX") {
      setDomainType(tab);
    }
  };

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedLabel = label.trim();
    const trimmedReading = reading.trim();
    const trimmedMeaning = meaningEn.trim();

    if (!trimmedLabel) return;

    // Validation rules per domain type
    if (domainType === "LEXICAL" && (!trimmedReading || !trimmedMeaning)) {
      setErrorMsg("Lexical entries require both Reading and English Meaning!");
      return;
    }

    try {
      // Check for duplicates
      const isDuplicate = await checkDuplicateNode(
        trimmedLabel,
        domainType === "LEXICAL" ? trimmedReading : "",
        domainType === "LEXICAL" ? trimmedMeaning : ""
      );

      if (isDuplicate) {
        setErrorMsg(`"${trimmedLabel}" already exists in your database!`);
        return;
      }

      const id = `node_${Date.now()}`;
      const attributesJSON = JSON.stringify({
        personal_context: personalContext || "",
        example_sentences: [],
      });

      await insertNode({
        id,
        label: trimmedLabel,
        reading: domainType === "DOMAIN_HUB" ? undefined : trimmedReading || undefined,
        meaning_en: domainType === "DOMAIN_HUB" ? undefined : trimmedMeaning || undefined,
        domain_type: domainType,
        priority_status: priorityStatus,
        attributes: attributesJSON,
      });

      // Connect to Hub if selected
      if (domainType !== "DOMAIN_HUB" && selectedHubId !== "NONE") {
        await insertEdge({
          source_node_id: id,
          target_node_id: selectedHubId,
          relation_type: "BELONGS_TO_HUB",
          is_directional: true,
        });

        if (onEdgesChange) {
          const updatedEdges = await getAllEdges();
          onEdgesChange(updatedEdges || []);
        }
      }

      // Refresh list
      const updated = await getAllNodes();
      onNodesChange(updated);

      // Reset form fields
      setLabel("");
      setReading("");
      setMeaningEn("");
      setPersonalContext("");
      setSelectedHubId("NONE");
      setErrorMsg(null);
    } catch (err) {
      console.error("Failed to insert node:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNode(id);
      const updated = await getAllNodes();
      onNodesChange(updated);
      if (onEdgesChange) {
        const updatedEdges = await getAllEdges();
        onEdgesChange(updatedEdges || []);
      }
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

  const startEditing = (node: NodeEntity) => {
    setEditingNode(node);
    setEditLabel(node.label || "");
    setEditReading(node.reading || "");
    setEditMeaning(node.meaning_en || "");
  };

  const handleSaveEdit = async () => {
    if (!editingNode) return;

    try {
      await updateNodeDetails(
        editingNode.id,
        editLabel.trim(),
        editReading.trim(),
        editMeaning.trim()
      );

      const updated = await getAllNodes();
      onNodesChange(updated);
      setEditingNode(null);
    } catch (err) {
      console.error("Failed to save edited entry:", err);
    }
  };

  // Filter nodes based on active tab
  const filteredNodes = nodes.filter((node) => {
    if (activeTab === "DICT_INDEX") {
      // Exclude DOMAIN_HUB entries from the dictionary index
      return node.domain_type !== "DOMAIN_HUB";
    }
    return node.domain_type === activeTab;
  });

  return (
    <div className="grid-workbench">
      {/* Category Navigation Tabs */}
      <div className="view-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === "LEXICAL" ? "active" : ""}`}
          onClick={() => handleTabChange("LEXICAL")}
        >
          Lexical (Words)
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "GRAMMAR" ? "active" : ""}`}
          onClick={() => handleTabChange("GRAMMAR")}
        >
          Grammar Rules
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "DOMAIN_HUB" ? "active" : ""}`}
          onClick={() => handleTabChange("DOMAIN_HUB")}
        >
          Domain Hubs
        </button>
        <button
          type="button"
          className={`tab-btn tab-all ${activeTab === "DICT_INDEX" ? "active" : ""}`}
          onClick={() => handleTabChange("DICT_INDEX")}
        >
          Dictionary Index
        </button>
      </div>

      {/* Adaptive Entry Toolbar */}
      <form className="entry-form" onSubmit={handleAddNode}>
        <select
          value={domainType}
          onChange={(e) => setDomainType(e.target.value as DomainType)}
          className="select-type"
        >
          <option value="LEXICAL">Lexical</option>
          <option value="GRAMMAR">Grammar</option>
          <option value="DOMAIN_HUB">Domain Hub</option>
        </select>

        {/* Input Field 1: Label */}
        <input
          type="text"
          placeholder={
            domainType === "DOMAIN_HUB"
              ? "Hub Title (e.g., Chapter 01, Media Stream, Novel Vol. 1)"
              : domainType === "GRAMMAR"
              ? "Pattern (e.g., 〜わけにはいかない)"
              : "Word / Kanji (e.g., 開ける)"
          }
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="input-main"
        />

        {/* Input Field 2: Reading */}
        {domainType !== "DOMAIN_HUB" && (
          <input
            type="text"
            placeholder={
              domainType === "GRAMMAR"
                ? "Reading / Kana (Optional)"
                : "Reading (e.g., あける)"
            }
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            required={domainType === "LEXICAL"}
          />
        )}

        {/* Input Field 3: Meaning */}
        {domainType !== "DOMAIN_HUB" && (
          <input
            type="text"
            placeholder={
              domainType === "GRAMMAR"
                ? "Usage / Explanation"
                : "English Meaning (e.g., To open)"
            }
            value={meaningEn}
            onChange={(e) => setMeaningEn(e.target.value)}
            required={domainType === "LEXICAL"}
          />
        )}

        {/* Attach to Hub Dropdown */}
        {domainType !== "DOMAIN_HUB" && (
          <select
            value={selectedHubId}
            onChange={(e) => setSelectedHubId(e.target.value)}
            className="select-hub"
          >
            <option value="NONE">-- Attach to Hub (None) --</option>
            {domainHubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                Hub: {hub.label}
              </option>
            ))}
          </select>
        )}

        {/* Priority Selector */}
        {domainType !== "DOMAIN_HUB" && (
          <select
            value={priorityStatus}
            onChange={(e) => setPriorityStatus(e.target.value as PriorityStatus)}
          >
            <option value="HARD">HARD</option>
            <option value="REVIEW">REVIEW</option>
            <option value="SETTLED">SETTLED</option>
          </select>
        )}

        {/* Personal Context Field */}
        <input
          type="text"
          placeholder="Memory Note"
          value={personalContext}
          onChange={(e) => setPersonalContext(e.target.value)}
          className="input-context"
        />

        <button type="submit">+ Add Entry</button>
      </form>

      {/* Duplicate Warning Banner */}
      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      {/* Dynamic Data Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{activeTab === "DOMAIN_HUB" ? "Hub Title" : "Entity / Word"}</th>
              {activeTab !== "DOMAIN_HUB" && <th>Reading</th>}
              {activeTab !== "DOMAIN_HUB" && <th>Meaning / Description</th>}
              {activeTab === "DICT_INDEX" && <th>Type</th>}
              {activeTab !== "DOMAIN_HUB" && <th>Priority</th>}
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredNodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-row">
                  No {activeTab.toLowerCase().replace("_", " ")} entries found.
                </td>
              </tr>
            ) : (
              filteredNodes.map((node, index) => (
                <tr key={node.id} className={node.priority_status.toLowerCase()}>
                  <td className="col-seq">{filteredNodes.length - index}</td>
                  <td className="col-label">
                    {editingNode?.id === node.id ? (
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="inline-edit-input"
                      />
                    ) : (
                      node.label
                    )}
                  </td>
                  {activeTab !== "DOMAIN_HUB" && (
                    <td className="col-reading">
                      {editingNode?.id === node.id ? (
                        <input
                          type="text"
                          value={editReading}
                          onChange={(e) => setEditReading(e.target.value)}
                          className="inline-edit-input"
                        />
                      ) : (
                        node.reading || "—"
                      )}
                    </td>
                  )}
                  {activeTab !== "DOMAIN_HUB" && (
                    <td className="col-meaning">
                      {editingNode?.id === node.id ? (
                        <input
                          type="text"
                          value={editMeaning}
                          onChange={(e) => setEditMeaning(e.target.value)}
                          className="inline-edit-input"
                        />
                      ) : (
                        node.meaning_en || "—"
                      )}
                    </td>
                  )}
                  {activeTab === "DICT_INDEX" && (
                    <td>
                      <span className={`type-badge ${node.domain_type.toLowerCase()}`}>
                        {node.domain_type}
                      </span>
                    </td>
                  )}
                  {activeTab !== "DOMAIN_HUB" && (
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
                  )}
                  <td className="col-actions">
                    {editingNode?.id === node.id ? (
                      <div className="edit-btn-group">
                        <button type="button" className="btn-save" onClick={handleSaveEdit}>
                          Save
                        </button>
                        <button type="button" className="btn-cancel-edit" onClick={() => setEditingNode(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="action-btn-group">
                        <button
                          type="button"
                          className="btn-edit"
                          onClick={() => startEditing(node)}
                          title="Edit entry details"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-delete"
                          onClick={() => handleDelete(node.id)}
                          title="Delete entry"
                        >
                          ×
                        </button>
                      </div>
                    )}
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
