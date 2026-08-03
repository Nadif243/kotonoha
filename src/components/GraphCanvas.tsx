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

type LayerLens = "ALL" | "DICTIONARY_ONLY" | "HUB_MAP_ONLY";

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
  const activeLensRef = useRef<LayerLens>("ALL");

  // React States for UI Controls
  const [sourceNodeId, setSourceNodeIdState] = useState<string | null>(null);
  const [relationType, setRelationTypeState] = useState<string>("SIMILAR_KANJI");
  const [activeLens, setActiveLens] = useState<LayerLens>("ALL");
  const [isCanvasReady, setIsCanvasReady] = useState<boolean>(false);

  // Right Sidebar State
  const [inspectedNode, setInspectedNode] = useState<NodeEntity | null>(null);
  const [editedContext, setEditedContext] = useState<string>("");
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  // Double-tap tracker
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

    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().removeClass("highlighted");

    if (id) {
      cy.$id(id).addClass("highlighted");
      applyNodeSpotlight(id);
    } else {
      clearNodeSpotlight();
    }
  };

  const applyNodeSpotlight = (focusedNodeId: string) => {
    const cy = cyRef.current;
    if (!cy) return;

    const focusedNode = cy.$id(focusedNodeId);
    if (!focusedNode.length) return;

    const neighborhood = focusedNode.closedNeighborhood();

    cy.batch(() => {
      cy.elements().removeClass("dimmed").removeClass("spotlight");
      cy.elements().difference(neighborhood).addClass("dimmed");
      neighborhood.addClass("spotlight");
    });
  };

  const clearNodeSpotlight = () => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.elements().removeClass("dimmed").removeClass("spotlight");
    });
  };

  const handleRelationChange = (newType: string) => {
    relationTypeRef.current = newType;
    setRelationTypeState(newType);
  };

  const handleLensChange = (lens: LayerLens) => {
    activeLensRef.current = lens;
    setActiveLens(lens);
    setSourceNode(null);
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

  // Helper to determine if a relation option is valid for the selected source node
  const isOptionDisabled = (relType: string): boolean => {
    if (!sourceNodeId) return false; // If no node clicked yet, all options remain enabled

    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return false;

    const sourceType = sourceNode.domain_type;

    if (sourceType === "LEXICAL") {
      // Words cannot start MUTUAL_HUB
      return relType === "MUTUAL_HUB";
    }

    if (sourceType === "GRAMMAR") {
      // Grammar rules can only link to Hubs
      return relType !== "BELONGS_TO_HUB";
    }

    if (sourceType === "DOMAIN_HUB") {
      // Hubs can only link to other Hubs
      return relType !== "BELONGS_TO_HUB" && relType !== "MUTUAL_HUB";
    }

    return false;
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

  // INITIALIZE CANVAS
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      autounselectify: true,
      elements: [],
      style: [
        // Base Node Style
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
            transition: "property: opacity, border-color, background-color; duration: 0.2s;",
          },
        },
        // Domain Shapes
        {
          selector: 'node[domain = "LEXICAL"]',
          style: { shape: "ellipse" },
        },
        {
          selector: 'node[domain = "GRAMMAR"]',
          style: {
            shape: "round-rectangle",
            "border-color": "#3b82f6",
            "background-color": "#0f172a",
            width: 52,
            height: 40,
          },
        },
        {
          selector: 'node[domain = "DOMAIN_HUB"]',
          style: {
            shape: "diamond",
            "border-color": "#a855f7",
            "background-color": "#2e1065",
            width: 64,
            height: 64,
            "font-weight": "bold",
          },
        },
        // Priority Overrides for Lexical / Grammar Nodes
        {
          selector: 'node[domain != "DOMAIN_HUB"][priority = "HARD"]',
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
          selector: 'node[domain != "DOMAIN_HUB"][priority = "REVIEW"]',
          style: {
            width: 46,
            height: 46,
            "border-color": "#6366f1",
            "background-color": "#0f0e26",
          },
        },
        {
          selector: 'node[domain != "DOMAIN_HUB"][priority = "SETTLED"]',
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
            "background-color": "#3f3f46",
          },
        },
        // Edge Base Styling
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
            transition: "property: opacity, line-color; duration: 0.2s;",
          },
        },
        // Symmetric Relations (Bidirectional Arrows)
        {
          selector: 'edge[label = "SYNONYM"], edge[label = "OPPOSITE"], edge[label = "SIMILAR_KANJI"]',
          style: {
            "source-arrow-shape": "vee",
            "target-arrow-shape": "vee",
            "source-arrow-color": "#52525b",
            "target-arrow-color": "#52525b",
          },
        },
        // Directional Relations (Asymmetric Arrow pointing to Target)
        {
          selector: 'edge[label = "TRANSITIVE_PAIR"], edge[label = "USES_GRAMMAR"], edge[label = "BELONGS_TO_HUB"]',
          style: {
            "source-arrow-shape": "none",
            "target-arrow-shape": "vee",
            "target-arrow-color": "#a855f7",
            "line-color": "#52525b",
          },
        },
        // Mutual Hub Relations
        {
          selector: 'edge[label = "MUTUAL_HUB"]',
          style: {
            "source-arrow-shape": "vee",
            "target-arrow-shape": "vee",
            "source-arrow-color": "#a855f7",
            "target-arrow-color": "#a855f7",
            "line-color": "#a855f7",
          },
        },
        // Spotlight Dimming Rules
        {
          selector: ".dimmed",
          style: {
            opacity: 0.15,
          },
        },
        {
          selector: "node.spotlight",
          style: {
            opacity: 1,
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

  // DYNAMIC DIFF UPDATER & LAYER FILTERING LENS
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const safeNodes = Array.isArray(nodes) ? nodes : [];

    // Filter nodes based on active layer lens
    const lensFilteredNodes = safeNodes.filter((node) => {
      if (activeLens === "DICTIONARY_ONLY") {
        return node.domain_type !== "DOMAIN_HUB";
      }
      if (activeLens === "HUB_MAP_ONLY") {
        return node.domain_type === "DOMAIN_HUB";
      }
      return true; // ALL
    });

    const validNodeIds = new Set(lensFilteredNodes.map((n) => n.id));

    const safeEdges = (Array.isArray(edges) ? edges : []).filter(
      (e) => validNodeIds.has(e.source_node_id) && validNodeIds.has(e.target_node_id)
    );

    cy.batch(() => {
      const currentCyNodes = new Set(cy.nodes().map((n) => n.id()));
      const incomingNodeIds = new Set(lensFilteredNodes.map((n) => n.id));

      // Remove nodes not matching active lens
      cy.nodes().forEach((n) => {
        if (!incomingNodeIds.has(n.id())) {
          cy.remove(n);
        }
      });

      // Add newly matching nodes
      const nodesToAdd = lensFilteredNodes.filter((n) => !currentCyNodes.has(n.id));
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

      // Sync Edges
      const currentCyEdges = new Set(cy.edges().map((e) => e.id()));
      const incomingEdgeIds = new Set(safeEdges.map((e) => e.id));

      cy.edges().forEach((e) => {
        if (!incomingEdgeIds.has(e.id())) {
          cy.remove(e);
        }
      });

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
    });
  }, [nodes, edges, activeLens]);

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
        is_directional: ["TRANSITIVE_PAIR", "USES_GRAMMAR", "BELONGS_TO_HUB"].includes(activeRelation),
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
      {/* Canvas Toolbar with Layer Lens Toggles */}
      <div className="canvas-toolbar">
        <div className="toolbar-row top-row">
          {/* Layer Filtering Lens Controls */}
          <div className="lens-toggle-group">
            <button
              type="button"
              className={`lens-btn ${activeLens === "ALL" ? "active" : ""}`}
              onClick={() => handleLensChange("ALL")}
            >
              Full Web
            </button>
            <button
              type="button"
              className={`lens-btn ${activeLens === "DICTIONARY_ONLY" ? "active" : ""}`}
              onClick={() => handleLensChange("DICTIONARY_ONLY")}
            >
              Dictionary Web
            </button>
            <button
              type="button"
              className={`lens-btn ${activeLens === "HUB_MAP_ONLY" ? "active" : ""}`}
              onClick={() => handleLensChange("HUB_MAP_ONLY")}
            >
              Hub Map
            </button>
          </div>

          <span className="control-label">
            {sourceNodeId ? "Select target node to link..." : "Click to link"}
          </span>

          <div className="select-wrapper">
            <select
              value={relationType}
              onChange={(e) => handleRelationChange(e.target.value)}
            >
              <optgroup label="Lexical Relations">
                <option value="SIMILAR_KANJI" disabled={isOptionDisabled("SIMILAR_KANJI")}>
                  SIMILAR_KANJI (↔)
                </option>
                <option value="TRANSITIVE_PAIR" disabled={isOptionDisabled("TRANSITIVE_PAIR")}>
                  TRANSITIVE_PAIR (→)
                </option>
                <option value="SYNONYM" disabled={isOptionDisabled("SYNONYM")}>
                  SYNONYM (↔)
                </option>
                <option value="OPPOSITE" disabled={isOptionDisabled("OPPOSITE")}>
                  OPPOSITE (↔)
                </option>
              </optgroup>

              <optgroup label="Grammar Relations">
                <option value="USES_GRAMMAR" disabled={isOptionDisabled("USES_GRAMMAR")}>
                  USES_GRAMMAR (→)
                </option>
              </optgroup>

              <optgroup label="Context Hub Anchors">
                <option value="BELONGS_TO_HUB" disabled={isOptionDisabled("BELONGS_TO_HUB")}>
                  BELONGS_TO_HUB (Single →)
                </option>
                <option value="MUTUAL_HUB" disabled={isOptionDisabled("MUTUAL_HUB")}>
                  MUTUAL_HUB (Dual ↔)
                </option>
              </optgroup>
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
            Double-click / Right-click / Shift-click to inspect • Single-click to spotlight connections
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
