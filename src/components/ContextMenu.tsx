import { useEffect, useRef } from "react";
import { NodeEntity } from "../types/database";
import "./ContextMenu.css";

export interface ContextMenuTarget {
  x: number;
  y: number;
  node: NodeEntity;
}

interface ContextMenuProps {
  target: ContextMenuTarget;
  onClose: () => void;
  onInspect: (node: NodeEntity) => void;
  onQuickEdit: (node: NodeEntity) => void;
  onCyclePriority: (node: NodeEntity) => void;
  onDelete: (node: NodeEntity) => void;
}

export default function ContextMenu({
  target,
  onClose,
  onInspect,
  onQuickEdit,
  onCyclePriority,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-close when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Audio Pronunciation TTS
  const handleListenPronunciation = () => {
    const textToSpeak = target.node.reading || target.node.label;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = "ja-JP";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="custom-context-menu"
      style={{ top: `${target.y}px`, left: `${target.x}px` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="menu-header">
        <span className="menu-title">{target.node.label}</span>
        {target.node.reading && (
          <span className="menu-subtitle">({target.node.reading})</span>
        )}
      </div>

      <div className="menu-divider" />

      <button
        type="button"
        className="menu-item"
        onClick={() => {
          onInspect(target.node);
          onClose();
        }}
      >
        <span className="menu-icon">📖</span> Inspect Entry Details
      </button>

      <button
        type="button"
        className="menu-item"
        onClick={handleListenPronunciation}
      >
        <span className="menu-icon">🔊</span> Listen Pronunciation (TTS)
      </button>

      <div className="menu-divider" />

      <button
        type="button"
        className="menu-item"
        onClick={() => {
          onQuickEdit(target.node);
          onClose();
        }}
      >
        <span className="menu-icon">⚡</span> Quick Edit Properties
      </button>

      <button
        type="button"
        className="menu-item"
        onClick={() => {
          onCyclePriority(target.node);
          onClose();
        }}
      >
        <span className="menu-icon">🏷️</span> Toggle Priority (
        {target.node.priority_status})
      </button>

      <div className="menu-divider" />

      <button
        type="button"
        className="menu-item danger"
        onClick={() => {
          onDelete(target.node);
          onClose();
        }}
      >
        <span className="menu-icon">🗑️</span> Delete Entry
      </button>
    </div>
  );
}
