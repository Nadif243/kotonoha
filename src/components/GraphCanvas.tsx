import { useEffect, useRef, useState } from "react";
import cytoscape, { Core } from "cytoscape";
import { NodeEntity, EdgeEntity } from "../types/database";
import { insertEdge, deleteEdge, checkEdgeConflict, getAllEdges, updateNodeContext, getAllNodes } from "../core/db";
import "./GraphCanvas.css";

interface GraphCanvasProps {
  nodes: NodeEntity[];
  edges: EdgeEntity[];
  onNodesChange: (nodes: NodeEntity[]) => void;
  onEdgesChange: (edges: EdgeEntity[]) => void;
}

export default function GraphCanvas({
  nodes = [],
  edges = [],
  onNodesChange,
  onEdgesChange,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Synchronous State Tracking Refs
  const nodesRef = useRef<NodeEntity[]>(nodes);
  const edgesRef = useRef<EdgeEntity[]>(edges);
  const sourceNodeIdRef = useRef<string | null>(null);
  const relationTypeRef = useRef<string>("SIMILAR_KANJI");

  // React State for UI
  const [sourceNodeId, setSourceNodeIdState] = useState<string | null>(null);
  const [relationType, setRelationTypeState] = useState<string>("SIMILAR_KANJI");
  const [isCanvasReady, setIsCanvasReady] = useState<boolean>(false);

  // Right Sidebar State
  const [inspectedNode, setInspectedNode] = useState<NodeEntity | null>(null);
  const [editedContext, setEditedContext] = useState<string>("");
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  // Double-tap timestamp tracker
  const lastTapInfoRef = useRef<{ time: number; nodeId: string | null }>({
    time: 0,
    nodeId: null,
  });

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  const setSourceNode = (id: string | null) => {
    sourceNodeIdRef.current = id;
    setSourceNodeIdState(id);

    if (cyRef.current) {
      cyRef.current.nodes().removeClass("highlighted");
      if (id) {
        cyRef.current.$id(id).addClass("highlighted");
      }
    }
  };

  const handleRelationChange = (newType: string) => {
    relationTypeRef.current = newType;
    setRelationTypeState(newType);
  };

  const getPersonalContext = (attributesStr?: string): string => {
    if (!attributesStr) return "";
    try {
      const parsed = JSON.parse(attributesStr);
      return parsed.personal_context || "";
    } catch {
      return "";
    }
  };

  const openSidebarForNode = (nodeId: string) => {
    const targetNode = nodesRef.current.find((n) => n.id === nodeId);
    if (targetNode) {
      setInspectedNode(targetNode);
      setEditedContext(getPersonalContext(targetNode.attributes));
      setSourceNode(null); // Clear highlight ring
    }
  };

  const handleSaveNotes = async () => {
    if (!inspectedNode) return;
    setIsSavingNote(true);

    try {
      await updateNodeContext(inspectedNode.id, editedContext);
      const updatedNodes = await getAllNodes();
      onNodesChange(updatedNodes);

      setInspectedNode((prev) =>
        prev
          ? {
              ...prev,
              attributes: JSON.stringify({
                personal_context: editedContext,
                example_sentences: [],
              }),
            }
          : null
      );
    } catch (err) {
      console.error("Failed to update context note:", err);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleZoomIn = () => {
    if (!cyRef.current) return;
    cyRef.current.zoom({
      level: cyRef.current.zoom() * 1.2,
      renderedPosition: {
        x: cyRef.current.width() / 2,
        y: cyRef.current.height() / 2,
      },
    });
  };

  const handleZoomOut = () => {
    if (!cyRef.current) return;
    cyRef.current.zoom({
      level: cyRef.current.zoom() * 0.8,
      renderedPosition: {
        x: cyRef.current.width() / 2,
        y: cyRef.current.height() / 2,
      },
    });
  };

  const handleFitView = () => {
    if (!cyRef.current) return;
    cyRef.current.fit(undefined, 40);
  };

  // INITIALIZE CANVAS ONCE
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      autounselectify: true,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            color: "#f4f4f5",
            "font-size": "11px",
            "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": "70px",
            "border-width": 2,
            "border-color": "#27272a",
            "background-color": "#18181b",
          },
        },
        {
          selector: 'node[domain = "LEXICAL"]',
          style: { shape: "ellipse" },
        },
        {
          selector: 'node[domain = "GRAMMAR"]',
          style: { shape: "round-rectangle" },
        },
        {
          selector: 'node[domain = "DOMAIN_HUB"]',
          style: { shape: "diamond" },
        },
        {
          selector: 'node[priority = "HARD"]',
          style: {
            width: 58,
            height: 58,
            "border-color": "#f97316",
            "border-width": 2.5,
            "background-color": "#2a1205",
            "font-weight": "bold",
            "font-size": "12px",
          },
        },
        {
          selector: 'node[priority = "REVIEW"]',
          style: {
            width: 46,
            height: 46,
            "border-color": "#6366f1",
            "background-color": "#0f0e26",
          },
        },
        {
          selector: 'node[priority = "SETTLED"]',
          style: {
            width: 36,
            height: 36,
            "border-color": "#10b981",
            "background-color": "#021a12",
            "font-size": "9.5px",
            color: "#a1a1aa",
          },
        },
        {
          selector: "node.highlighted",
          style: {
            "border-width": 3,
            "border-color": "#ffffff",
            "background-color": "#27272a",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#3f3f46",
            "curve-style": "bezier",
            label: "data(label)",
            color: "#a1a1aa",
            "font-size": "8px",
            "text-rotation": "autorotate",
            "text-margin-y": -6,
            "text-background-color": "#09090b",
            "text-background-opacity": 0.85,
            "text-background-padding": "2px",
            "text-border-radius": "2px",
          },
        },
        {
          selector: 'edge[label = "SYNONYM"], edge[label = "OPPOSITE"], edge[label = "SIMILAR_KANJI"]',
          style: {
            "source-arrow-shape": "vee",
            "target-arrow-shape": "vee",
            "source-arrow-color": "#52525b",
            "target-arrow-color": "#52525b",
          },
        },
        {
          selector: 'edge[label = "TRANSITIVE_PAIR"], edge[label = "USES_GRAMMAR"]',
          style: {
            "source-arrow-shape": "none",
            "target-arrow-shape": "vee",
            "target-arrow-color": "#52525b",
          },
        },
        {
          selector: "edge:hover",
          style: {
            width: 2.5,
            "line-color": "#ef4444",
            "source-arrow-color": "#ef4444",
            "target-arrow-color": "#ef4444",
            color: "#ef4444",
          },
        },
        {
          selector: 'edge[label = "TRANSITIVE_PAIR"], edge[label = "USES_GRAMMAR"], edge[label = "BELONGS_TO_HUB"]',
          style: {
            "source-arrow-shape": "none",
            "target-arrow-shape": "vee",
            "target-arrow-color": "#6366f1",
        },
        },
      ],
    });

    // TAP LISTENER WITH BOTH DOUBLE-TAP TIME DELTA & SHIFT-CLICK / RIGHT-CLICK FALLBACKS
    cy.on("tap", "node", (evt) => {
      const clickedNodeId = evt.target.id();
      const now = Date.now();
      const lastTap = lastTapInfoRef.current;
      const originalEvent = evt.originalEvent as MouseEvent;

      // Fallback 1: Shift + Click OR Right Click instantly opens sidebar
      if (originalEvent && (originalEvent.shiftKey || originalEvent.button === 2)) {
        openSidebarForNode(clickedNodeId);
        return;
      }

      // Check double-tap time delta (350ms)
      if (lastTap.nodeId === clickedNodeId && now - lastTap.time < 350) {
        openSidebarForNode(clickedNodeId);
        lastTapInfoRef.current = { time: 0, nodeId: null };
        return;
      }

      lastTapInfoRef.current = { time: now, nodeId: clickedNodeId };

      // SINGLE CLICK LINKING LOGIC
      const currentSource = sourceNodeIdRef.current;

      if (!currentSource) {
        setSourceNode(clickedNodeId);
      } else if (currentSource === clickedNodeId) {
        setSourceNode(null);
      } else {
        handleCreateEdge(currentSource, clickedNodeId);
      }
    });

    // Native Cytoscape Double Tap Event (Secondary Backup)
    cy.on("dbltap", "node", (evt) => {
      openSidebarForNode(evt.target.id());
    });

    // Right-click context menu prevent default
    cy.on("cxttap", "node", (evt) => {
      openSidebarForNode(evt.target.id());
    });

    // Delete Link Handler
    cy.on("tap", "edge", async (evt) => {
      const edgeId = evt.target.id();
      const edgeData = evt.target.data();

      const confirmDelete = window.confirm(
        `Remove relation "${edgeData.label}" between these nodes?`
      );

      if (confirmDelete) {
        try {
          await deleteEdge(edgeId);
          const updatedEdges = await getAllEdges();
          onEdgesChange(updatedEdges || []);
        } catch (err) {
          console.error("Failed to delete edge:", err);
        }
      }
    });

    // Background Canvas Tap
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        setSourceNode(null);
      }
    });

    cyRef.current = cy;
    setIsCanvasReady(true);

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, []);

  // DYNAMIC DIFF UPDATER
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const validNodeIds = new Set(safeNodes.map((n) => n.id));

    const safeEdges = (Array.isArray(edges) ? edges : []).filter(
      (e) => validNodeIds.has(e.source_node_id) && validNodeIds.has(e.target_node_id)
    );

    cy.batch(() => {
      const currentCyNodes = new Set(cy.nodes().map((n) => n.id()));
      const incomingNodeIds = new Set(safeNodes.map((n) => n.id));

      const nodesToAdd = safeNodes.filter((n) => !currentCyNodes.has(n.id));
      if (nodesToAdd.length > 0) {
        cy.add(
          nodesToAdd.map((node) => ({
            group: "nodes",
            data: {
              id: node.id,
              label: `${node.label}\n${node.reading || ""}`,
              priority: node.priority_status || "REVIEW",
              domain: node.domain_type || "LEXICAL",
            },
          }))
        );

        const unpositionedElements = cy.nodes().filter((n) => !currentCyNodes.has(n.id()));
        unpositionedElements.layout({
          name: "cose",
          animate: false,
          nodeRepulsion: () => 14000,
          idealEdgeLength: () => 130,
        }).run();
      }

      cy.nodes().forEach((n) => {
        if (!incomingNodeIds.has(n.id())) {
          cy.remove(n);
        }
      });

      const currentCyEdges = new Set(cy.edges().map((e) => e.id()));
      const incomingEdgeIds = new Set(safeEdges.map((e) => e.id));

      const edgesToAdd = safeEdges.filter((e) => !currentCyEdges.has(e.id));
      if (edgesToAdd.length > 0) {
        cy.add(
          edgesToAdd.map((edge) => ({
            group: "edges",
            data: {
              id: edge.id,
              source: edge.source_node_id,
              target: edge.target_node_id,
              label: edge.relation_type || "",
            },
          }))
        );
      }

      cy.edges().forEach((e) => {
        if (!incomingEdgeIds.has(e.id())) {
          cy.remove(e);
        }
      });
    });
  }, [nodes, edges]);

  const handleCreateEdge = async (sourceId: string, targetId: string) => {
    const activeRelation = relationTypeRef.current;

    try {
      const conflictCheck = await checkEdgeConflict(sourceId, targetId, activeRelation);

      if (conflictCheck.hasError) {
        alert(conflictCheck.message);
        setSourceNode(null);
        return;
      }

      await insertEdge({
        source_node_id: sourceId,
        target_node_id: targetId,
        relation_type: activeRelation,
        is_directional: ["TRANSITIVE_PAIR", "USES_GRAMMAR"].includes(activeRelation),
      });

      const updatedEdges = await getAllEdges();
      onEdgesChange(updatedEdges || []);
    } catch (err) {
      console.error("Failed to create edge:", err);
    } finally {
      setSourceNode(null);
    }
  };

  return (
    <div className="graph-container">
      {/* Canvas Toolbar */}
      <div className="canvas-toolbar">
        <div className="toolbar-row top-row">
          <span className="control-label">
            {sourceNodeId ? "Select target node to link..." : "Click to link"}
          </span>
          <div className="select-wrapper">
            <select
              value={relationType}
              onChange={(e) => handleRelationChange(e.target.value)}
            >
              <option value="SIMILAR_KANJI">SIMILAR_KANJI</option>
              <option value="TRANSITIVE_PAIR">TRANSITIVE_PAIR</option>
              <option value="SYNONYM">SYNONYM</option>
              <option value="OPPOSITE">OPPOSITE</option>
              <option value="USES_GRAMMAR">USES_GRAMMAR</option>
              <option value="BELONGS_TO_HUB">BELONGS_TO_HUB</option>
            </select>
            {sourceNodeId && (
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setSourceNode(null)}
              >
                Cancel Link
              </button>
            )}
          </div>
        </div>
        <div className="toolbar-row bottom-row">
          <span className="sub-control-label">
            Double-click / Right-click / Shift-click to inspect
          </span>
        </div>
      </div>

      {/* Floating Viewport Controls */}
      <div className={`viewport-controls ${inspectedNode ? "sidebar-open" : ""}`}>
        <div className="zoom-row">
          <button type="button" onClick={handleZoomIn} title="Zoom In">+</button>
          <button type="button" onClick={handleZoomOut} title="Zoom Out">−</button>
        </div>
        <div className="viewport-divider" />
        <button type="button" onClick={handleFitView} className="btn-fit" title="Recenter View">
          Center
        </button>
      </div>

      {nodes.length === 0 && (
        <div className="empty-canvas-msg">
          No nodes in database. Add entries in the Grid View first!
        </div>
      )}

      {/* 2D Canvas Container */}
      <div
        ref={containerRef}
        className={`cytoscape-canvas ${isCanvasReady ? "ready" : ""}`}
      />

      {/* Right Docked Inspector Sidebar */}
      {inspectedNode && (
        <div className="inspector-sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title-group">
              <span className="sidebar-label">{inspectedNode.label || ""}</span>
              <span className="sidebar-reading">({inspectedNode.reading || "—"})</span>
            </div>
            <button
              type="button"
              className="sidebar-close"
              onClick={() => setInspectedNode(null)}
            >
              ×
            </button>
          </div>

          <div className="sidebar-body">
            <div className="sidebar-field">
              <span className="field-label">English Meaning</span>
              <span className="field-value">{inspectedNode.meaning_en || "—"}</span>
            </div>

            <div className="sidebar-field-row">
              <div className="sidebar-field">
                <span className="field-label">Domain Type</span>
                <span className="type-badge">{inspectedNode.domain_type || "LEXICAL"}</span>
              </div>
              <div className="sidebar-field">
                <span className="field-label">Priority</span>
                <span className={`priority-badge ${(inspectedNode.priority_status || "REVIEW").toLowerCase()}`}>
                  {inspectedNode.priority_status || "REVIEW"}
                </span>
              </div>
            </div>

            <div className="sidebar-field">
              <span className="field-label">Personal Context / Memory Note</span>
              <textarea
                className="context-textarea"
                placeholder="Write memory anchors, media contexts, or usage notes..."
                value={editedContext}
                onChange={(e) => setEditedContext(e.target.value)}
              />
              <button
                type="button"
                className="btn-save-note"
                onClick={handleSaveNotes}
                disabled={isSavingNote}
              >
                {isSavingNote ? "Saving..." : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
