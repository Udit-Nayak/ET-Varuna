# Varuna - Energy Supply Chain Resilience Platform

**Varuna** is an AI-assisted, map-first decision intelligence platform for maritime and energy supply-chain resilience. It was built for **ET AI Hackathon 2.0** to help operators, analysts, and decision-makers move from a geopolitical or maritime risk signal to a practical response plan in real time.

The platform focuses on India-facing crude oil and maritime trade corridors. It combines live vessel movement, geopolitical intelligence, disruption simulation, reserve optimization, procurement alternatives, and national energy-state monitoring into one coordinated dashboard.

> **Core idea:** GRIA detects the risk, DSM simulates the impact, SROA plans reserve usage, APO recommends alternate procurement, and TFM monitors the current energy posture.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Agentic Workflow](#agentic-workflow)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Agents](#agents)
- [Data Sources](#data-sources)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Deployment Notes](#deployment-notes)
- [Demo Flow](#demo-flow)
- [Impact](#impact)
- [Future Scope](#future-scope)

---

## Project Overview

Varuna is designed for scenarios where a maritime corridor or energy trade route becomes unstable because of war, sanctions, piracy, vessel attacks, port congestion, natural disaster, financial instability, or geopolitical escalation.

Instead of only displaying alerts, Varuna answers operational questions such as:

- Which corridor is affected?
- Which vessels and tankers are exposed?
- How much supply is at risk?
- What happens to refinery output, fuel prices, and GDP stress over time?
- How much strategic reserve should be released?
- Which alternate supplier or route should be activated?
- What is India's current energy posture?

The system provides an interactive live map, disruption-zone simulation, agent outputs, reroute visualization, and agent-specific chat interfaces that explain the current results in simple language.

---

## Problem Statement

India is highly dependent on imported crude oil, and much of this supply moves through vulnerable maritime chokepoints such as:

- Strait of Hormuz
- Strait of Malacca
- Suez Canal
- Bab-el-Mandeb
- Red Sea route
- Cape of Good Hope
- South China Sea

A disruption in any of these routes can quickly affect crude availability, tanker movement, refining capacity, domestic fuel prices, reserve policy, and procurement strategy.

Current decision-making is difficult because relevant information is scattered across news sources, AIS vessel feeds, oil-price snapshots, government statistics, internal reserve data, and manual analyst reports. During a crisis, decision-makers need a fast, explainable, and operationally useful system that moves beyond “something happened” to “here is what to do next.”

---

## Solution

Varuna converts live risk signals into actionable energy-supply decisions through a coordinated agentic workflow.

The system:

1. Detects geopolitical and maritime risks.
2. Maps risk to corridors and affected zones.
3. Simulates downstream disruption impact.
4. Optimizes strategic reserve drawdown.
5. Ranks alternate procurement and routing options.
6. Displays live national energy-state indicators.
7. Explains results through agent-specific LLM-assisted chat.

LLMs are used for formatting, summarization, explanation, and question answering. Core calculations such as disruption impact, reserve release planning, and route ranking are handled through deterministic logic and structured models rather than relying on LLM-generated numbers.

---

## Agentic Workflow

```text
Live Data Sources
       |
       v
GRIA - Geopolitical Risk Intelligence Agent
       |
       v
DSM - Disruption Scenario Modeller
       |
       v
SROA - Strategic Reserve Optimization Agent
       |
       v
APO - Adaptive Procurement Orchestrator
       |
       v
TFM - Transaction Flow Monitor
       |
       v
Operator Dashboard + Agent Chat
```

### Workflow Summary

- **GRIA** detects and scores risk from maritime/geopolitical intelligence.
- **DSM** turns the risk into a day-by-day disruption impact simulation.
- **SROA** calculates reserve release schedules and safety-threshold status.
- **APO** ranks alternate suppliers and safer shipping routes.
- **TFM** shows current national energy indicators such as price, imports, reserves, and availability.

---

## Key Features

- Interactive maritime dashboard built on MapLibre.
- Live and simulated vessel/tanker tracking.
- Custom disruption-zone drawing on the map.
- Eraser mode for removing selected disruption zones.
- Top global chokepoint presets.
- Automatic rerun of agentic flow when severity or duration changes.
- Vessel and tanker exposure detection inside disruption zones.
- GRIA live news feed with rolling updates.
- DSM day-by-day impact timeline.
- SROA reserve drawdown planning.
- APO alternate procurement and reroute visualization.
- TFM live dashboard for India’s energy posture.
- Agent-specific detailed views.
- Agent-specific chat using the latest output as context.
- CSV-based email campaign backend with HTML template and image attachment support.
- Firebase authentication and protected dashboard flow.

---

## System Architecture

```text
Frontend (React + Vite + MapLibre)
  |
  | REST + Socket.io
  v
Backend (Express + TypeScript)
  |
  |-- GRIA intelligence pipeline
  |-- DSM simulation engine
  |-- SROA reserve optimizer
  |-- APO procurement/routing engine
  |-- TFM national-state monitor
  |-- Email campaign service
  |
  v
MongoDB Atlas / Local MongoDB
  |
  |-- griaIntelligence
  |-- griaVectorDocuments
  |-- nationalStateHistory
  |-- livePriceSnapshot
  |-- users
```

The frontend renders the live operating environment and agent outputs. The backend coordinates data ingestion, modeling, agent logic, LLM-assisted formatting, and real-time vessel updates.

---

## Agents

### 1. GRIA - Geopolitical Risk Intelligence Agent

GRIA is the sensing layer of the system. It monitors maritime, geopolitical, oil-market, sanctions, and supply-chain intelligence. It stores relevant events and converts them into structured risk signals.

GRIA output includes:

- Risk score
- Severity
- Event type
- Corridor relevance
- Matched news/intelligence records
- Confidence indicators
- Plain-language explanation

### 2. DSM - Disruption Scenario Modeller

DSM converts a disruption into a measurable impact timeline. It accepts structured scenario inputs from GRIA, the map, or user-provided text and simulates the effect across the disruption period.

DSM output includes:

- Capacity loss percentage
- Duration days
- Refinery output percentage
- Fuel price change percentage
- GDP impact estimate
- Supply gap and peak stress indicators
- Day-by-day impact timeline

### 3. SROA - Strategic Reserve Optimization Agent

SROA decides how strategic petroleum reserves should be used during the disruption. It consumes DSM’s projected supply gap and combines it with national reserve/consumption data.

SROA output includes:

- Daily reserve release schedule
- Total released barrels
- Remaining reserve days
- Safety floor status
- Uncovered supply gap
- Recommended reserve policy

### 4. APO - Adaptive Procurement Orchestrator

APO ranks alternate crude suppliers and shipping routes after DSM and SROA identify remaining supply requirements. It evaluates practical procurement alternatives and avoids disrupted corridors where possible.

APO output includes:

- Ranked supplier options
- Landed cost per barrel
- Transit days
- Route risk score
- Volume coverage
- Backup routes
- Map-based route visualization

### 5. TFM - Transaction Flow Monitor

TFM provides the live national energy-state view. It displays current price, import, consumption, reserve, and availability indicators.

TFM output includes:

- Current crude price
- Total consumption
- Import volume
- Reserve days
- Commercial stock days
- Basket composition
- Availability indicators

### 6. Agent Chat Layer

Each major agent has a dedicated chat interface. The user can ask questions about the current output, and the system passes the agent result as context to the LLM.

Examples:

- “What happens on day 12?”
- “Why is the safety threshold breached?”
- “Why did APO choose this supplier?”
- “What is the current reserve position?”

---

## Data Sources

Varuna uses a combination of live, structured, and mockable data sources depending on deployment configuration.

| Source | Purpose |
| --- | --- |
| AISStream | Live AIS vessel movement and tanker position data |
| NewsAPI | Global geopolitical and energy news ingestion |
| MarineLink | Maritime news and industry intelligence |
| PPAC India | Petroleum price, crude basket, consumption and energy-market references |
| MongoDB Atlas | Persistent storage for intelligence, vectors, national state and price snapshots |
| OpenStreetMap | Base map geography and location context |
| OpenMapTiles | Map tile rendering layer |
| Gemini API | LLM-assisted formatting, summaries and agent chat |
| Groq / Hugging Face | Optional LLM or embedding/rerank providers depending on configuration |

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- MapLibre GL
- Socket.io Client
- Firebase Auth

### Backend

- Node.js
- Express.js
- TypeScript
- MongoDB
- Mongoose
- Socket.io
- Node Cron
- WebSocket clients
- Firebase Admin

### AI / Intelligence

- Gemini API
- Groq API
- Hugging Face API / local embedding options
- MongoDB-based intelligence and vector-style search
- Deterministic modeling for DSM, SROA and APO logic

---

## Repository Structure

```text
ET-Sentrix/
├── backend/
│   ├── src/
│   │   ├── agents/
│   │   │   ├── gria/
│   │   │   ├── dsm/
│   │   │   ├── sroa/
│   │   │   ├── apo/
│   │   │   ├── tfm/
│   │   │   ├── chat/
│   │   │   ├── map/
│   │   │   ├── shared/
│   │   │   └── emailCampaign/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   └── server.ts
│   ├── data/
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── styles/
│   │   └── main.tsx
│   └── package.json
│
└── README.md
```

---

## Environment Variables

Create `.env` files in both `backend/` and `frontend/`.

### Backend `.env`

```env
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=your_mongodb_uri

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant

HF_TOKEN=your_huggingface_token
NEWSAPI_KEY=your_newsapi_key
AISSTREAM_API_KEY=your_aisstream_api_key
AISSTREAM_ENABLED=true

# Firebase Admin values are required for token verification routes.
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY=your_private_key
```

### Frontend `.env`

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```

### 2. Backend setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs on:

```text
http://localhost:5000
```

### 3. Frontend setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

---

## Deployment Notes

Recommended deployment approach:

- Deploy the frontend as a static site on Vercel or Render.
- Deploy the backend as a Node web service on Render or Railway.
- Set `VITE_API_BASE_URL` in the frontend to the deployed backend URL.
- Set `CLIENT_ORIGIN` in the backend to the deployed frontend URL.

For Render backend:

```text
Root Directory: backend
Build Command: npm install && npm run build
Start Command: npm start
```

For frontend static deployment:

```text
Root Directory: frontend
Build Command: npm install && npm run build
Publish Directory: dist
```

---

## Demo Flow

A recommended demo sequence:

1. Open the Varuna dashboard.
2. Show the GRIA live feed.
3. Click **Open Workspace**.
4. Select a chokepoint preset such as Strait of Hormuz.
5. Show the disruption zone and affected vessels.
6. Open the DSM tab and explain the impact timeline.
7. Ask the DSM chat: “What happens on day 12?”
8. Open the SROA tab and explain reserve release planning.
9. Open the APO tab and explain procurement alternatives and reroutes.
10. Open the TFM tab and show live India energy indicators.
11. Adjust disruption severity and rerun the workflow.
12. Use eraser mode to remove a disruption zone.
13. Scroll to the final ET AI Hackathon section and show data sources.

---

## Impact

Varuna helps reduce the time from risk detection to response planning. In a real energy-supply crisis, faster coordination between intelligence, reserves, procurement, and route planning can materially improve resilience.

Key benefits:

- Faster maritime disruption analysis
- Better visibility into exposed vessels and corridors
- Explainable downstream impact simulation
- Data-backed reserve drawdown planning
- Smarter alternate procurement decisions
- Clear national energy-state monitoring
- Reduced manual analysis burden
- Better crisis response readiness

---

## Future Scope

Potential improvements include:

- More advanced vessel classification and cargo inference
- Direct integration with commercial maritime intelligence APIs
- Advanced optimization solvers for reserve/procurement decisions
- More granular refinery and port-level modeling
- Scenario comparison mode
- Multi-country energy supply-chain modeling
- Real-time alerting and automated reporting
- Role-based dashboards for government, refinery, port and procurement teams

---

## Acknowledgement

This project was developed for **ET AI Hackathon 2.0** with the goal of improving real-time energy supply-chain resilience through agentic AI, geospatial intelligence, and explainable decision support.

---

## License

This repository is intended for hackathon and academic demonstration purposes. Add a project license before production or public commercial use.
