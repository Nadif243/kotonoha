# Kotonoha (言ｘ葉) — Personal Knowledge Graph Workbench

> An offline, graph-based desktop application designed to map vocabulary, grammar patterns, and interconnected concepts through active personal synthesis.
---
## Overview

**Kotonoha (言x葉)** is a lightweight desktop workbench built to transform study habits from passive flashcard drilling into an active **Knowledge Web**.

Instead of relying on automated dictionary fetching or static word lists, Kotonoha enforces manual entry. You type in words, definitions, real-world example sentences, and personal memory anchors yourself. The act of manually inputting and wiring connections between nodes forms the core memory-building mechanism.

By pairing an Excel-style **Grid View** for rapid data entry with an interactive 2D **Graph Canvas**, Kotonoha serves as a personal, domain-agnostic knowledge workbench designed to match how native human pattern recognition naturally operates.

---
## Background & Philosophy

### The Spreadsheet Origin
The foundation of this system stems from a long-standing habit of reading English-Indonesian translation dictionaries word-by-word and maintaining structured spreadsheets to track vocabulary encounters. Excel was ideal for rapid input—logging original words, Indonesian meanings, example sentences, and priority flags in a clean, tabular format.

### The Linear Deck Conflict
When stepping into systematic Japanese study (drilling Anki decks like Kaishi 1.5k, Core 2000, and working through Minna no Nihongo), a major friction point emerged:
1. **Linear Decks vs. Native Media:** Standard decks present words in strict sequential frequency ($A \rightarrow B \rightarrow C$). However, real-world native media (VTuber stream clips, music lyrics, game UIs) hits you with casual expressions, complex Kanji, and varied grammar all at once.
2. **Structural Clustered Kanji:** Japanese vocabulary relies heavily on structural symmetry (e.g., transitive/intransitive pairs like `開ける` / `開く`, or counter patterns like `一つ` / `一日`). Flat 2D rows scatter these related words across days of isolated studying.
3. **The Automation Trap:** Most modern study apps auto-fetch definitions, audio, and example sentences. While convenient, removing the friction of manual input removes the exact cognitive effort required to form long-term memory.

### Active Synthesis & Bloom's Taxonomy
Inspired by study frameworks like *Bloom's Taxonomy*, real mastery comes from **Creating & Analyzing** rather than passive repetition. Kotonoha acts as a personal workbench where you build your own neural web from scratch. If a new word reminds you of a similar concept or Kanji, you draw the edge manually.

By treating the act of building and linking the database as the primary study mechanism, every word encountered in drills or media is manually deconstructed, related to known nodes, and anchored to personal memory context.

### Why a Native Desktop App?
Kotonoha is built as a standalone, offline desktop app rather than a web service to provide a calm, dedicated workspace for better focus. While optimized for CJK and Japanese linguistics out of the box, its underlying schema is completely domain-agnostic—ready to be used for Physics, Systems Engineering, or general concept mapping.

---
## ~~Key~~ Planned Features

**Dual-View Architecture**
* **Excel-Style Grid View:** High-speed tabular interface optimized for rapid data entry, filtering by priority status, and sequential order tracking.
* **Layered 2D Graph Canvas:** Interactive visualization engine powered by Cytoscape.js. Renders nodes and structural relationships without messy 3D spatial rotation.

**Dynamic Priority Heatmap**
* Nodes scale dynamically based on mastery friction (`HARD` nodes render larger with higher contrast, while `SETTLED` nodes scale down to minimize visual noise).

**Inspector Panel (Leaf Data Isolation)**
* Clean right-side panel that isolates non-structural content (additional details and such) away from the main canvas to prevent node clutter.

**Local Subgraph Focus Mode**
* Clicking any node automatically focuses the view on its immediate 1-hop or 2-hop neighborhood, hiding distant nodes to maintain total legibility.

**Domain-Agnostic Core Engine**
* Built on a generic Node-Edge schema with flexible JSON payload attributes. While optimized for CJK and Japanese linguistics, the engine can be reused for Physics, Computer Science, or general concept mapping.

**100% Offline & Private:** Powered by a local SQLite database file on your machine.

---
## System Architecture & Tech Stack

* **Desktop Runtime:** [Tauri v2](https://tauri.app/) (Rust-backed runtime, ultra-lightweight ~30-50MB RAM footprint).
* **Frontend:** React + TypeScript + Vite.
* **Graph Engine:** [Cytoscape.js](https://js.cytoscape.org/) (High-performance 2D graph layout and interaction library).
* **Database:** Local SQLite file (`.db`) embedded directly within the application directory for 100% offline access and easy cloud backup.

---
## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Rust](https://www.rust-lang.org/) toolchain installed

### Installation & Run
1. Clone the repository:
```bash
git clone [https://github.com/your-username/kotonoha.git](https://github.com/your-username/kotonoha.git)
cd kotonoha
```

2. Install frontend dependencies:
```bash
npm install
```

3. Run the application in Tauri development mode:
```bash
npm run tauri dev
```

## License

Personal project released under the [MIT License](https://www.google.com/search?q=LICENSE).
