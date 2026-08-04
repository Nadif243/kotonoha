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
  reorderNodes,
} from "../core/db";
import ContextMenu, { ContextMenuTarget } from "./ContextMenu";
import "./GridView.css";

interface GridViewProps {
  nodes: NodeEntity[];
  onNodesChange: (nodes: NodeEntity[]) => void;
  onEdgesChange?: (edges: any[]) => void;
  onInspectNode?: (node: NodeEntity) => void;
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
}

type TabType = "LEXICAL" | "GRAMMAR" | "DOMAIN_HUB" | "DICT_INDEX";
type SortColumn = "INDEX" | "PRIORITY" | "MEANING" | "CUSTOM";
type SortDirection = "ASC" | "DESC";

export default function GridView({
  nodes,
  onNodesChange,
  onEdgesChange,
  onInspectNode,
  activeTab: externalActiveTab,
  onTabChange,
}: GridViewProps) {
  // Navigation Tab State
  const [internalTab, setInternalTab] = useState<TabType>("LEXICAL");
  const activeTab = externalActiveTab || internalTab;

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

  // Active Sort Indicator
  const [activeSortCol, setActiveSortCol] = useState<SortColumn>("CUSTOM");
  const [sortDir, setSortDir] = useState<SortDirection>("ASC");

  // Display Array State
  const [displayNodes, setDisplayNodes] = useState<NodeEntity[]>(nodes);

  // Drag & Drop Tracking
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Context Menu Popup Target State
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);

  const domainHubs = nodes.filter((n) => n.domain_type === "DOMAIN_HUB");

  // Keep local displayNodes synced with parent nodes prop when entries change
  useEffect(() => {
    setDisplayNodes(nodes);
  }, [nodes]);

  // Helper to get creation order sequence (#1, #2, etc)
  const getOriginalCreationIndex = (nodeId: string): number => {
    const sortedByOldest = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    return sortedByOldest.findIndex((n) => n.id === nodeId) + 1;
  };

  // Right-click Row Handler
  const handleRowContextMenu = (e: React.MouseEvent, nodeTarget: NodeEntity) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuTarget({
      x: e.clientX,
      y: e.clientY,
      node: nodeTarget,
    });
  };

  // Global Context Menu Disabler
  const handleContainerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Header Click Sorting
  const handleSortClick = async (col: SortColumn) => {
    let newDir: SortDirection = "ASC";
    if (activeSortCol === col) {
      newDir = sortDir === "ASC" ? "DESC" : "ASC";
    }

    setActiveSortCol(col);
    setSortDir(newDir);

    let sortedList = [...displayNodes];

    if (col === "PRIORITY") {
      const priorityOrder: Record<PriorityStatus, number> = {
        HARD: 1,
        REVIEW: 2,
        SETTLED: 3,
      };
      sortedList.sort((a, b) => {
        const diff =
          priorityOrder[a.priority_status || "REVIEW"] -
          priorityOrder[b.priority_status || "REVIEW"];
        return newDir === "ASC" ? diff : -diff;
      });
    } else if (col === "MEANING") {
      sortedList.sort((a, b) => {
        const comp = (a.meaning_en || "").localeCompare(b.meaning_en || "");
        return newDir === "ASC" ? comp : -comp;
      });
    } else if (col === "INDEX") {
      sortedList.sort((a, b) => {
        const comp = a.id.localeCompare(b.id);
        return newDir === "ASC" ? comp : -comp;
      });
    }

    // Immediately update local UI list
    setDisplayNodes(sortedList);

    // Persist snapshot sequence to SQLite in background
    try {
      await reorderNodes(sortedList.map((n) => n.id));
    } catch (err) {
      console.error("Failed to save sort order:", err);
    }
  };

  // POINTER EVENT REORDER HANDLERS
  const handlePointerDown = (index: number) => {
    setDraggingIndex(index);
    setDragOverIndex(index);
  };

  const handlePointerEnter = (index: number) => {
    if (draggingIndex !== null && draggingIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handlePointerUp = async () => {
    if (
      draggingIndex === null ||
      dragOverIndex === null ||
      draggingIndex === dragOverIndex
    ) {
      setDraggingIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Filter current tab's items
    const currentTabFiltered = displayNodes.filter((node) => {
      if (activeTab === "DICT_INDEX") return node.domain_type !== "DOMAIN_HUB";
      return node.domain_type === activeTab;
    });

    // Swap position in array
    const reorderedSubset = [...currentTabFiltered];
    const [movedItem] = reorderedSubset.splice(draggingIndex, 1);
    reorderedSubset.splice(dragOverIndex, 0, movedItem);

    // Reset sort column indicator to CUSTOM
    setActiveSortCol("CUSTOM");

    // Merge reordered subset back with non-active tab items
    const nonTabNodes = displayNodes.filter((node) => {
      if (activeTab === "DICT_INDEX") return node.domain_type === "DOMAIN_HUB";
      return node.domain_type !== activeTab;
    });

    const finalFullList = [...reorderedSubset, ...nonTabNodes];

    // Update UI immediately
    setDisplayNodes(finalFullList);

    setDraggingIndex(null);
    setDragOverIndex(null);

    // Persist to database
    try {
      await reorderNodes(finalFullList.map((n) => n.id));
      const updated = await getAllNodes();
      onNodesChange(updated);
    } catch (err) {
      console.error("Failed to save reordered list:", err);
    }
  };

  // Sync Form Domain Type when Tab Changes
  const handleTabChange = (tab: TabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }

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
      setDisplayNodes(updated);
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
      setDisplayNodes(updated);
      onNodesChange(updated);
      if (onEdgesChange) {
        const updatedEdges = await getAllEdges();
        onEdgesChange(updatedEdges || []);
      }
    } catch (err) {
      console.error("Failed to delete node:", err);
    }
  };

  // Dynamic Priority Cycle with Immediate Local UI Sync
  const handleCyclePriority = async (node: NodeEntity) => {
    const cycleMap: Record<PriorityStatus, PriorityStatus> = {
      HARD: "REVIEW",
      REVIEW: "SETTLED",
      SETTLED: "HARD",
    };

    const nextPriority = cycleMap[node.priority_status];

    // Optimistically update local display state immediately
    const updatedLocally = displayNodes.map((n) =>
      n.id === node.id ? { ...n, priority_status: nextPriority } : n
    );
    setDisplayNodes(updatedLocally);

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

  // Save Edit with Immediate Local UI Sync
  const handleSaveEdit = async () => {
    if (!editingNode) return;

    const trimmedL = editLabel.trim();
    const trimmedR = editReading.trim();
    const trimmedM = editMeaning.trim();

    // Optimistically update local UI state immediately
    const updatedLocally = displayNodes.map((n) =>
      n.id === editingNode.id
        ? { ...n, label: trimmedL, reading: trimmedR, meaning_en: trimmedM }
        : n
    );
    setDisplayNodes(updatedLocally);

    try {
      await updateNodeDetails(
        editingNode.id,
        trimmedL,
        trimmedR,
        trimmedM
      );

      const updated = await getAllNodes();
      onNodesChange(updated);
      setEditingNode(null);
    } catch (err) {
      console.error("Failed to save edited entry:", err);
    }
  };

  // Active Filtered Subset Nodes List
  const filteredNodes = displayNodes.filter((node) => {
    if (activeTab === "DICT_INDEX") {
      return node.domain_type !== "DOMAIN_HUB";
    }
    return node.domain_type === activeTab;
  });

  return (
    <div
      className={`grid-workbench tab-${activeTab.toLowerCase()}`}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContainerContextMenu}
    >
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

      {/* Grid Object Container Wrapper with Vertical Scroll */}
      <div className="table-container">
        <div className="grid-table-container">
          {/* Table Header */}
          <div className="grid-table-header" onContextMenu={(e) => e.preventDefault()}>
            <div
              className={`grid-cell cell-seq sortable ${
                activeSortCol === "INDEX" ? "active-sort" : ""
              }`}
              onClick={() => handleSortClick("INDEX")}
            >
              # <span className="sort-hint">{activeSortCol === "INDEX" ? (sortDir === "ASC" ? "▲" : "▼") : "↕"}</span>
            </div>

            <div className="grid-cell cell-label">
              {activeTab === "DOMAIN_HUB" ? "Hub Title" : "Entity / Word"}
            </div>

            {activeTab !== "DOMAIN_HUB" && (
              <div className="grid-cell cell-reading">Reading</div>
            )}

            {activeTab !== "DOMAIN_HUB" && (
              <div
                className={`grid-cell cell-meaning sortable ${
                  activeSortCol === "MEANING" ? "active-sort" : ""
                }`}
                onClick={() => handleSortClick("MEANING")}
              >
                Meaning / Description{" "}
                <span className="sort-hint">{activeSortCol === "MEANING" ? (sortDir === "ASC" ? "▲" : "▼") : "↕"}</span>
              </div>
            )}

            {activeTab === "DICT_INDEX" && (
              <div className="grid-cell cell-type">Type</div>
            )}

            {activeTab !== "DOMAIN_HUB" && (
              <div
                className={`grid-cell cell-priority sortable ${
                  activeSortCol === "PRIORITY" ? "active-sort" : ""
                }`}
                onClick={() => handleSortClick("PRIORITY")}
              >
                Priority{" "}
                <span className="sort-hint">{activeSortCol === "PRIORITY" ? (sortDir === "ASC" ? "▲" : "▼") : "↕"}</span>
              </div>
            )}

            <div className="grid-cell cell-actions">Actions</div>
          </div>

          {/* Table Body */}
          <div className="grid-table-body">
            {filteredNodes.length === 0 ? (
              <div className="empty-grid-row">
                No {activeTab.toLowerCase().replace("_", " ")} entries found.
              </div>
            ) : (
              filteredNodes.map((node, index) => (
                <div
                  key={node.id}
                  className={`grid-table-row ${node.priority_status.toLowerCase()} ${
                    draggingIndex === index ? "is-holding" : ""
                  } ${
                    dragOverIndex === index && draggingIndex !== index
                      ? "is-drag-over"
                      : ""
                  }`}
                  onPointerEnter={() => handlePointerEnter(index)}
                  onContextMenu={(e) => handleRowContextMenu(e, node)}
                >
                  {/* Drag Handle Grip */}
                  <div
                    className="grid-cell cell-seq drag-handle"
                    onPointerDown={() => handlePointerDown(index)}
                    title="Click & hold to move row"
                  >
                    <span className="drag-icon">⋮⋮</span> {index + 1}
                  </div>

                  {/* Word Label + Age Badge */}
                  <div className="grid-cell cell-label">
                    {editingNode?.id === node.id ? (
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="inline-edit-input"
                      />
                    ) : (
                      <div className="label-wrapper">
                        <span className="word-text">{node.label}</span>
                        <span className="creation-age-badge">
                          #{getOriginalCreationIndex(node.id)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Reading */}
                  {activeTab !== "DOMAIN_HUB" && (
                    <div className="grid-cell cell-reading">
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
                    </div>
                  )}

                  {/* Meaning */}
                  {activeTab !== "DOMAIN_HUB" && (
                    <div className="grid-cell cell-meaning">
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
                    </div>
                  )}

                  {/* Type Badge */}
                  {activeTab === "DICT_INDEX" && (
                    <div className="grid-cell cell-type">
                      <span className={`type-badge ${node.domain_type.toLowerCase()}`}>
                        {node.domain_type}
                      </span>
                    </div>
                  )}

                  {/* Priority Badge */}
                  {activeTab !== "DOMAIN_HUB" && (
                    <div className="grid-cell cell-priority">
                      <button
                        type="button"
                        className={`priority-badge clickable ${node.priority_status.toLowerCase()}`}
                        onClick={() => handleCyclePriority(node)}
                        title="Click to toggle priority status"
                      >
                        {node.priority_status}
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid-cell cell-actions">
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
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Render Context Menu Popup */}
      {contextMenuTarget && (
        <ContextMenu
          target={contextMenuTarget}
          onClose={() => setContextMenuTarget(null)}
          onInspect={(node) => {
            if (onInspectNode) {
              onInspectNode(node);
            }
          }}
          onQuickEdit={(node) => startEditing(node)}
          onCyclePriority={(node) => handleCyclePriority(node)}
          onDelete={(node) => handleDelete(node.id)}
        />
      )}
    </div>
  );
}
