import { useState } from "react";
import "./Sidebar.css";

interface SidebarProps {
  activeWorkspace: "GRID" | "GRAPH";
  onSelectWorkspace: (ws: "GRID" | "GRAPH") => void;
  activeTab?: string;
  onSelectLens?: (lens: "LEXICAL" | "GRAMMAR" | "DOMAIN_HUB") => void;
  nodeStats: { lexical: number; grammar: number; hubs: number };
  onOpenAbout: () => void;
  onQuitApp: () => void;
}

export default function Sidebar({
  activeWorkspace,
  onSelectWorkspace,
  activeTab,
  onSelectLens,
  nodeStats,
  onOpenAbout,
  onQuitApp,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`app-sidebar ${isCollapsed ? "collapsed" : ""}`}>
      {/* Header / Brand */}
      <div className="sidebar-brand">
        <img src="././app-icon-light.png" alt="Kotonoha" className="brand-icon" />
        {!isCollapsed && (
          <div className="brand-title">
            {/* <span className="kanji-logo">言の葉</span> */}
            <span className="text-logo">Kotonoha</span>
          </div>
        )}
        <button
          type="button"
          className="btn-collapse"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? "⟫" : "⟪"}
        </button>
      </div>

      {/* Nav List Body */}
      <div className="sidebar-nav-body">
        {/* Section 1: Workspaces */}
        <div className="nav-section">
          {!isCollapsed && <span className="section-label">WORKSPACES</span>}
          <button
            type="button"
            className={`nav-item ${activeWorkspace === "GRID" ? "active" : ""}`}
            onClick={() => onSelectWorkspace("GRID")}
            title="Grid Workbench"
          >
            <span className="nav-icon">▤</span>
            {!isCollapsed && <span className="nav-text">Grid Workbench</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeWorkspace === "GRAPH" ? "active" : ""}`}
            onClick={() => onSelectWorkspace("GRAPH")}
            title="Graph Canvas"
          >
            <span className="nav-icon">☩</span>
            {!isCollapsed && <span className="nav-text">Graph Canvas</span>}
          </button>
        </div>

        {/* Section 2: Knowledge Lenses */}
        <div className="nav-section">
          {!isCollapsed && <span className="section-label">ENTRIES</span>}
          <button
            type="button"
            className={`nav-item ${activeWorkspace === "GRID" && activeTab === "LEXICAL" ? "active" : ""}`}
            onClick={() => {
              onSelectWorkspace("GRID");
              if (onSelectLens) onSelectLens("LEXICAL");
            }}
            title="Lexical Bank"
          >
            <span className="nav-icon">字</span>
            {!isCollapsed && <span className="nav-text">Lexical Bank</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeWorkspace === "GRID" && activeTab === "GRAMMAR" ? "active" : ""}`}
            onClick={() => {
              onSelectWorkspace("GRID");
              if (onSelectLens) onSelectLens("GRAMMAR");
            }}
            title="Grammar Index"
          >
            <span className="nav-icon">文</span>
            {!isCollapsed && <span className="nav-text">Grammar Index</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeWorkspace === "GRID" && activeTab === "DOMAIN_HUB" ? "active" : ""}`}
            onClick={() => {
              onSelectWorkspace("GRID");
              if (onSelectLens) onSelectLens("DOMAIN_HUB");
            }}
            title="Domain Hubs"
          >
            <span className="nav-icon">❖</span>
            {!isCollapsed && <span className="nav-text">Domain Hubs</span>}
          </button>
        </div>

        {/* Section 3: System */}
        <div className="nav-section system-section">
          {!isCollapsed && <span className="section-label">SYSTEM</span>}
          <button
            type="button"
            className="nav-item"
            onClick={onOpenAbout}
            title="About Kotonoha"
          >
            <span className="nav-icon">ⓘ</span>
            {!isCollapsed && <span className="nav-text">About</span>}
          </button>
          <button
            type="button"
            className="nav-item quit-item"
            onClick={onQuitApp}
            title="Quit Application"
          >
            <span className="nav-icon">✕</span>
            {!isCollapsed && <span className="nav-text">Quit</span>}
          </button>
        </div>
      </div>

      {/* Footer Status & Counters */}
      <div className="sidebar-footer">
        <div className="db-status-row" title="Database Connected">
          <span className="pulse-dot" />
          {!isCollapsed && <span className="db-text">DB Ready (Local)</span>}
        </div>
        {!isCollapsed && (
          <div className="stats-summary">
            <span>{nodeStats.lexical} W</span>
            <span>•</span>
            <span>{nodeStats.grammar} G</span>
            <span>•</span>
            <span>{nodeStats.hubs} H</span>
          </div>
        )}
      </div>
    </aside>
  );
}
