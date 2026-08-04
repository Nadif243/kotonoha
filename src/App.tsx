import { useState, useEffect } from "react";
import { NodeEntity, EdgeEntity } from "./types/database";
import { getDb, getAllNodes, getAllEdges } from "./core/db";
import GridView from "./components/GridView";
import GraphCanvas from "./components/GraphCanvas";
import InspectorDrawer from "./components/InspectorDrawer";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState<"grid" | "graph">("grid");
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [nodes, setNodes] = useState<NodeEntity[]>([]);
  const [edges, setEdges] = useState<EdgeEntity[]>([]);

  // Shared Inspector Drawer State
  const [inspectedNode, setInspectedNode] = useState<NodeEntity | null>(null);

  // Database Initialization Effect
  useEffect(() => {
    async function init() {
      try {
        await getDb();
        setDbReady(true);
        const initialNodes = await getAllNodes();
        const initialEdges = await getAllEdges();
        setNodes(initialNodes || []);
        setEdges(initialEdges || []);
      } catch (err) {
        console.error("Failed to initialize database:", err);
      }
    }
    init();
  }, []);

  // Global Context Menu Guardrail Effect
  useEffect(() => {
    const disableNativeContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener("contextmenu", disableNativeContextMenu);

    return () => {
      window.removeEventListener("contextmenu", disableNativeContextMenu);
    };
  }, []);

  // Handler switch to graph & focus specific node
  const handleSwitchToGraphAndFocus = (nodeId: string) => {
    setActiveTab("graph");
    setInspectedNode(null); // Optional: close drawer or keep focused node
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          {/* App Icon Image */}
          <img
            src="././app-icon-light.png"
            alt="Kotonoha Logo"
            className="app-header-logo"
          />
          <h1 className="app-title">言x葉</h1>
          <span className={`db-badge ${dbReady ? "online" : ""}`}>
            {dbReady ? "DB Ready" : "Connecting DB..."}
          </span>
        </div>
        <div className="view-toggle">
          <button
            className={`switch-btn ${activeTab === "grid" ? "active" : ""}`}
            onClick={() => setActiveTab("grid")}
          >
            Grid Workbench
          </button>
          <button
            className={`switch-btn ${activeTab === "graph" ? "active" : ""}`}
            onClick={() => setActiveTab("graph")}
          >
            Canvas Graph
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="workspace">
        <div className="main-content">
          {activeTab === "grid" ? (
          <GridView
            nodes={nodes}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onInspectNode={(node) => setInspectedNode(node)}
                />
          ) : (
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={setNodes}
              onEdgesChange={setEdges}
            />
          )}
        </div>
      </main>

      {/* Global Inspector Drawer Slide-over */}
      {inspectedNode && (
        <InspectorDrawer
          node={inspectedNode}
          allNodes={nodes}
          allEdges={edges}
          onClose={() => setInspectedNode(null)}
          onNodesChange={setNodes}
          onSwitchToGraphAndFocus={handleSwitchToGraphAndFocus}
        />
      )}
    </div>
  );
}
