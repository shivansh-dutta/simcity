# Sim City — Real-Time Multiplayer City Simulator

A collaborative 3D city simulation built on Lower Manhattan's real voxel geometry. Multiple players edit the city simultaneously, trigger disasters, and watch AI-powered consequences ripple through live economic, population, and infrastructure metrics — all synchronized in real time via SpacetimeDB.

**Live demo:** https://simcity-five.vercel.app

---

## What It Does

Sim City lets you and your collaborators reshape a real city and immediately see what happens. Place skyscrapers, rezone neighborhoods, detonate hurricanes, or crash the economy — every change propagates to everyone connected within milliseconds. An AI advisor analyzes your city's metrics and suggests improvements, while an AI-generated news ticker broadcasts disaster headlines as events unfold.

**Target users:** urban planners, educators, architects, industrial designers, and anyone curious about "what if we built that here?"

---

## Features

### City Editing
- **Place buildings** — click to add structures with custom width, depth, and floor count
- **Remove buildings** — single click removes the entire multi-cell footprint at once
- **Move buildings** — drag any structure to a new location
- **Add parks** — rezone cells as green space to boost health and happiness scores
- **Undo** — revert your last edit instantly
- **Full reset** — wipe all edits and start fresh

### Multiplayer
- All edits sync to every connected browser in real time via SpacetimeDB
- See other players' cursors live on the 3D grid
- Activity feed shows recent actions from all players (last 30 seconds)
- **Host election** — the player with the lowest identity string drives simulation ticks, preventing race conditions in multi-client environments

### Disaster System
- **10+ event types**: earthquake, hurricane, flood, fire, heatwave, blizzard, meteor strike, economic crash, tech boom, transit strike, alien invasion
- Configurable intensity (1–100) and blast radius
- Events affect city scores dynamically for their duration, then recover
- Traffic agents flee disaster zones at double speed

### AI Features
- **AI Advisor** (Gemini) — analyzes city metrics in real time and gives 3 specific, numbered recommendations; supports custom questions
- **News Ticker** (Gemini) — generates breaking news headlines and body text for each disaster event; broadcasts to all players simultaneously
- **GDP Estimator** — describe a building and Gemini estimates its annual economic output before you place it; stored per-building in SpacetimeDB

### Live Data Integration
- **Weather** — real NYC conditions from Open-Meteo API (temperature, wind, precipitation), updated every 60 seconds
- **Economic indicators** — live NY unemployment, US GDP growth, and US CPI inflation from FRED (Federal Reserve)
- **Air quality** — PM2.5 AQI for NYC via Open-Meteo air quality endpoint

### Traffic Simulation
- Cars and pedestrians spawn on roads and navigate the city using SpacetimeDB-side pathfinding
- Lane offset logic keeps cars on the right side of roads
- Agent count scales dynamically with economy score and population
- Agents flee disaster zones and respawn after events clear

### City Metrics
- **Population** — derived from building density and floor area
- **Economy score** — tracks GDP contributions, commercial density, disaster shocks
- **Happiness** — green space, infrastructure balance, disaster history
- **Health score** — green space ratio, building density, air quality
- **Traffic score** — road coverage vs. building density
- **Simulated GDP** — base NYC GDP + floor-area multiplier + per-building Gemini estimates

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Real-time backend | SpacetimeDB (TypeScript module, Maincloud hosted) |
| Frontend framework | React 19 + Vite 7 |
| 3D rendering | Three.js 0.184 + React Three Fiber 9.6 |
| 3D helpers | @react-three/drei (OrbitControls, Html overlays) |
| AI / LLM | Google Gemini API (gemini-3-flash-preview) |
| Live weather | Open-Meteo API (free, no auth) |
| Economic data | FRED API (Federal Reserve) |
| Deployment | Vercel (static) + SpacetimeDB Maincloud |
| Language | TypeScript throughout (server + client) |

---

## SpacetimeDB Architecture

SpacetimeDB is the entire backend — there is no separate web server. The TypeScript module runs as a WebAssembly process inside the database, and all clients subscribe to table changes over WebSocket.

### Tables

| Table | Description |
|-------|-------------|
| `CityEdit` | Append-only log of every place/move/remove operation |
| `Player` | Online players — identity, cursor position, color, last action |
| `CityStats` | Singleton row: population, economy, happiness, health, traffic, green scores |
| `WeatherState` | Singleton: real-world NYC weather (temp, wind, precipitation) |
| `EconomicData` | Singleton: GDP growth, CPI inflation, unemployment rate |
| `Event` | Active disaster events with type, radius, intensity, expiry |
| `Agent` | Cars and pedestrians with position, heading, speed, and pathfinding state |
| `SimulationClock` | Singleton: tick counter, speed multiplier, simulated year |
| `SurfaceGrid` | Road/grass/building type grid used for agent pathfinding |
| `NewsBulletin` | AI-generated disaster headlines broadcast to all clients |
| `BuildingMeta` | Per-building GDP estimate and description (stored on place, deleted on remove) |

### Key Reducers

**City editing:** `placeBuilding`, `removeBuilding`, `moveBuilding`, `changeZone`, `undoLastEdit`, `resetCity`

**Players:** `joinCity`, `leaveCity`, `moveCursor`, `addScore`

**Disasters:** `triggerDisaster`, `clearDisaster`, `tickDisasters`

**Simulation:** `advanceClock`, `setClockSpeed`, `tickAgents`, `updateAgentCount`, `spawnAgents`

**Data sync:** `updateCityStats`, `updateWeather`, `updateEconomicData`

**News:** `postBulletin`

### Host Election Pattern

Every connected client competes to be the "host." The host is whichever player has the lexicographically lowest identity string. Only the host calls the simulation reducers (`tickAgents`, `advanceClock`, `tickDisasters`, `updateCityStats`) — this prevents multiple clients from fighting over the same singleton rows and creating feedback loops.

---

## Project Structure

```
MultiCitySimulator/
├── README.md
├── vercel.json                        # Vercel build config
│
├── backend/
│   ├── main.py                        # FastAPI server (optional, local only)
│   ├── generate_city.py               # One-time VoxCity data generator
│   ├── requirements.txt
│   └── data/
│       └── manhattan.json             # Pre-generated voxel grid (26 MB)
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    │
    ├── spacetimedb/
    │   └── src/
    │       └── index.ts               # All tables + reducers (~1100 lines)
    │
    └── client/
        ├── public/
        │   └── manhattan.json         # City data served as static asset
        └── src/
            ├── main.tsx               # SpacetimeDB provider + connection
            ├── App.tsx                # Main app logic, subscriptions, score math
            ├── components/
            │   ├── CityScene.tsx      # R3F canvas, voxels, player cursors
            │   ├── VoxelGrid.tsx      # InstancedMesh rendering
            │   ├── AgentLayer.tsx     # Cars + pedestrians (InstancedMesh)
            │   ├── Toolbar.tsx        # Tool selector + building editor
            │   ├── StatsPanel.tsx     # Left panel: all city metrics
            │   ├── EventPanel.tsx     # Disaster trigger UI
            │   ├── AIAdvisor.tsx      # Gemini advisor panel
            │   ├── NewsTicker.tsx     # AI news bar + bulletin broadcaster
            │   └── ActivityFeed.tsx   # Recent player actions feed
            ├── utils/
            │   └── buildingMap.ts     # Building footprint tracking
            └── module_bindings/       # Auto-generated from SpacetimeDB (do not edit)
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- A Google Gemini API key (for AI features)
- A SpacetimeDB account (for publishing module changes — optional if using the live module)

### 1. Clone and install

```bash
git clone https://github.com/shivansh-dutta/simcity.git
cd simcity/frontend
npm install
```

### 2. Set environment variables

Create `frontend/client/.env.local`:

```env
VITE_STDB_MODULE=urban-whatif-xunfn
VITE_GEMINI_KEY=your_gemini_api_key_here
VITE_FRED_KEY=your_fred_api_key_here
```

> The app connects to the live SpacetimeDB module on Maincloud by default, so you share state with anyone else running the app. No local server needed.

### 3. Start the dev server

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. Open multiple tabs to test multiplayer sync.

### 4. Build for production

```bash
cd frontend
npm run build
# Output: frontend/dist/
```

---

## Deployment

The app deploys as a fully static site on Vercel — no server required. City data (`manhattan.json`) is served from `frontend/public/` as a static asset.

### vercel.json

```json
{
  "buildCommand": "cd frontend && npm install && npx vite build",
  "outputDirectory": "frontend/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Deploy via CLI

```bash
cd frontend
vercel --prod
```

### Environment variables on Vercel

Set these in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Description |
|----------|-------------|
| `VITE_STDB_MODULE` | SpacetimeDB module name (`urban-whatif-xunfn`) |
| `VITE_GEMINI_KEY` | Google Gemini API key |
| `VITE_FRED_KEY` | FRED API key (get free at https://fred.stlouisfed.org/docs/api/api_key.html) |

### Publishing SpacetimeDB module changes

```bash
cd frontend/spacetimedb
spacetime publish urban-whatif-xunfn --server maincloud --yes
spacetime generate --lang typescript --out-dir ../client/src/module_bindings --module-path .
```

---

## Architecture Notes

### Why SpacetimeDB?

Traditional multiplayer requires a game server + database + WebSocket layer + auth system. SpacetimeDB collapses all of that into one: you write TypeScript reducers that run inside the database as WebAssembly, and clients subscribe to SQL queries over WebSocket. The result is sub-10ms sync with zero infrastructure overhead.

Key SpacetimeDB patterns used in this project:
- **`ctx.random()`** — deterministic RNG inside reducers (used for agent pathfinding and spawn positions)
- **`ctx.timestamp`** — server-authoritative timestamps for event expiry and action ordering
- **`ctx.sender`** — identity-based player tracking (no auth system needed)
- **Singleton rows** — tables with a fixed primary key (e.g., `CityStats` at key `0`) act as shared global state
- **Public tables** — all game tables are `public: true` so clients can subscribe without server-side filtering

### Client-side score calculation

Score formulas (population, GDP, happiness, etc.) run on every client after each edit. Since all clients derive from the same `liveGrid` (base grid + ordered edits), they converge to the same numbers. The host client then pushes the result to SpacetimeDB via `updateCityStats` — this avoids per-reducer score recalculation and keeps the server logic simple.

### City data

Manhattan's voxel geometry was generated offline using [VoxCity](https://github.com/voxcity/voxcity) from real building footprint and height data. The output (`manhattan.json`, ~26 MB) is committed to the repo and served as a static Vite public asset — eliminating the need for a Python backend at runtime.

---

## Known Issues

- **Moving an already-moved building** causes it to disappear (height lookup mismatch on second move)
- **Traffic agents** navigate correctly but move with slightly jerky "ant-like" motion — continuous steering is not yet implemented
- **Large JS bundle** (~1.3 MB minified) — Three.js + React Three Fiber aren't code-split yet

---

## Built With

- [SpacetimeDB](https://spacetimedb.com) — real-time multiplayer database
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) — 3D rendering
- [Google Gemini](https://ai.google.dev) — AI advisor and news generation
- [VoxCity](https://github.com/voxcity/voxcity) — city voxelization
- [Open-Meteo](https://open-meteo.com) — free weather API
- [FRED](https://fred.stlouisfed.org) — Federal Reserve economic data
- [Vercel](https://vercel.com) — deployment
