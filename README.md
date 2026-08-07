# Kotonoha (言ｘ葉) — Personal Knowledge Graph Workbench

> An offline, graph-based desktop application designed to map vocabulary, grammar patterns, and interconnected concepts through active personal synthesis.

---

## Overview

**Kotonoha (言x葉)** is a lightweight desktop workbench built to transform study habits from passive flashcard drilling into an active **Knowledge Web**.

Instead of relying solely on fully automated flashcard decks or static word lists, Kotonoha enforces active synthesis. You type in words, readings, definitions, real-world example sentences, and personal memory anchors yourself. The act of manually inputting and wiring connections between nodes forms the core memory-building mechanism.

By pairing an Excel-style **Grid View** for rapid data entry with an interactive 2D **Graph Canvas** backed by a local auto-enrichment engine, Kotonoha serves as a personal, domain-agnostic knowledge workbench designed to match how native human pattern recognition naturally operates.

---

## Background & Philosophy

### The Spreadsheet Origin
The foundation of this system stems from a long-standing habit of reading English-Indonesian translation dictionaries word-by-word and maintaining structured spreadsheets to track vocabulary encounters. Excel was ideal for rapid input—logging original words, Indonesian meanings, example sentences, and priority flags in a clean, tabular format.

### The Linear Deck Conflict
When stepping into systematic Japanese study (drilling Anki decks like Kaishi 1.5k, Core 2000, and working through Minna no Nihongo), a major friction point emerged:
1. **Linear Decks vs. Native Media:** Standard decks present words in strict sequential frequency ($A \rightarrow B \rightarrow C$). However, real-world native media (VTuber stream clips, music lyrics, game UIs) hits you with casual expressions, complex Kanji, and varied grammar all at once.
2. **Structural Clustered Kanji:** Japanese vocabulary relies heavily on structural symmetry (e.g., transitive/intransitive pairs like `開ける` / `開く`, or counter patterns like `一つ` / `一日`). Flat 2D rows scatter these related words across days of isolated studying.
3. **The Automation Trap:** Most modern study apps auto-fetch everything blindly. While convenient, removing the friction of manual input removes the exact cognitive effort required to form long-term memory. Kotonoha solves this by blending manual node creation with non-intrusive background linguistic enrichment.

### Active Synthesis & Bloom's Taxonomy
Inspired by study frameworks like *Bloom's Taxonomy*, real mastery comes from **Creating & Analyzing** rather than passive repetition. Kotonoha acts as a personal workbench where you build your own neural web from scratch. If a new word reminds you of a similar concept or Kanji, you draw the edge manually.

By treating the act of building and linking the database as the primary study mechanism, every word encountered in drills or media is manually deconstructed, related to known nodes, and anchored to personal memory context.

### Why a Native Desktop App?
Kotonoha is built as a standalone, offline desktop app rather than a web service to provide a calm, dedicated workspace for better focus. While optimized for CJK and Japanese linguistics out of the box, its underlying schema is completely domain-agnostic—ready to be used for Physics, Systems Engineering, or general concept mapping.

---
## readn'tme

this a section for my own writings about this app. im including this cuz i feel like i do want to explain or describe things regarding this app with my own way of putting. cuz imma be real that all the contents in this readme as well as these codes are written by AI. but ofc im the one that lead the building of this app, vibe-codedly in many aspects. but the fact that i build this app for the reason of my need based on my purpose to learn japanese is actually there. all the technicalities to make this app real are helped by AI for sure knowing i am no expert in these tech stacks that are used here, altho i definitely understand most of the codes, files, and the reason of why theyre there. i hope so. what i meant is that im not sure if u want to ask me in technical aspects but im so down to discuss if this app intrigued anyone to use/develop.
plus, the writings might glaze this app or maybe put other app/reference down to a degree. or it might not. but i definitely not inted to devaluate other tool to learn like anki. cuz for sure that app is goated as ev1 knows. its js i need more than js anki (and other source(s) like MNN etc) to learn this beautiful language. i need those vocabulary, ーwhich anki engraved them upon us flawlessly, i thinkー to be connected/related to many other words/context that i want to arrange them myself. not based on external explanation, definition, or context. but from my own self, from my own memory, to build that connection myself. thats why i put bloom taxonomy thingy that i learnt, shallowly, in writing this readme above, by the help of AI. but that idea surely comes from my will to create my own memory system where those vocabs and other aspects in learning this language lies in a single personally organized app.
and as i always be having rly hard time summarizing evth on my mind to be packed into a decent and solid description of a thing. thus, i hope these paragraphs explain what this app is clearly.

---
## Core Features

### Dual-View Architecture
* **Excel-Style Grid View:** High-speed tabular interface optimized for rapid data entry, filtering by priority status (`HARD`, `REVIEW`, `SETTLED`), and sequential order tracking.
* **Layered 2D Graph Canvas:** Interactive visualization engine powered by Cytoscape.js. Renders nodes, domain types, and structural relationships without messy 3D spatial rotation. Includes lens toggles (`Full Web`, `Dictionary Web`, `Hub Map`) to filter workspace views.

### Hybrid Linguistic Auto-Enrichment Engine
* **Native Rust CORS Bypass:** Executes background API & web queries directly from the Rust backend, removing CORS limitations entirely.
* **Deep Kanji Breakdown:** Scrapes and parses rich kanji metadata directly from Jisho—extracting stroke counts, JLPT levels, School Grades, Kun/On readings, Radical Symbols, Forms `(e.g., ⺮)`, Radical Parts, and Variants.
* **Persistent SQLite Caching:** Enriched data is cached locally in JSON attribute payloads. Once a word/kanji is enriched, it loads instantly (< 5ms) without needing repeated network calls.

### Dynamic Priority Heatmap
* Nodes scale and render dynamically based on mastery friction (`HARD` nodes render larger with higher contrast, while `SETTLED` nodes scale down to minimize visual noise).

### Right-Docked Inspector Sidebar
* Clean side panel that isolates non-structural content (dictionary definitions, kanji breakdowns, audio pronunciation TTS, and multi-note memory logs) away from the main canvas to prevent node clutter.

### Local Subgraph Focus Mode
* Clicking any node automatically spotlights its immediate neighborhood, dimming distant nodes to maintain total legibility during complex graph sessions.

### Domain-Agnostic Core Engine
* Built on a generic Node-Edge schema with flexible JSON payload attributes. While optimized for CJK and Japanese linguistics, the engine can be reused for Physics, Computer Science, or general concept mapping.

**100% Offline & Private:** Powered by a local SQLite database file on your machine.

---

### Active Development Roadmap

**In Progress / Under Investigation**
* **Organic Network Layout Engine:** Shifting node placement algorithms from rigid top-to-bottom matrix distribution to an organic, force-directed graph physics with persistence and spatial anchor points.

**Future Development**
* **Priority-Driven SRS Review Engine:** Smart flashcard/drill mode utilizing Spaced Repetition Algorithms based on node priority levels (`HARD`, `REVIEW`, `SETTLED`).
* **Database Backup & Migration Tools:** Seamless import/export routines for SQLite snapshot backups and JSON payload extractions.
* **Graph Canvas Analytics:** Visual statistics showing domain coverage, mastery ratios, and orphan node detectors.

---

## System Architecture & Tech Stack

* **Desktop Runtime:** [Tauri v2](https://tauri.app/) (Rust-backed runtime, ultra-lightweight ~30-50MB RAM footprint).
* **Backend Layer (Rust):** Custom Rust commands using `reqwest` and `scraper` for native HTTP fetch operations, HTML parsing, and CORS-free background data processing.
* **Frontend:** React + TypeScript + Vite.
* **Graph Engine:** [Cytoscape.js](https://js.cytoscape.org/) (High-performance 2D graph layout and interaction library).
* **Database:** Local SQLite database (`.db`) embedded directly within the application directory via Tauri SQL plugin for 100% offline access and easy cloud backup.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Rust](https://www.rust-lang.org/) toolchain installed

### Installation & Run
1. Clone the repository:
```bash
git clone [https://github.com/Nadif243/kotonoha.git](https://github.com/Nadif243/kotonoha.git)
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
