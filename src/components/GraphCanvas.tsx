import { useEffect, useRef, useState } from "react";
import cytoscape, { Core } from "cytoscape";
import { NodeEntity, EdgeEntity } from "../types/database";
import { insertEdge, deleteEdge, checkEdgeConflict, getAllEdges } from "../core/db";
import "./GraphCanvas.css";

interface GraphCanvasProps {
  nodes: NodeEntity[];
  edges: EdgeEntity[];
  onEdgesChange: (edges: EdgeEntity[]) => void;
}

export default function GraphCanvas({
  nodes = [],
  edges = [],
  onEdgesChange,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // State & Ref tracking for Node selection
  const [sourceNodeId, setSourceNodeIdState] = useState<string | null>(null);
  const sourceNodeIdRef = useRef<string | null>(null);

  // State & Ref tracking for Dropdown Relation Type
  const [relationType, setRelationTypeState] = useState<string>("SIMILAR_KANJI");
  const relationTypeRef = useRef<string>("SIMILAR_KANJI");

  const [isCanvasReady, setIsCanvasReady] = useState<boolean>(false);

  // Synchronizes React state, Ref, and Cytoscape node highlights
  const setSourceNode = (id: string | null) => {
    sourceNodeIdRef.current = id;
    setSourceNodeIdState(id);

    if (cyRef.current) {
      if (!id) {
        cyRef.current.nodes().unselect();
      }
    }
  };

  const handleRelationChange = (newType: string) => {
    relationTypeRef.current = newType;
    setRelationTypeState(newType);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const validNodeIds = new Set(safeNodes.map((n) => n.id));

    // CRITICAL: Filter out orphan edges whose target/source nodes no longer exist
    const safeEdges = (Array.isArray(edges) ? edges : []).filter(
      (e) => validNodeIds.has(e.source_node_id) && validNodeIds.has(e.target_node_id)
    );

    if (safeNodes.length === 0) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      setIsCanvasReady(true);
      return;
    }

    const nodeElements = safeNodes.map((node) => ({
      data: {
        id: node.id,
        label: `${node.label}\n${node.reading || ""}`,
        priority: node.priority_status || "REVIEW",
        domain: node.domain_type || "LEXICAL",
      },
    }));

    const edgeElements = safeEdges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source_node_id,
        target: edge.target_node_id,
        label: edge.relation_type || "",
      },
    }));

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...nodeElements, ...edgeElements],
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
          selector: "node:selected",
          style: {
            "border-width": 3,
            "border-color": "#ffffff",
            "background-color": "#27272a",
          },
        },
        // Base Edge Style
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
        // Symmetric Relations (Double Arrow)
        {
          selector: 'edge[label = "SYNONYM"], edge[label = "OPPOSITE"], edge[label = "SIMILAR_KANJI"]',
          style: {
            "source-arrow-shape": "vee",
            "target-arrow-shape": "vee",
            "source-arrow-color": "#52525b",
            "target-arrow-color": "#52525b",
          },
        },
        // Directional Relations (Single Arrow)
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
      ],
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: () => 14000,
        idealEdgeLength: () => 130,
        gravity: 0.25,
        numIter: 1000,
      },
    });

    cy.ready(() => {
      cy.fit(undefined, 40);
      setIsCanvasReady(true);
    });

    const timer = setTimeout(() => {
      setIsCanvasReady(true);
    }, 50);

    // Tap Node: Link creation reading from Refs
    cy.on("tap", "node", (evt) => {
      const clickedNodeId = evt.target.id();
      const currentSource = sourceNodeIdRef.current;

      if (!currentSource) {
        setSourceNode(clickedNodeId);
      } else if (currentSource !== clickedNodeId) {
        handleCreateEdge(currentSource, clickedNodeId);
      } else {
        setSourceNode(null);
      }
    });

    // Tap Edge: Confirmation modal to delete
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

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        setSourceNode(null);
      }
    });

    cyRef.current = cy;

    return () => {
      clearTimeout(timer);
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [nodes, edges]);

  const handleCreateEdge = async (sourceId: string, targetId: string) => {
    const activeRelation = relationTypeRef.current;

    try {
      // Prevent identical duplicate edge creation
      const conflictCheck = await checkEdgeConflict(sourceId, targetId, activeRelation);

      if (conflictCheck.hasError) {
        alert(conflictCheck.message);
        setSourceNode(null); // Instantly clears white highlight on error
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
      setSourceNode(null); // Always reset selection state
    }
  };

  return (
    <div className="graph-container">
      {/* Canvas Toolbar */}
      <div className="canvas-toolbar">
        <div className="connection-controls">
          <span className="control-label">
            {sourceNodeId
              ? "Select target node to link..."
              : "Click node to link • Click edge line to delete:"}
          </span>
          <select
            value={relationType}
            onChange={(e) => handleRelationChange(e.target.value)}
          >
            <option value="SIMILAR_KANJI">SIMILAR_KANJI</option>
            <option value="TRANSITIVE_PAIR">TRANSITIVE_PAIR</option>
            <option value="SYNONYM">SYNONYM</option>
            <option value="OPPOSITE">OPPOSITE</option>
            <option value="USES_GRAMMAR">USES_GRAMMAR</option>
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

      {nodes.length === 0 && (
        <div className="empty-canvas-msg">
          No nodes in database. Add entries in the Grid View first!
        </div>
      )}

      <div
        ref={containerRef}
        className={`cytoscape-canvas ${isCanvasReady ? "ready" : ""}`}
      />
    </div>
  );
}
