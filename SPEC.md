# SPEC.md — Urban What-If: Real-Time Collaborative City Simulator

---

## One-Sentence Description

Multiple players share a live 3D voxel map of real Lower Manhattan, modify
buildings and city zones, trigger disasters and policy changes, and watch
simulated consequences ripple through population, economy, and infrastructure
in real time — all synced live via SpacetimeDB.

---

## Target Area

| Field | Value |
|-------|-------|
| City | Lower Manhattan, New York City |
| SW corner | (-74.0210, 40.7040) |
| NE corner | (-74.0040, 40.7140) |
| Voxel size | 5 meters |
| Approx grid size | ~200 × 200 × 90 voxels |
| Building source | OpenStreetMap (no auth required) |
| Land cover source | OpenStreetMap |

---

## Complete Data Flow

```
VoxCity (Python, runs ONCE offline before hackathon)
  └─ generates backend/data/manhattan.json
       └─ shape: [rows, cols, levels] numpy array → .tolist() for JSON
       └─ building_gdf: GeoDataFrame with name, height, footprint per building

FastAPI (Python, runs on Render.com)
  └─ GET /city → returns manhattan.json (cached in memory at startup)
  └─ GET /health → health check

React Client (Cloudflare Pages)
  └─ fetches /city once on load → stores as base grid (never mutated)
  └─ subscribes to SpacetimeDB tables via useTable hooks
  └─ polls Open-Meteo every 60s → calls updateWeather reducer
  └─ computes liveGrid = base grid + all CityEdit rows applied on top
  └─ renders liveGrid with THREE.InstancedMesh
  └─ polls statisticsoftheworld.com on load → calls updateEconomicData reducer

SpacetimeDB (Maincloud, free tier)
  └─ all game state persists here
  └─ any change by any player → all clients see it within ~100ms
```

---

## Voxel Type Reference

| Value | Meaning | Three.js color |
|-------|---------|----------------|
| 0 | Air (empty) | not rendered |
| 1 | Building | #9B9B9B (concrete gray) |
| 2 | Tree / vegetation | #2E7D32 (dark green) |
| 3 | Ground / pavement | #8B7355 (brown) |
| 4 | Water | #1565C0 (blue) |
| 5 | Terrain / elevation | #6D4C41 (earth) |

---

## SpacetimeDB Schema — ALL Tables and Reducers

### Tables

#### CityEdit (public: true)
Every modification to the city. The base grid is immutable.
The live city = base grid + all CityEdit rows applied in order.

| Field | Type | Description |
|-------|------|-------------|
| editId | string (PK) | uuid — unique per edit |
| editType | string | "remove", "place", "move", "disaster", "zone_change" |
| fromX | number | source grid column (0 if not applicable) |
| fromZ | number | source grid row (0 if not applicable) |
| fromHeight | number | number of vertical voxels to clear at source |
| toX | number | destination grid column |
| toZ | number | destination grid row |
| voxelType | number | voxel type to place (see Voxel Type Reference) |
| height | number | number of vertical voxels to fill at destination |
| label | string | human-readable description of the change |
| placedBy | string | player identity hex string |
| color | string | hex color for visual attribution |
| createdAt | bigint | Unix timestamp ms |

#### Player (public: true)

| Field | Type | Description |
|-------|------|-------------|
| identity | string (PK) | SpacetimeDB identity hex |
| username | string | display name |
| cursorX | number | current grid X position of cursor |
| cursorZ | number | current grid Z position of cursor |
| color | string | unique hex color for this player |
| isOnline | boolean | connection status |
| score | number | accumulated city improvement points |
| lastSeen | bigint | Unix timestamp ms |

#### CityStats (public: true)
Single-row table (id always = 0). Global city simulation metrics.

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK) | always 0 |
| population | number | simulated city population |
| happiness | number | 0–100 score |
| economyScore | number | 0–100 score |
| healthScore | number | 0–100 score |
| trafficScore | number | 0–100 score (100 = no congestion) |
| greenScore | number | 0–100 (parks, trees percentage) |
| disasterActive | string | "" or disaster type currently active |
| disasterIntensity | number | 0–100, 0 = no disaster |
| lastUpdated | bigint | Unix timestamp ms |

#### WeatherState (public: true)
Single-row table (id always = 0). Real-world NYC weather.

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK) | always 0 |
| city | string | "New York" |
| tempC | number | current temperature Celsius |
| weatherCode | number | WMO weather code |
| windSpeed | number | km/h |
| precipitation | number | mm |
| updatedAt | bigint | Unix timestamp ms |

#### EconomicData (public: true)
Single-row table (id always = 0). Real-world economic indicators.

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK) | always 0 |
| gdpGrowth | number | % annual GDP growth |
| inflation | number | % inflation rate |
| unemployment | number | % unemployment rate |
| country | string | "USA" |
| updatedAt | bigint | Unix timestamp ms |

#### TradeOffer (public: true)
Active trades between players.

| Field | Type | Description |
|-------|------|-------------|
| offerId | string (PK) | uuid |
| fromPlayer | string | offering player identity |
| toPlayer | string | target player identity ("" = open offer) |
| offerType | string | "zone_transfer", "build_rights", "resource" |
| offerDetails | string | JSON string with offer specifics |
| status | string | "pending", "accepted", "rejected", "expired" |
| createdAt | bigint | Unix timestamp ms |

#### Event (public: true)
History of city events triggered by players.

| Field | Type | Description |
|-------|------|-------------|
| eventId | string (PK) | uuid |
| eventType | string | see Event Types below |
| triggeredBy | string | player identity hex |
| intensity | number | 0–100 |
| affectedX | number | center grid X of affected area |
| affectedZ | number | center grid Z of affected area |
| radius | number | grid cells affected radius |
| duration | number | seconds this event lasts |
| label | string | display text |
| createdAt | bigint | Unix timestamp ms |

---

### Reducers

#### Player Management
```
joinCity(username: string, color: string)
  → insertOrUpdate Player row using ctx.sender identity

moveCursor(x: number, z: number)
  → update Player row: cursorX, cursorZ, lastSeen

leaveCity()
  → update Player row: isOnline = false

addScore(points: number)
  → update Player row: score += points (called after positive city actions)
```

#### City Editing
```
removeBuilding(editId, fromX, fromZ, fromHeight, label)
  → insert CityEdit with editType="remove"

placeBuilding(editId, toX, toZ, voxelType, height, label, color)
  → insert CityEdit with editType="place"

moveBuilding(editId, fromX, fromZ, fromHeight, toX, toZ, height, label, color)
  → insert CityEdit with editType="move"

changeZone(editId, toX, toZ, voxelType, height, label)
  → insert CityEdit with editType="zone_change"

undoLastEdit()
  → find most recent CityEdit where placedBy = ctx.sender, delete it
```

#### Simulation Events
```
triggerDisaster(eventId, eventType, intensity, affectedX, affectedZ, radius, duration)
  → insert Event row
  → update CityStats: disasterActive = eventType, disasterIntensity = intensity
  → update CityStats scores based on disaster type (see Simulation Rules)

clearDisaster()
  → update CityStats: disasterActive = "", disasterIntensity = 0

updateCityStats(population, happiness, economyScore, healthScore, trafficScore, greenScore)
  → insertOrUpdate CityStats id=0
  → (called by client after recalculating scores from current city state)
```

#### Live Data
```
updateWeather(tempC, weatherCode, windSpeed, precipitation)
  → insertOrUpdate WeatherState id=0

updateEconomicData(gdpGrowth, inflation, unemployment)
  → insertOrUpdate EconomicData id=0
```

#### Trading
```
createTradeOffer(offerId, toPlayer, offerType, offerDetails)
  → insert TradeOffer with status="pending", fromPlayer=ctx.sender

respondToTrade(offerId, accept: boolean)
  → update TradeOffer: status = accept ? "accepted" : "rejected"
  → if accepted, execute the trade (call relevant edit reducers)
```

---

## Simulation Rules — How City Scores Work

These are calculated CLIENT-SIDE after each edit, then pushed to SpacetimeDB
via `updateCityStats`. Every client recalculates on every edit — results converge
because the inputs (liveGrid) are identical across all clients.

### Score Calculations

```
greenScore = (count of voxelType=2 in grid / total non-air voxels) × 100

trafficScore = 100 - (count of building voxels above 15-level height / total buildings × 50)
  → more skyscrapers = more congestion

healthScore = greenScore × 0.4 + (100 - disasterIntensity) × 0.6

economyScore = (count of tall buildings >10 levels / total buildings) × 60
              + economicData.gdpGrowth × 4
              - economicData.inflation × 2

happiness = healthScore × 0.3 + trafficScore × 0.3 + greenScore × 0.2
            + economyScore × 0.2
            - disasterIntensity × 0.5

population = 850000 + (happiness - 50) × 5000
             + economyScore × 3000
             - disasterIntensity × 20000
```

### Disaster Effects (applied immediately via triggerDisaster reducer)

| Disaster | Score Impact |
|----------|-------------|
| Earthquake | healthScore -40, trafficScore -30, economyScore -20 |
| Hurricane | healthScore -30, greenScore -40, trafficScore -50 |
| Flood | trafficScore -60, economyScore -30, population base -100000 |
| Fire | healthScore -20, economyScore -40, remove random building voxels |
| Heatwave | healthScore -20, happiness -15, greenScore -10 |
| Economic crash | economyScore -50, population base -200000 |

---

## Event Types Reference

| eventType | Description | Visual |
|-----------|-------------|--------|
| "earthquake" | Random buildings collapse | Shake animation, gray dust particles |
| "hurricane" | Trees removed, traffic blocked | Blue swirl overlay, rain |
| "flood" | Low areas filled with water voxels | Blue voxels rising |
| "fire" | Building voxels turn orange/red | Flame particles, orange tint |
| "heatwave" | No structural change | Orange ambient light |
| "economic_crash" | No structural change | Red overlay, falling number UI |
| "traffic_jam" | No structural change | Red road coloring |
| "park_bonus" | Green score boost from new parks | Green particle burst |

---

## UI Components Required

### CityScene.tsx
- R3F `<Canvas>` fills full viewport
- Camera starts at position [100, 120, 100], fov 50
- OrbitControls with maxPolarAngle = Math.PI/2.1 (no below-ground view)
- Ambient light + directional light + subtle fog
- Renders: VoxelGrid, player cursors (spheres), selected cell highlight

### VoxelGrid.tsx
- Computes `liveGrid` from base grid + edits using useMemo
- Separates voxels by type → one InstancedMesh per type
- Updates InstancedMesh matrices only when edits change (not every frame)
- Handles click events → calls onCellClick with {x, z} grid coordinates

### Toolbar.tsx (bottom center)
- Tools: Select | Move | Remove | Add Building | Add Park | Undo
- Move tool: two-click flow (pick up → drop)
- Add Building: opens height selector (1–50 floors)
- Shows selected cell coordinates
- Shows active tool name

### EventPanel.tsx (top right)
- Disaster buttons: Earthquake | Hurricane | Flood | Fire | Heatwave | Economic Crash
- Each has intensity slider (0–100)
- "Clear Disaster" button
- Shows currently active disaster with countdown

### StatsPanel.tsx (left side, collapsible)
- Population (number with change indicator)
- Happiness bar (0–100)
- Economy bar
- Health bar
- Traffic bar
- Green score bar
- Weather section: temp, conditions, wind
- Economic data: GDP growth, inflation, unemployment
- Online players list with colored dots

### TradePanel.tsx (top left, toggle)
- Active offers list
- "Create Offer" form: type, details, target player
- Accept/Reject buttons on incoming offers

---

## Live Data APIs

### Weather — Open-Meteo (free, no API key)
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=40.71
  &longitude=-74.01
  &current_weather=true
  &hourly=precipitation
  &timezone=auto
Poll every: 60 seconds
Push result: call updateWeather reducer
```

### Economic Data — statisticsoftheworld.com (free, no API key)
```
GDP growth:    GET https://statisticsoftheworld.com/api/v2/indicator/IMF.NGDP_RPCH?country=USA
Inflation:     GET https://statisticsoftheworld.com/api/v2/indicator/IMF.PCPIPCH?country=USA
Unemployment:  GET https://statisticsoftheworld.com/api/v2/indicator/IMF.LUR?country=USA
Poll every: 5 minutes (data updates infrequently)
Push result: call updateEconomicData reducer
```

---

## Visual Design Principles

- Dark theme: background #0a0a0a, panels rgba(0,0,0,0.85) with blur
- Buildings: concrete gray (#9B9B9B) for unmodified, player color for newly placed
- Trees: dark green (#2E7D32)
- Ground: brown (#8B7355)
- Water: blue (#1565C0)
- Selected cell: gold wireframe box (#FFD700)
- Player cursors: colored spheres floating 5m above grid
- Disaster overlay: full-screen color tint matching disaster type
- Stats bars: color-coded (green=good, yellow=warning, red=critical)

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| S | Select tool |
| M | Move tool |
| R | Remove tool |
| B | Add Building tool |
| P | Add Park tool |
| Ctrl+Z | Undo last edit |
| E | Toggle Event Panel |
| T | Toggle Trade Panel |
| Space | Reset camera to default position |

---

## Feature Backlog (implement in priority order after MVP)

1. Building name tooltips on hover (from building_gdf data)
2. Animated disaster effects (shake, particles, flooding animation)
3. Edit history feed ("Player A moved WTC to Brooklyn 2 minutes ago")
4. Zone overlay toggle (show residential/commercial/industrial coloring)
5. Time-lapse replay of all edits in order
6. City comparison: "before" vs "after" split screen
7. Population heatmap overlay on the city
8. Minimap (2D top-down canvas, bottom right corner)
9. Building spotlight: click → shows full stats panel for that building
10. Leaderboard: players ranked by city improvement score

---

## Done Criteria for MVP

The MVP is complete when all of the following are true:

- [ ] Public URL accessible in browser
- [ ] Real Lower Manhattan voxels visible as 3D colored blocks
- [ ] Two browser tabs show identical city state
- [ ] Moving a building in tab 1 appears in tab 2 within 500ms
- [ ] At least one disaster type triggers visible score changes
- [ ] Weather panel shows real current NYC temperature
- [ ] Economic panel shows real GDP growth and inflation
- [ ] Player cursors visible across tabs
- [ ] Undo works (last edit reverted for that player)
- [ ] Stats panel updates after city changes
