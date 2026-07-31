import { useState } from "react";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState<"grid" | "graph">("grid");

  return (
    <div className="app-container">
      {/* Top Header / View Toggle */}
      <header className="app-header">
        <h1 className="app-title">言x葉 Kotonoha</h1>
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

      {/* Main Workspace Layout */}
      <main className="workspace">
        <div className="main-content">
          {activeTab === "grid" ? (
            <div className="placeholder-box">Grid View (Excel Workbench)</div>
          ) : (
            <div className="placeholder-box">Graph Canvas (2D Cytoscape Engine)</div>
          )}
        </div>
      </main>
    </div>
  );
}
