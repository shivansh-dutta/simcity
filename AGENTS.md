# AGENTS.md — Urban What-If: Real-Time Collaborative City Simulator
# Read this file completely before writing a single line of code.
# These rules override your defaults. Do not deviate without stating why.

---

## What This Project Is

A real-time multiplayer city simulation app. Multiple players share a live
3D voxel map of a real city (Lower Manhattan). They can:
- Move, remove, or add buildings
- Trigger simulated events (disasters, weather, economic changes)
- Watch simulated effects on population, traffic, economy in real time
- See live real-world data (weather, air quality, economic indicators) overlaid
- Trade resources or zones with other players
- Observe cascading consequences of their changes (remove a hospital → health score drops)

---

## Technology Stack — DO NOT change any of these without explicit user instruction

| Layer | Technology | Notes |
|-------|-----------|-------|
| City data source | VoxCity (Python) | Generates real NYC voxel grid from OSM |
| Backend API | FastAPI (Python 3.12) | Serves city grid JSON, runs once at startup |
| Real-time sync | SpacetimeDB TypeScript module | ALL game state lives here |
| 3D renderer | React 19 + @react-three/fiber + Three.js | InstancedMesh for voxels |
| Live data | Open-Meteo API (weather, free, no key) | Poll every 60s |
| Live data | statisticsoftheworld.com (economic, free, no key) | Poll on load |
| Frontend deploy | Cloudflare Pages | Free tier, unlimited bandwidth |
| Backend deploy | SpacetimeDB Maincloud | Free tier |
| Language | TypeScript everywhere on frontend | No JavaScript files |

---

## Critical Technical Rules — Memorize These

### SpacetimeDB (most common source of bugs)
1. Server module imports come from `spacetimedb/server` — NOT `@spacetimedb/sdk`
2. `@spacetimedb/sdk` is the CLIENT library. Using it in server code silently breaks.
3. Reducers do NOT return data to callers. They only write to tables. Period.
4. Clients read ALL data exclusively through `useTable` subscriptions.
5. SpacetimeDB exports `useReducer` — it will clash with React's `useReducer`.
   ALWAYS import as: `import { useReducer as useStdbReducer } from 'spacetimedb/react'`
6. Use `ctx.sender.toHexString()` for player identity. Never trust identity in args.
7. `insertOrUpdate` replaces a row if the primary key already exists.
8. Tables default to private. Add `{ public: true }` to make them client-readable.

### VoxCity / Python
9. `get_voxcity()` returns a tuple — destructure ALL 8 values or you'll get wrong vars.
10. The grid shape is `grid[row][col][level]` — never `grid[x][y][z]`.
11. Numpy types crash FastAPI's JSON serializer. ALWAYS call `.tolist()` before returning.
12. Individual numpy scalars also crash — wrap them: `int(val)` or `float(val)`.
13. Use `building_source='OpenStreetMap'` to avoid requiring Google Earth Engine auth.

### Three.js / R3F
14. VoxCity grid axes map to Three.js as: row → X axis, col → Z axis, level → Y axis.
    Getting this wrong makes the city render sideways or flat.
15. Use `THREE.InstancedMesh` for voxels — one mesh per voxel type, never per voxel.
    Individual meshes at 800k+ voxels = browser crash.
16. Call `instancedMesh.instanceMatrix.needsUpdate = true` after setting matrices.
17. R3F `<Canvas>` cannot contain standard HTML elements. Use Drei's `<Html>` component.
18. Clone GLTF scenes before placing: `scene.clone()` — sharing one scene instance breaks.

### General
19. Never hardcode the SpacetimeDB module name. Use env var `VITE_STDB_MODULE`.
20. `manhattan.json` must be committed to the repo — FastAPI loads it at startup.
21. All API calls to Open-Meteo and statisticsoftheworld.com happen CLIENT-SIDE only,
    then results are pushed into SpacetimeDB via a reducer so all users see the same data.

---

## Project File Structure — Create Exactly This

```
urban-whatif/
├── AGENTS.md                        ← this file
├── SPEC.md                          ← project spec (read before coding)
├── HANDOFF.md                       ← updated at end of each phase
│
├── backend/
│   ├── generate_city.py             ← Phase 1: run once to create city data
│   ├── main.py                      ← Phase 2: FastAPI server
│   ├── requirements.txt
│   └── data/
│       └── manhattan.json           ← output of generate_city.py (commit this)
│
└── frontend/
    ├── package.json
    ├── spacetimedb/
    │   ├── package.json
    │   └── src/
    │       └── index.ts             ← Phase 3: ALL SpacetimeDB tables + reducers
    └── client/
        ├── src/
        │   ├── main.tsx
        │   ├── App.tsx
        │   ├── module_bindings/     ← auto-generated, never edit manually
        │   └── components/
        │       ├── CityScene.tsx    ← Phase 4: R3F canvas + InstancedMesh
        │       ├── VoxelGrid.tsx    ← Phase 4: renders base grid + applies edits
        │       ├── Toolbar.tsx      ← Phase 4: player controls
        │       ├── EventPanel.tsx   ← Phase 4: disasters, weather events
        │       ├── StatsPanel.tsx   ← Phase 4: live city metrics
        │       └── TradePanel.tsx   ← Phase 4: player-to-player trades
        └── vite.config.ts
```

---

## Phase Order — Strict Sequential, No Skipping

### Phase 1 — City Generation (30 min)
- Run `backend/generate_city.py`
- Target: Lower Manhattan SW(-74.0210, 40.7040) NE(-74.0040, 40.7140), meshsize=5
- Done when: `backend/data/manhattan.json` exists, shape is printed, JSON is valid

### Phase 2 — FastAPI Server (20 min)
- Write and run `backend/main.py`
- Done when: `curl http://localhost:8000/city` returns the city JSON without errors

### Phase 3 — SpacetimeDB Module (45 min)
- Write `frontend/spacetimedb/src/index.ts` with ALL tables and reducers from SPEC.md
- Run: `spacetime publish urban-whatif --maincloud`
- Run: `spacetime generate --lang typescript --out-dir client/src/module_bindings`
- Done when: `module_bindings/` contains generated TypeScript files

### Phase 4 — React Frontend (90 min)
- Build all components in `client/src/components/`
- City must render as colored voxels in browser
- Done when: browser at localhost:5173 shows the city at 60fps (check Stats panel)

### Phase 5 — Core Interactions (30 min)
- Move building: two-click flow, syncs to second browser tab within 500ms
- Trigger disaster: button → event fires → simulation scores update for all users
- Done when: two open tabs show identical city state with <500ms sync latency

### Phase 6 — Deploy (30 min)
- SpacetimeDB already deployed (Phase 3)
- FastAPI → Render.com (free tier)
- React → Cloudflare Pages
- Done when: public URL works, two people on different machines see same city

### Phase 7+ — Polish (remaining time)
- See SPEC.md Feature Backlog section

---

## Verification Commands — Run These After Each Phase

```bash
# Phase 1
python backend/generate_city.py
# Expect: prints grid shape like (200, 200, 85), confirms file saved

# Phase 2
cd backend && uvicorn main:app --port 8000 &
curl http://localhost:8000/city | python3 -c "import json,sys; d=json.load(sys.stdin); print('shape:', d['shape'])"
# Expect: prints shape without error

# Phase 3
spacetime publish urban-whatif --maincloud
spacetime generate --lang typescript --out-dir client/src/module_bindings
ls client/src/module_bindings/
# Expect: lists .ts files

# Phase 4
cd frontend && npm run dev
# Open localhost:5173 — expect colored 3D city visible

# Phase 5
# Open two browser tabs at localhost:5173
# Move a building in tab 1 — expect it to appear in tab 2 within 500ms
```

---

## Agent Behavior Rules

- Before writing ANY code, confirm you have read both AGENTS.md and SPEC.md.
- After completing any phase, run the verification command and show the output.
- Do not proceed to the next phase if verification fails.
- If you hit the same error 3 times in a row, stop and explain what you tried and why it failed. Do not loop silently.
- Never create files outside the structure defined above without asking first.
- Never install a package not listed in SPEC.md without asking first.
- When generating SpacetimeDB bindings, always use the exact command shown above.
- If you find a discrepancy between AGENTS.md and SPEC.md, SPEC.md wins for feature content, AGENTS.md wins for technical rules.


---

## Session Handoff Protocol

At the END of every phase session, before closing, the agent must:

1. Update HANDOFF.md in the project root with the template below.
2. Keep it SHORT — max 20 lines total. No code blocks, no long explanations.
3. Overwrite the previous content entirely — only the current state matters.

At the START of every new phase session, the agent must:
1. Read HANDOFF.md first, before AGENTS.md or SPEC.md.
2. Use it to understand exactly where the project is and what works.

---

## HANDOFF.md Template (Add to the beginning  of this file after every phase)

# HANDOFF — Urban What-If

## Last completed phase
Phase [N] — [Phase name]

## What exists and works
- [file or system]: [one line on what it does and that it's confirmed working]
- [file or system]: [same]

## Key decisions made that differ from SPEC.md
- [any deviation, or "None"]

## Current known issues
- [any unresolved problem, or "None"]

## Verify the previous phase still works
[single command to run that proves it]

## Next phase starts with
[first action of the next phase in one sentence]

##Phases Before That
- Rest of the previous document