import { useState, useEffect } from "react";
import "./App.css";
import { getDb, getAllNodes, getAllEdges } from "./core/db";
import { NodeEntity, EdgeEntity } from "./types/database";
import GridView from "./components/GridView";
import GraphCanvas from "./components/GraphCanvas";

export default function App() {
  const [activeTab, setActiveTab] = useState<"grid" | "graph">("grid");
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [nodes, setNodes] = useState<NodeEntity[]>([]);
  const [edges, setEdges] = useState<EdgeEntity[]>([]);

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

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">言x葉 Kotonoha</h1>
          <span className={`db-badge ${dbReady ? "online" : ""}`}>
            {dbReady ? "DB Ready" : "Connecting DB..."}
          </span>
        </div>
        <div className="view-toggle">
          <button
            className={activeTab === "grid" ? "active" : ""}
            onClick={() => setActiveTab("grid")}
          >
            Grid View
          </button>
          <button
            className={activeTab === "graph" ? "active" : ""}
            onClick={() => setActiveTab("graph")}
          >
            Graph Canvas
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="workspace">
        <div className="main-content">
          {activeTab === "grid" ? (
            <GridView nodes={nodes} onNodesChange={setNodes} />
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
    </div>
  );
}
