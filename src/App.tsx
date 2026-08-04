import { useState, useEffect } from "react";
import { NodeEntity, EdgeEntity } from "./types/database";
import { getAllNodes, getAllEdges } from "./core/db";
import Sidebar from "./components/Sidebar";
import GridView from "./components/GridView";
import GraphCanvas from "./components/GraphCanvas";
import InspectorDrawer from "./components/InspectorDrawer";
import "./App.css";

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<"GRID" | "GRAPH">("GRID");
  const [nodes, setNodes] = useState<NodeEntity[]>([]);
  const [edges, setEdges] = useState<EdgeEntity[]>([]);

  // Global Inspector Drawer State (Only for Grid View)
  const [inspectedNode, setInspectedNode] = useState<NodeEntity | null>(null);

  // About Modal State
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Load Initial Database Entries
  useEffect(() => {
    const loadDatabase = async () => {
      try {
        const fetchedNodes = await getAllNodes();
        const fetchedEdges = await getAllEdges();
        setNodes(fetchedNodes || []);
        setEdges(fetchedEdges || []);
      } catch (err) {
        console.error("Failed to load DB initial state:", err);
      }
    };
    loadDatabase();
  }, []);

  // Calculate Node Stats for Sidebar Footer
  const nodeStats = {
    lexical: nodes.filter((n) => n.domain_type === "LEXICAL").length,
    grammar: nodes.filter((n) => n.domain_type === "GRAMMAR").length,
    hubs: nodes.filter((n) => n.domain_type === "DOMAIN_HUB").length,
  };

  // Quit Application Handler (Tauri / Electron / Browser Fallback)
  const handleQuitApp = () => {
    if (window.confirm("Quit Kotonoha application?")) {
      // @ts-ignore
      if (window.__TAURI__) {
        // @ts-ignore
        window.__TAURI__.process.exit(0);
      } else {
        window.close();
      }
    }
  };

  return (
    <div className="app-layout">
      {/* 1. Left Navigation Sidebar */}
      <Sidebar
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={(ws) => setActiveWorkspace(ws)}
        nodeStats={nodeStats}
        onOpenAbout={() => setIsAboutOpen(true)}
        onQuitApp={handleQuitApp}
      />

      {/* 2. Main Content Workspace */}
      <main className="main-content">
        {activeWorkspace === "GRID" ? (
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
      </main>

      {/* 3. Global Inspector Drawer (Grid View Preview) */}
      <InspectorDrawer
        node={inspectedNode}
        onClose={() => setInspectedNode(null)}
        onFocusInGraph={() => {
          setActiveWorkspace("GRAPH");
          setInspectedNode(null);
        }}
      />

      {/* 4. Minimalist About Modal */}
      {isAboutOpen && (
        <div className="modal-overlay" onClick={() => setIsAboutOpen(false)}>
          <div className="about-modal" onClick={(e) => e.stopPropagation()}>
            <div className="about-header">
              <img src="././app-icon-light.png" alt="Kotonoha" className="about-logo" />
              <div>
                <h2>言の葉 Kotonoha</h2>
                <span className="about-version">v1.0.0-beta</span>
              </div>
            </div>
            <p className="about-desc">
              A personal Japanese language learning knowledge graph workbench.
              Designed for non-perturbative memory mapping, context hubs, and linguistic analysis.
            </p>
            <div className="about-footer">
              <button
                type="button"
                className="btn-close-about"
                onClick={() => setIsAboutOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
