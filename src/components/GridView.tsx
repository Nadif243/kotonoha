import { useState, useEffect } from "react";
import { NodeEntity, PriorityStatus, DomainType } from "../types/database";
import {
  insertNode,
  deleteNode,
  updateNodePriority,
  checkDuplicateNode,
  getAllNodes,
  insertEdge,
  updateNodeDetails,
  getAllEdges,
} from "../core/db";
import "./GridView.css";

interface GridViewProps {
  nodes: NodeEntity[];
  onNodesChange: (nodes: NodeEntity[]) => void;
  onEdgesChange?: (edges: any[]) => void;
}

type TabType = "LEXICAL" | "GRAMMAR" | "DOMAIN_HUB" | "DICT_INDEX";
type SortColumn = "INDEX" | "PRIORITY" | "MEANING";
type SortDirection = "ASC" | "DESC";

export default function GridView({
  nodes,
  onNodesChange,
  onEdgesChange,
}: GridViewProps) {
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

  // Persistent Sorting State (Saved to localStorage)
  const [sortColumn, setSortColumn] = useState<SortColumn>(() => {
    return (
      (localStorage.getItem("kotonoha_grid_sort_col") as SortColumn) || "INDEX"
    );
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    return (
      (localStorage.getItem("kotonoha_grid_sort_dir") as SortDirection) ||
      "DESC"
    );
  });

  const domainHubs = nodes.filter((n) => n.domain_type === "DOMAIN_HUB");

  // Save sorting preference changes to localStorage
  useEffect(() => {
    localStorage.setItem("kotonoha_grid_sort_col", sortColumn);
    localStorage.setItem("kotonoha_grid_sort_dir", sortDirection);
  }, [sortColumn, sortDirection]);

  // Handle Header Column Click for Sorting
  const handleSortClick = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === "ASC" ? "DESC" : "ASC"));
    } else {
      setSortColumn(col);
      setSortDirection("ASC");
    }
  };

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

      // Structure new note as array while remaining compatible
      const attributesJSON = JSON.stringify({
        notes: personalContext.trim()
          ? [{ id: `note_${Date.now()}`, text: personalContext.trim(), created_at: new Date().toISOString() }]
          : [],
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
    if (!window.confirm("Delete this entry and its relations?")) return;
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

  // Filter and Sort Processing Logic
  const getProcessedNodes = () => {
    let result = nodes.filter((node) => {
      if (activeTab === "DICT_INDEX") {
        return node.domain_type !== "DOMAIN_HUB";
      }
      return node.domain_type === activeTab;
    });

    result.sort((a, b) => {
      if (sortColumn === "INDEX") {
        const idA = a.id;
        const idB = b.id;
        return sortDirection === "ASC"
          ? idA.localeCompare(idB)
          : idB.localeCompare(idA);
      }

      if (sortColumn === "PRIORITY") {
        const priorityOrder: Record<PriorityStatus, number> = {
          HARD: 1,
          REVIEW: 2,
          SETTLED: 3,
        };
        const pA = priorityOrder[a.priority_status || "REVIEW"];
        const pB = priorityOrder[b.priority_status || "REVIEW"];
        return sortDirection === "ASC" ? pA - pB : pB - pA;
      }

      if (sortColumn === "MEANING") {
        const mA = (a.meaning_en || "").toLowerCase();
        const mB = (b.meaning_en || "").toLowerCase();
        return sortDirection === "ASC"
          ? mA.localeCompare(mB)
          : mB.localeCompare(mA);
      }

      return 0;
    });

    return result;
  };

  const processedNodes = getProcessedNodes();

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

      {/* Adaptive Entry Toolbar with Tooltips */}
      <form className="entry-form" onSubmit={handleAddNode}>
        <div className="input-group" title="Entity domain category">
          <select
            value={domainType}
            onChange={(e) => setDomainType(e.target.value as DomainType)}
            className="select-type"
          >
            <option value="LEXICAL">Lexical</option>
            <option value="GRAMMAR">Grammar</option>
            <option value="DOMAIN_HUB">Domain Hub</option>
          </select>
        </div>

        {/* Input Field 1: Label */}
        <div
          className="input-group"
          title={
            domainType === "DOMAIN_HUB"
              ? "Hub Title (e.g., Chapter 01, Novel Vol. 1)"
              : domainType === "GRAMMAR"
              ? "Grammar Pattern (e.g., 〜わけにはいかない)"
              : "Japanese Word / Kanji (e.g., 開ける)"
          }
        >
          <input
            type="text"
            placeholder={
              domainType === "DOMAIN_HUB"
                ? "Hub Title (e.g., Chapter 01, Novel Vol. 1)"
                : domainType === "GRAMMAR"
                ? "Pattern (e.g., 〜わけにはいかない)"
                : "Word / Kanji (e.g., 開ける) *"
            }
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="input-main"
          />
        </div>

        {/* Input Field 2: Reading */}
        {domainType !== "DOMAIN_HUB" && (
          <div className="input-group" title="Kana reading / Furigana">
            <input
              type="text"
              placeholder={
                domainType === "GRAMMAR"
                  ? "Reading / Kana (Optional)"
                  : "Reading (e.g., あける) *"
              }
              value={reading}
              onChange={(e) => setReading(e.target.value)}
              required={domainType === "LEXICAL"}
            />
          </div>
        )}

        {/* Input Field 3: Meaning */}
        {domainType !== "DOMAIN_HUB" && (
          <div className="input-group" title="English translation / usage explanation">
            <input
              type="text"
              placeholder={
                domainType === "GRAMMAR"
                  ? "Usage / Explanation"
                  : "English Meaning (e.g., To open) *"
              }
              value={meaningEn}
              onChange={(e) => setMeaningEn(e.target.value)}
              required={domainType === "LEXICAL"}
            />
          </div>
        )}

        {/* Attach to Hub Dropdown */}
        {domainType !== "DOMAIN_HUB" && (
          <div className="input-group" title="Optionally attach entry to a Context Hub">
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
          </div>
        )}

        {/* Priority Selector */}
        {domainType !== "DOMAIN_HUB" && (
          <div className="input-group" title="Initial study priority status">
            <select
              value={priorityStatus}
              onChange={(e) =>
                setPriorityStatus(e.target.value as PriorityStatus)
              }
            >
              <option value="HARD">HARD</option>
              <option value="REVIEW">REVIEW</option>
              <option value="SETTLED">SETTLED</option>
            </select>
          </div>
        )}

        {/* Personal Context Field */}
        <div className="input-group" title="Personal context or memory note">
          <input
            type="text"
            placeholder="Memory Note"
            value={personalContext}
            onChange={(e) => setPersonalContext(e.target.value)}
            className="input-context"
          />
        </div>

        <button type="submit" className="btn-add-entry">
          + Add Entry
        </button>
      </form>

      {/* Duplicate Warning Banner */}
      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      {/* Dynamic Data Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th
                className="sortable-th col-seq"
                onClick={() => handleSortClick("INDEX")}
                title="Click to sort by entry creation order"
              >
                # {sortColumn === "INDEX" ? (sortDirection === "ASC" ? "▲" : "▼") : ""}
              </th>
              <th>{activeTab === "DOMAIN_HUB" ? "Hub Title" : "Entity / Word"}</th>
              {activeTab !== "DOMAIN_HUB" && <th>Reading</th>}
              {activeTab !== "DOMAIN_HUB" && (
                <th
                  className="sortable-th"
                  onClick={() => handleSortClick("MEANING")}
                  title="Click to sort alphabetically by meaning"
                >
                  Meaning / Description{" "}
                  {sortColumn === "MEANING" ? (sortDirection === "ASC" ? "▲" : "▼") : ""}
                </th>
              )}
              {activeTab === "DICT_INDEX" && <th>Type</th>}
              {activeTab !== "DOMAIN_HUB" && (
                <th
                  className="sortable-th"
                  onClick={() => handleSortClick("PRIORITY")}
                  title="Click to group by learning priority (Hard -> Review -> Settled)"
                >
                  Priority{" "}
                  {sortColumn === "PRIORITY" ? (sortDirection === "ASC" ? "▲" : "▼") : ""}
                </th>
              )}
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {processedNodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-row">
                  No {activeTab.toLowerCase().replace("_", " ")} entries found.
                </td>
              </tr>
            ) : (
              processedNodes.map((node, index) => (
                <tr key={node.id} className={node.priority_status.toLowerCase()}>
                  <td className="col-seq">
                    {sortDirection === "DESC" && sortColumn === "INDEX"
                      ? processedNodes.length - index
                      : index + 1}
                  </td>
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
                        <button
                          type="button"
                          className="btn-cancel-edit"
                          onClick={() => setEditingNode(null)}
                        >
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
