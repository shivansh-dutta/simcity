import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducer as useStdbReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { v4 as uuidv4 } from 'uuid';
import ActivityFeed from './components/ActivityFeed';
import AIAdvisor from './components/AIAdvisor';
import CityScene from './components/CityScene';
import NewsTicker from './components/NewsTicker';
import EventPanel from './components/EventPanel';
import StatsPanel from './components/StatsPanel';
import Toolbar, { type MoveSource } from './components/Toolbar';
import { applyCityEdits, type GridCell, type VoxelGridData } from './components/VoxelGrid';
import { reducers, tables } from './module_bindings';
import type { CityEdit, EconomicData, Event, WeatherState, CityStats } from './module_bindings/types';
import { buildBuildingLookup, getBuildingAt, type BuildingFootprint, type BuildingLookup, type BuildingMapPayload } from './utils/buildingMap';
import type { BuildingDimensions, Tool } from './components/Toolbar';

type CityPayload = BuildingMapPayload & {
  shape: number[];
  voxcity_grid?: number[][][];
  grid?: number[][][];
};

type SelectedBuilding = BuildingFootprint & {
  anchor: GridCell;
  center: GridCell;
  heightLevels: number;
};

type ToolState = 'select' | 'move' | 'remove' | 'add_building' | 'add_park' | 'trigger_disaster';

// Removing AppState as it's unused.

type CitySummary = {
  population: number;
  happiness: number;
  economyScore: number;
  healthScore: number;
  trafficScore: number;
  greenScore: number;
  gdpDollars: number;
  unemployment: number;
};

type CityCounts = {
  totalVoxels: number;
  totalBuildings: number;
  buildingVoxelCount: number;
  buildingColumnCount: number;
  tallBuildingCount: number;
  treeCount: number;
  lowElevationVoxelCount: number;
  maxPossibleVoxels: number;
};

type DisasterEvent = Pick<Event, 'eventType' | 'intensity' | 'affectedX' | 'affectedZ' | 'radius'>;

const PLAYER_COLOR_KEY = 'urban-whatif-player-color';
const PLAYER_NAME_KEY = 'urban-whatif-player-name';

const BASE_GDP = 770_000_000_000;
const BASE_POPULATION = 1_600_000;
const BASE_UNEMPLOYMENT = 3.9;
const BASE_COMMERCIAL_SQFT = 500_000_000;
const SQFT_PER_VOXEL_LEVEL = 269;

function randomPlayerColor(): string {
  const colors = ['#FF7A59', '#46D9A8', '#5AB8FF', '#F4D35E', '#F9578E', '#A7F070'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function persistentValue(key: string, fallback: () => string): string {
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = fallback();
  localStorage.setItem(key, next);
  return next;
}

function cellKey(x: number, z: number): string {
  return `${x}_${z}`;
}

function buildLiveBuildingLookup(
  baseLookup: BuildingLookup | null,
  edits: readonly CityEdit[]
): BuildingLookup | null {
  if (!baseLookup) return null;
  if (edits.length === 0) return baseLookup;

  const cellToBuildingId = new Map(baseLookup.cellToBuildingId);
  const buildingsById = new Map<string, BuildingFootprint>();
  for (const [id, building] of baseLookup.buildingsById) {
    buildingsById.set(id, { ...building, cells: building.cells.map(c => ({ ...c })) });
  }

  const orderedEdits = [...edits].sort((a, b) => Number(a.createdAt - b.createdAt));

  for (const edit of orderedEdits) {
    if (edit.editType === 'remove') {
      const fromKey = cellKey(edit.fromX, edit.fromZ);
      const buildingId = cellToBuildingId.get(fromKey);
      if (buildingId) {
        cellToBuildingId.delete(fromKey);
        const building = buildingsById.get(buildingId);
        if (building) {
          building.cells = building.cells.filter(c => !(c.x === edit.fromX && c.z === edit.fromZ));
          if (building.cells.length === 0) buildingsById.delete(buildingId);
        }
      }
    } else if (edit.editType === 'move') {
      const fromKey = cellKey(edit.fromX, edit.fromZ);
      const toKey = cellKey(edit.toX, edit.toZ);
      const buildingId = cellToBuildingId.get(fromKey);
      if (buildingId) {
        cellToBuildingId.delete(fromKey);
        cellToBuildingId.set(toKey, buildingId);
        const building = buildingsById.get(buildingId);
        if (building) {
          const idx = building.cells.findIndex(c => c.x === edit.fromX && c.z === edit.fromZ);
          if (idx >= 0) {
            building.cells[idx] = { x: edit.toX, z: edit.toZ };
          } else {
            building.cells.push({ x: edit.toX, z: edit.toZ });
          }
        }
      }
    }
  }

  return { cellToBuildingId, buildingsById };
}

function normalizeVoxelCode(value: number): number {
  if (value === 0) return 0;
  if (value === -3 || value === 13) return 1;
  if (value === -2 || value === 2 || value === 5 || value === 8) return 2;
  if (value === 9) return 4;
  if (value === 1 || value === 3 || value === 4 || value === 6 || value === 7) return 5;
  if (value === 11 || value === 12 || value === 14 || value === -1) return 3;
  return value > 0 ? 3 : 0;
}

function normalizeGrid(grid: number[][][]): VoxelGridData {
  return grid.map(row => row.map(column => column.map(value => normalizeVoxelCode(value))));
}

function getBuildingColumnHeight(grid: VoxelGridData | null, x: number, z: number): number {
  const column = grid?.[x]?.[z];
  if (!column) return 1;
  let height = 0;
  for (let level = 0; level < column.length; level += 1) {
    if (column[level] === 1) height = level + 1;
  }
  return Math.max(1, height);
}

function getBuildingCenter(cells: GridCell[]): GridCell {
  if (cells.length === 0) return { x: 0, z: 0 };
  const totals = cells.reduce(
    (sum, cell) => ({ x: sum.x + cell.x, z: sum.z + cell.z }),
    { x: 0, z: 0 }
  );
  return { x: totals.x / cells.length, z: totals.z / cells.length };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function countCityVoxels(grid: VoxelGridData): CityCounts {
  let totalVoxels = 0;
  let totalBuildings = 0;
  let buildingVoxelCount = 0;
  let buildingColumnCount = 0;
  let tallBuildingCount = 0;
  let treeCount = 0;
  let lowElevationVoxelCount = 0;
  let maxLevels = 1;

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      let buildingHeight = 0;
      maxLevels = Math.max(maxLevels, grid[row][col].length);
      for (let level = 0; level < grid[row][col].length; level += 1) {
        const voxelType = grid[row][col][level];
        if (voxelType === 0) continue;
        totalVoxels += 1;
        if (level < 3) lowElevationVoxelCount += 1;
        if (voxelType === 2) treeCount += 1;
        if (voxelType === 1) {
          buildingHeight += 1;
          buildingVoxelCount += 1;
        }
      }
      if (buildingHeight > 0) {
        totalBuildings += 1;
        buildingColumnCount += 1;
        if (buildingHeight > 10) tallBuildingCount += 1;
      }
    }
  }

  return {
    totalVoxels,
    totalBuildings,
    buildingVoxelCount,
    buildingColumnCount,
    tallBuildingCount,
    treeCount,
    lowElevationVoxelCount,
    maxPossibleVoxels: grid.length * (grid[0]?.length ?? 0) * maxLevels,
  };
}

function countBuildingsInRadius(grid: VoxelGridData, event: DisasterEvent) {
  let buildingCount = 0;
  let tallBuildingCount = 0;
  const radiusSquared = event.radius * event.radius;

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      const dx = row - event.affectedX;
      const dz = col - event.affectedZ;
      if (dx * dx + dz * dz > radiusSquared) continue;
      let height = 0;
      for (const voxelType of grid[row][col]) {
        if (voxelType === 1) height += 1;
      }
      if (height > 0) {
        buildingCount += height;
        if (height > 10) tallBuildingCount += 1;
      }
    }
  }

  return { buildingCount, tallBuildingCount };
}

function getAffectedBuildingColumns(grid: VoxelGridData, event: DisasterEvent) {
  const columns: Array<GridCell & { height: number }> = [];
  const radiusSquared = event.radius * event.radius;

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      const dx = row - event.affectedX;
      const dz = col - event.affectedZ;
      if (dx * dx + dz * dz > radiusSquared) continue;
      const height = getBuildingColumnHeight(grid, row, col);
      if (height > 0 && grid[row][col].some(voxelType => voxelType === 1)) {
        columns.push({ x: row, z: col, height });
      }
    }
  }

  return columns;
}

function summarizeCity(
  grid: VoxelGridData,
  economicData: EconomicData | null,
  weather: WeatherState | null,
  activeEvents: Event[],
  cityStats: CityStats | null,
  currentAgents: { car: number, pedestrian: number } | null,
  airQuality: { aqi: number; pm25: number } | null,
  buildingMetaGDP: number,
): CitySummary {
  const counts = countCityVoxels(grid);
  
  // Real-world urban formulas
  const gridArea = grid.length * (grid[0]?.length ?? 1);
  const avgDensity = counts.buildingVoxelCount / Math.max(1, gridArea);
  // Assume each park voxel column is roughly height 3, so footprint is treeCount / 3
  const parkFootprint = counts.treeCount / 3;

  const gdpGrowth = economicData?.gdpGrowth ?? 2.2;
  const inflation = economicData?.inflation ?? 3.1;
  const rawTempC = weather?.tempC ?? 22;
  const simulatedTempC = activeEvents.some(e => e.eventType === 'heatwave') ? rawTempC + 8 : rawTempC;

  const macroEconomy = (gdpGrowth - 2.0) * 10 - (inflation - 2.0) * 10;
  
  // Base scores derived from city state
  // Economy thrives on density but is modulated by macro factors
  let economyScore = 45 + (avgDensity / 8) * 45 + macroEconomy;
  
  let greenScore = (parkFootprint / (gridArea * 0.15)) * 100;
  
  // Traffic score is now physically linked to the car agent count!
  const carsOnRoad = currentAgents?.car ?? 0;
  // If there are many cars, traffic is bad (score approaches 0)
  // If there are few cars, traffic flows well (score approaches 100)
  // Wait, the user usually wants to see 100 Traffic = "bad traffic".
  // Let's ensure 100 = gridlock, 0 = empty streets. Wait, high scores usually mean good in other metrics (Economy 100, Health 100).
  // So let's make 100 = "Good Traffic Flow" (Empty) and 0 = "Gridlock".
  // The user wrote: "traffic said 0 at point after an event but there were still cars at the spot".
  // So traffic score should be directly proportional to number of cars. Wait!
  // If 0 = empty, then 100 = lots of cars. Let's make Traffic Score literally a reflection of the number of cars vs capacity.
  // We'll map cars directly. 0 cars = 0 Traffic Score. 200 cars = 100 Traffic Score.
  let trafficScore = Math.min(100, Math.max(0, carsOnRoad * 0.5));
  
  // Health depends on parks, traffic (pollution), and base livability
  let healthScore = 35 + (greenScore * 0.4) + ((100 - trafficScore) * 0.3);

  // Real AQI from Open-Meteo: 0-50 Good (no penalty), 50-100 Moderate, 100-200 Unhealthy
  if (airQuality) {
    healthScore -= Math.min(50, Math.max(0, (airQuality.aqi - 50) / 3));
  }

  for (const activeEvent of activeEvents) {
    const s = activeEvent.intensity / 100; // intensity scale: 0–1
    const buildingRatio = () => countBuildingsInRadius(grid, activeEvent).buildingCount / Math.max(1, counts.buildingVoxelCount);
    const tallRatio = () => countBuildingsInRadius(grid, activeEvent).tallBuildingCount / Math.max(1, counts.buildingColumnCount);

    if (activeEvent.eventType === 'earthquake') {
      // Structural collapse, road damage, economic damage scales with affected buildings
      healthScore  -= buildingRatio() * 60 * s;
      trafficScore -= 45 * s;
      economyScore -= tallRatio() * 50 * s;
      greenScore   -= 12 * s; // uprooted trees, ruptured water mains
    } else if (activeEvent.eventType === 'hurricane') {
      // Widespread wind/flood destruction
      greenScore   -= 40 * s; // trees uprooted, parks flooded
      trafficScore -= 55 * s;
      healthScore  -= 30 * s;
      economyScore -= 28 * s;
    } else if (activeEvent.eventType === 'flood') {
      // Roads impassable, businesses closed, disease risk
      trafficScore -= 65 * s;
      economyScore -= 35 * s;
      healthScore  -= 20 * s; // waterborne disease
      greenScore   -= 8 * s;  // waterlogged parks
    } else if (activeEvent.eventType === 'fire') {
      // Air quality, burns greenery, evacuation gridlock
      healthScore  -= 40 * s;
      economyScore -= 28 * s;
      greenScore   -= 30 * s; // parks and trees burn
      trafficScore -= 25 * s; // evacuation traffic surge
    } else if (activeEvent.eventType === 'heatwave') {
      // Outdoor danger, economic productivity loss, park grass dies
      const tempFactor = simulatedTempC > 35 ? 1.4 : 1.0;
      healthScore  -= 30 * s * tempFactor;
      economyScore -= 18 * s; // productivity loss, AC costs
      trafficScore -= 10 * s;
      greenScore   -= 22 * s; // drought kills vegetation
    } else if (activeEvent.eventType === 'economic_crash') {
      // Financial sector collapse; poverty worsens health, fewer cars = slightly less gridlock
      economyScore -= 65 * s;
      healthScore  -= 18 * s; // poverty, reduced healthcare access
      trafficScore += 8 * s;  // fewer commuters = slightly clearer roads
    } else if (activeEvent.eventType === 'blizzard') {
      // Transport paralysis, business closure, cold-weather health risks
      trafficScore -= 75 * s;
      economyScore -= 35 * s;
      healthScore  -= 22 * s; // hypothermia, slips, accidents
      greenScore   -= 8 * s;  // ice damage to trees
    } else if (activeEvent.eventType === 'meteor_strike') {
      // Catastrophic: impact crater, fires, shockwave
      healthScore  -= 85 * s;
      trafficScore -= 85 * s;
      economyScore -= (tallRatio() * 80 + 40) * s;
      greenScore   -= 55 * s; // incinerated parks, toxic dust
    } else if (activeEvent.eventType === 'tech_boom') {
      // Economic surge, influx of workers increases traffic, green investment
      economyScore += 45 * s;
      trafficScore += 18 * s; // more workers, more cars on the road
      greenScore   += 6 * s;  // tech investment often funds sustainability
    } else if (activeEvent.eventType === 'transit_strike') {
      // Everyone drives, workers miss shifts, stress rises
      trafficScore -= 80 * s;
      economyScore -= 25 * s;
      healthScore  -= 12 * s; // stress, less walking/cycling
    } else if (activeEvent.eventType === 'cyberattack') {
      // Systems go dark: financial networks fail, traffic lights offline, hospitals hit
      economyScore -= 42 * s;
      trafficScore -= 28 * s; // traffic lights and navigation offline
      healthScore  -= 22 * s; // hospitals, 911 systems compromised
    } else if (activeEvent.eventType === 'alien_invasion') {
      // Civilization-level collapse
      healthScore  -= 90 * s;
      trafficScore -= 90 * s;
      economyScore -= 90 * s;
      greenScore   -= 60 * s; // scorched earth
    }
  }

  economyScore = clampScore(economyScore);
  greenScore = clampScore(greenScore);
  trafficScore = clampScore(trafficScore);
  healthScore = clampScore(healthScore);
  
  // Happiness is a weighted aggregate of the quality of life factors
  let happiness = clampScore(
    (healthScore * 0.35) + 
    (economyScore * 0.30) + 
    (trafficScore * 0.20) + 
    (greenScore * 0.15)
  );

  const totalFloorArea = counts.buildingVoxelCount * SQFT_PER_VOXEL_LEVEL;
  const gdpDollars = BASE_GDP + (totalFloorArea / BASE_COMMERCIAL_SQFT) * BASE_GDP * 0.15 + buildingMetaGDP;
  const baselineBuildingVoxels = counts.maxPossibleVoxels * 0.1 || 500000;
  const populationLoss = cityStats?.populationLoss ?? 0;
  const population = BASE_POPULATION + (counts.buildingVoxelCount / baselineBuildingVoxels) * 50000 - populationLoss;
  const economyScoreDelta = economyScore - 50;
  const unemployment = BASE_UNEMPLOYMENT - (economyScoreDelta * 0.02);

  return {
    population: Math.max(0, Math.round(population)),
    happiness,
    economyScore,
    healthScore,
    trafficScore,
    greenScore,
    gdpDollars,
    unemployment
  };
}

function styles() {
  return `
    :root { color: #f4f1e8; background: #0a0a0a; font-family: "Aptos", "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    button, input, select { font: inherit; }
    button { border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: .55rem .85rem; color: #f4f1e8; background: rgba(255,255,255,.08); cursor: pointer; }
    button:hover { background: rgba(255,255,255,.15); transform: translateY(-1px); }
    button:disabled { cursor: not-allowed; opacity: .58; transform: none; }
    button.active { border-color: #ffd700; color: #0a0a0a; background: #ffd700; }
    button.undo-feedback { border-color: #46d9a8; color: #0a0a0a; background: #46d9a8; }
    button.reset-feedback { border-color: #ff6b6b; color: #0a0a0a; background: #ffb3b3; }
    .app-shell { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
    .panel, .toolbar { position: absolute; z-index: 10; border: 1px solid rgba(255,255,255,.14); border-radius: 22px; color: #f4f1e8; background: rgba(0,0,0,.85); box-shadow: 0 24px 80px rgba(0,0,0,.38); backdrop-filter: blur(16px); }
    .panel h2, .panel h3 { margin: 0 0 .75rem; }
    .panel h2 { font-size: 1rem; }
    .panel h3 { margin-top: 1.15rem; font-size: .82rem; color: #b8d9ff; }
    .stats-panel { left: 1rem; top: 1rem; width: min(340px, calc(100vw - 2rem)); max-height: calc(100vh - 2rem); padding: 1rem; overflow: auto; }
    .right-sidebar { position: absolute; right: 1rem; top: 1rem; display: flex; flex-direction: column; gap: .75rem; width: min(315px, calc(100vw - 2rem)); max-height: calc(100vh - 2rem - 7rem); z-index: 10; }
    .right-sidebar > .panel { position: relative; }
    .event-panel { max-height: 55vh; overflow-y: auto; padding: 1rem; }
    .toolbar { left: 50%; bottom: 1rem; width: min(920px, calc(100vw - 2rem)); padding: .85rem; transform: translateX(-50%); }
    .tool-row, .disaster-grid { display: flex; flex-wrap: wrap; gap: .5rem; }
    .toolbar-divider { margin: .6rem 0; border: none; border-top: 1px solid rgba(255,255,255,.1); }
    .toolbar-row { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .toolbar-row .spacer { margin-left: auto; }
    .toolbar-status, .metric-row, .score-label, .player-pill, .active-disaster { display: flex; justify-content: space-between; gap: .75rem; align-items: center; }
    .toolbar-status { flex-wrap: wrap; margin-top: .6rem; padding-top: .6rem; border-top: 1px solid rgba(255,255,255,.1); color: #9ba3ae; font-size: .8rem; }
    .toolbar-flash { color: #46d9a8; font-weight: 700; }
    .height-control { display: grid; grid-template-columns: auto 1fr auto; gap: .65rem; align-items: center; margin: .75rem 0; color: #d8d4c8; font-size: .84rem; }
    .building-editor { display: flex; flex-direction: column; gap: .55rem; margin-top: .6rem; }
    .dim-row { display: flex; align-items: center; gap: .75rem; }
    .dim-field { display: flex; align-items: center; gap: .4rem; }
    .dim-field label { font-size: .75rem; color: #9ba3ae; letter-spacing: .04em; text-transform: uppercase; font-weight: 600; }
    .dim-input { width: 54px; text-align: center; padding: .4rem .3rem; border: 1px solid rgba(255,255,255,.18); border-radius: 10px; color: #f4f1e8; background: rgba(255,255,255,.08); font: inherit; font-size: .9rem; -moz-appearance: textfield; transition: border-color .15s; }
    .dim-input:focus { outline: none; border-color: rgba(255,215,0,.55); background: rgba(255,255,255,.12); }
    .dim-input::-webkit-inner-spin-button, .dim-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    .desc-textarea { width: 100%; padding: .5rem .7rem; border: 1px solid rgba(255,255,255,.18); border-radius: 12px; color: #f4f1e8; background: rgba(255,255,255,.07); font: inherit; font-size: .84rem; resize: vertical; transition: border-color .15s; }
    .desc-textarea:focus { outline: none; border-color: rgba(255,215,0,.45); background: rgba(255,255,255,.1); }
    .desc-textarea::placeholder { color: rgba(255,255,255,.32); }
    .gdp-row { display: flex; align-items: center; gap: .65rem; }
    .gdp-badge { font-size: .82rem; font-weight: 700; color: #46d9a8; padding: .35rem .65rem; border-radius: 999px; background: rgba(70,217,168,.12); border: 1px solid rgba(70,217,168,.3); }
    .metric-hero { display: grid; gap: .1rem; margin-bottom: .75rem; padding: .85rem; border-radius: 16px; background: linear-gradient(135deg, rgba(255,215,0,.18), rgba(90,184,255,.1)); }
    .metric-hero span, .metric-row span, .score-label span, .active-disaster span { color: #aeb7bd; font-size: .82rem; }
    .metric-hero strong { font-size: 1.55rem; }
    .metric-row { margin: .42rem 0; font-size: .9rem; }
    .score-row { margin: .62rem 0; }
    .score-track { height: .48rem; margin-top: .28rem; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.12); }
    .score-fill { height: 100%; border-radius: inherit; }
    .score-fill.good { background: #46d9a8; }
    .score-fill.warning { background: #f4d35e; }
    .score-fill.critical { background: #ff6b6b; }
    .player-list { display: grid; gap: .55rem; }
    .player-pill { padding: .55rem; border-radius: 14px; background: rgba(255,255,255,.08); }
    .player-dot { width: .65rem; height: .65rem; border-radius: 50%; box-shadow: 0 0 18px currentColor; }
    .clear-button { width: 100%; margin: .75rem 0; border-color: rgba(255,107,107,.45); }
    .active-disaster { padding-top: .7rem; border-top: 1px solid rgba(255,255,255,.12); }
    .loading-screen, .error-screen { display: grid; place-items: center; width: 100vw; height: 100vh; padding: 2rem; color: #f4f1e8; background: #0a0a0a; text-align: center; }
    .loading-card, .error-card { width: min(520px, 100%); padding: 2rem; border: 1px solid rgba(255,255,255,.14); border-radius: 28px; background: rgba(0,0,0,.78); }
    .disaster-overlay { pointer-events: none; position: absolute; inset: 0; z-index: 6; opacity: .22; mix-blend-mode: screen; }
    .building-info-panel { display: grid; gap: .35rem; min-width: 190px; padding: .7rem; border: 1px solid rgba(255,215,0,.65); border-radius: 12px; color: #f4f1e8; background: rgba(0,0,0,.88); box-shadow: 0 18px 50px rgba(0,0,0,.4); }
    .building-info-panel strong { font-size: .92rem; line-height: 1.2; }
    .building-info-panel span { color: #d8d4c8; font-size: .78rem; }
    .building-info-panel div { display: flex; gap: .35rem; margin-top: .2rem; }
    .building-info-panel button { padding: .35rem .5rem; font-size: .75rem; }
    .density-label { white-space: nowrap; padding: .32rem .5rem; border: 1px solid rgba(255,255,255,.28); border-radius: 999px; color: #fff; background: rgba(0,0,0,.78); box-shadow: 0 10px 28px rgba(0,0,0,.38); font-size: .74rem; font-weight: 700; }
    .ai-advisor-panel { padding: 1rem; overflow-y: auto; }
    @keyframes advisorPulse { 0%,100% { box-shadow: 0 0 0 2px rgba(255,215,0,.35), 0 24px 80px rgba(0,0,0,.38); } 50% { box-shadow: 0 0 0 5px rgba(255,215,0,.65), 0 24px 80px rgba(0,0,0,.38); } }
    @media (max-width: 760px) { .right-sidebar { top: auto; bottom: 9.5rem; max-height: 45vh; } .ai-advisor-panel { display: none; } .stats-panel { max-height: 45vh; } .toolbar { bottom: .5rem; } }
  `;
}

export default function App() {
  const [showNameEntry, setShowNameEntry] = useState<boolean>(() => !localStorage.getItem(PLAYER_NAME_KEY));
  const [nameInput, setNameInput] = useState<string>('');
  const [baseGrid, setBaseGrid] = useState<VoxelGridData | null>(null);
  const [buildingLookup, setBuildingLookup] = useState<BuildingLookup | null>(null);
  const [cityShape, setCityShape] = useState<number[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolState>('select');
  const [armedDisaster, setArmedDisaster] = useState<{ type: string; intensity: number; radius: number; deathToll: number; color: string } | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);
  const [hoveredCell, setHoveredCell] = useState<GridCell | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<SelectedBuilding | null>(null);
  const [, setPendingBuildingMove] = useState<SelectedBuilding | null>(null);
  const [moveSource, setMoveSource] = useState<MoveSource | null>(null);
  const [buildingDimensions, setBuildingDimensions] = useState<BuildingDimensions>({ width: 1, depth: 1, height: 10 });
  const [densityHeatmapEnabled, setDensityHeatmapEnabled] = useState(false);
  const [undoFeedback, setUndoFeedback] = useState<string | null>(null);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [agentsVisible, setAgentsVisible] = useState(true);
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [airQuality, setAirQuality] = useState<{ aqi: number; pm25: number } | null>(null);
  const [buildingDescription, setBuildingDescription] = useState('');
  const [gdpEstimate, setGdpEstimate] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [removeFeedback, setRemoveFeedback] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const playerColorRef = useRef(persistentValue(PLAYER_COLOR_KEY, randomPlayerColor));
  const playerNameRef = useRef(persistentValue(PLAYER_NAME_KEY, () => `Planner-${Math.floor(1000 + Math.random() * 9000)}`));
  const joinedIdentityRef = useRef<string | null>(null);
  const moveSourceRef = useRef<MoveSource | null>(null);
  const pendingBuildingMoveRef = useRef<SelectedBuilding | null>(null);
  const lastCursorSendRef = useRef<number>(0);
  const prevToolRef = useRef<ToolState>(activeTool);

  const connectionState = useSpacetimeDB();
  const [cityEdits] = useTable(tables.cityEdit);
  const [players] = useTable(tables.player);
  const [cityStatsRows] = useTable(tables.cityStats);
  const [weatherRows] = useTable(tables.weatherState);
  const [economicRows] = useTable(tables.economicData);
  const [events] = useTable(tables.event);
  const [clockRows] = useTable(tables.simulationClock);
  const [agents] = useTable(tables.agent);
  const [buildingMetaRows] = useTable(tables.buildingMeta);

  const joinCity = useStdbReducer(reducers.joinCity);
  const moveCursor = useStdbReducer(reducers.moveCursor);
  const removeBuilding = useStdbReducer(reducers.removeBuilding);
  const placeBuilding = useStdbReducer(reducers.placeBuilding);
  const moveBuilding = useStdbReducer(reducers.moveBuilding);
  const undoLastEdit = useStdbReducer(reducers.undoLastEdit);
  const resetCity = useStdbReducer(reducers.resetCity);
  const triggerDisaster = useStdbReducer(reducers.triggerDisaster);
  const clearDisaster = useStdbReducer(reducers.clearDisaster);
  const updateWeather = useStdbReducer(reducers.updateWeather);
  const updateEconomicData = useStdbReducer(reducers.updateEconomicData);
  const updateCityStats = useStdbReducer(reducers.updateCityStats);
  const tickAgents = useStdbReducer(reducers.tickAgents);
  const updateAgentCount = useStdbReducer(reducers.updateAgentCount);
  const advanceClock = useStdbReducer(reducers.advanceClock);
  const setClockSpeed = useStdbReducer(reducers.setClockSpeed);
  const togglePause = useStdbReducer(reducers.togglePause);
  const tickDisasters = useStdbReducer(reducers.tickDisasters);

  const cityStats = cityStatsRows[0] ?? null;
  const weather = weatherRows[0] ?? null;
  const economicData = economicRows[0] ?? null;
  const clock = clockRows[0] ?? null;
  const currentIdentity = connectionState.identity?.toHexString() ?? null;
  const isHost = useMemo(() => {
    if (!currentIdentity || players.length === 0) return false;
    const sortedIdentities = [...players].map(p => p.identity).sort();
    return sortedIdentities[0] === currentIdentity;
  }, [players, currentIdentity]);

  const liveCity = useMemo(() => (baseGrid ? applyCityEdits(baseGrid, cityEdits).liveGrid : null), [baseGrid, cityEdits]);
  const liveBuildingLookup = useMemo(() => buildLiveBuildingLookup(buildingLookup, cityEdits), [buildingLookup, cityEdits]);
  const activeEvents = useMemo(() => [...events], [events]);
  const currentAgentsCounts = useMemo(() => {
    let car = 0;
    let pedestrian = 0;
    for (const a of agents) {
      if (a.agentType === 'car') car++;
      else if (a.agentType === 'pedestrian') pedestrian++;
    }
    return { car, pedestrian };
  }, [agents]);

  const currentAgentsRef = useRef({ car: 0, pedestrian: 0 });
  if (currentAgentsRef.current.car !== currentAgentsCounts.car || currentAgentsRef.current.pedestrian !== currentAgentsCounts.pedestrian) {
    currentAgentsRef.current = currentAgentsCounts;
  }
  const currentAgents = currentAgentsRef.current;

  const buildingMetaGDP = useMemo(
    () => buildingMetaRows.reduce((sum, row) => sum + row.gdpContributionUsd, 0),
    [buildingMetaRows]
  );

  const citySummary = useMemo(
    () => (liveCity ? summarizeCity(liveCity, economicData, weather, activeEvents, cityStats, currentAgents, airQuality, buildingMetaGDP) : null),
    [activeEvents, economicData, liveCity, weather, cityStats, currentAgents, airQuality, buildingMetaGDP]
  );

  // Weather and AQI adjusted for active events — used only for display in StatsPanel
  const displayWeather = useMemo(() => {
    if (!weather) return null;
    let tempC = weather.tempC;
    let windSpeed = weather.windSpeed;
    let precipitation = weather.precipitation;
    for (const e of activeEvents) {
      const s = e.intensity / 100;
      if (e.eventType === 'heatwave')       { tempC += 18 * s; }
      else if (e.eventType === 'fire')      { tempC += 22 * s; } // wildfire radiant heat — always pushes temp up hard
      else if (e.eventType === 'blizzard')  { tempC -= 22 * s; windSpeed += 70 * s; precipitation += 40 * s; }
      else if (e.eventType === 'hurricane') { windSpeed += 150 * s; precipitation += 100 * s; }
      else if (e.eventType === 'flood')     { precipitation += 70 * s; }
      else if (e.eventType === 'tornado')   { windSpeed += 220 * s; }
      else if (e.eventType === 'meteor_strike') { tempC += 30 * s; }
    }
    return { ...weather, tempC, windSpeed, precipitation };
  }, [weather, activeEvents]);

  const displayAQI = useMemo(() => {
    if (!airQuality) return null;
    let aqi  = airQuality.aqi;
    let pm25 = airQuality.pm25;
    for (const e of activeEvents) {
      const s = e.intensity / 100;
      if (e.eventType === 'fire')           { aqi += 200 * s; pm25 += 180 * s; } // heavy smoke
      else if (e.eventType === 'heatwave')  { aqi += 50 * s;  pm25 += 25 * s; }  // ozone spikes
      else if (e.eventType === 'meteor_strike') { aqi += 250 * s; pm25 += 220 * s; } // dust/ejecta
      else if (e.eventType === 'hurricane') { aqi = Math.max(aqi - 15 * s, 0); }  // rain scrubs air
      else if (e.eventType === 'economic_crash') { aqi -= 12 * s; pm25 -= 8 * s; } // less industry
    }
    return { aqi: Math.round(Math.max(0, Math.min(500, aqi))), pm25: Math.round(Math.max(0, Math.min(500, pm25))) };
  }, [airQuality, activeEvents]);
  const ghostPreview = useMemo(() => {
    if (activeTool === 'add_building' && hoveredCell) {
      return {
        x: hoveredCell.x,
        z: hoveredCell.z,
        width: buildingDimensions.width,
        depth: buildingDimensions.depth,
      };
    }
    return null;
  }, [activeTool, hoveredCell, buildingDimensions]);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchCity() {
      try {
        const response = await fetch('/manhattan.json', { signal: controller.signal });
        if (!response.ok) throw new Error(`City data returned ${response.status}`);
        const payload = (await response.json()) as CityPayload;
        const rawGrid = payload.voxcity_grid ?? payload.grid;
        if (!rawGrid) throw new Error('City payload did not include voxcity_grid');
        const normalized = normalizeGrid(rawGrid);
        const lookup = buildBuildingLookup(payload);
        startTransition(() => {
          setBaseGrid(normalized);
          setBuildingLookup(lookup);
          setCityShape(payload.shape);
        });
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : String(error));
      }
    }
    fetchCity();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (showNameEntry || !connectionState.isActive || !currentIdentity || joinedIdentityRef.current === currentIdentity) return;
    joinedIdentityRef.current = currentIdentity;
    joinCity({ username: playerNameRef.current, color: playerColorRef.current }).catch(error => console.error('Failed to join city:', error));
  }, [connectionState.isActive, currentIdentity, joinCity, showNameEntry]);

  useEffect(() => {
    if (!connectionState.isActive || !isHost) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current=temperature_2m,weather_code,wind_speed_10m,precipitation');
        const data = await res.json();
        updateWeather({ tempC: data.current.temperature_2m, weatherCode: data.current.weather_code, windSpeed: data.current.wind_speed_10m, precipitation: data.current.precipitation });
      } catch (err) {
        console.error('Weather fetch error', err);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [updateWeather, connectionState.isActive, isHost]);

  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(() => {
      if (currentIdentity) {
        tickAgents();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [tickAgents, currentIdentity, isHost]);

  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(() => {
      if (currentIdentity) {
        advanceClock();
        tickDisasters();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [advanceClock, tickDisasters, currentIdentity, isHost]);

  // Live economic data from FRED (NY unemployment, US GDP growth, CPI inflation)
  useEffect(() => {
    if (!connectionState.isActive || !isHost) return;
    const FRED_KEY = import.meta.env.VITE_FRED_KEY as string | undefined;
    if (!FRED_KEY) {
      updateEconomicData({ gdpGrowth: 2.2, inflation: 3.1, unemployment: 3.9 }).catch(console.warn);
      return;
    }
    const fred = (series: string, limit = 1) =>
      `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${FRED_KEY}&sort_order=desc&limit=${limit}&file_type=json`;

    const fetchEcon = async () => {
      try {
        const [uRes, gRes, cRes] = await Promise.all([
          fetch(fred('NYUR')),          // New York State unemployment rate
          fetch(fred('A191RL1Q225SBEA')), // US real GDP % change QoQ annualized
          fetch(fred('CPIAUCSL', 13)),   // CPI — 13 obs to compute YoY
        ]);
        const [uData, gData, cData] = await Promise.all([uRes.json(), gRes.json(), cRes.json()]) as [
          { observations: { value: string }[] },
          { observations: { value: string }[] },
          { observations: { value: string }[] },
        ];

        const parseVal = (obs: { value: string }[], idx = 0) => {
          const v = parseFloat(obs[idx]?.value ?? '');
          return isNaN(v) ? null : v;
        };

        const unemployment = parseVal(uData.observations) ?? 3.9;
        const gdpGrowth    = parseVal(gData.observations) ?? 2.2;
        // YoY CPI inflation: (current - 12 months ago) / 12 months ago * 100
        const cpiNow  = parseVal(cData.observations, 0);
        const cpiYear = parseVal(cData.observations, Math.min(12, cData.observations.length - 1));
        const inflation = (cpiNow && cpiYear && cpiYear > 0)
          ? ((cpiNow - cpiYear) / cpiYear) * 100
          : 3.1;

        updateEconomicData({ gdpGrowth, inflation, unemployment }).catch(console.warn);
      } catch (err) {
        console.warn('FRED fetch failed:', err);
        updateEconomicData({ gdpGrowth: 2.2, inflation: 3.1, unemployment: 3.9 }).catch(console.warn);
      }
    };

    void fetchEcon();
    const interval = setInterval(() => void fetchEcon(), 12 * 60 * 60 * 1000); // refresh every 12h
    return () => clearInterval(interval);
  }, [connectionState.isActive, isHost, updateEconomicData]);

  // Live air quality from Open-Meteo (no API key required)
  useEffect(() => {
    if (!connectionState.isActive || !isHost) return;
    const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=40.73&longitude=-73.99&hourly=us_aqi,us_aqi_pm2_5&timezone=America%2FNew_York&forecast_days=1';

    const fetchAQ = async () => {
      try {
        const res = await fetch(AQ_URL);
        const data = await res.json() as { hourly: { time: string[]; us_aqi: (number | null)[]; us_aqi_pm2_5: (number | null)[] } };
        // Match current local hour to hourly array index
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const nyNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const hourStr = `${nyNow.getFullYear()}-${pad(nyNow.getMonth() + 1)}-${pad(nyNow.getDate())}T${pad(nyNow.getHours())}:00`;
        let idx = data.hourly.time.indexOf(hourStr);
        if (idx === -1) idx = 0;
        const aqi  = data.hourly.us_aqi[idx]      ?? data.hourly.us_aqi.find(v => v !== null)  ?? 40;
        const pm25 = data.hourly.us_aqi_pm2_5[idx] ?? data.hourly.us_aqi_pm2_5.find(v => v !== null) ?? 20;
        setAirQuality({ aqi: aqi as number, pm25: pm25 as number });
      } catch (err) {
        console.warn('Air quality fetch failed:', err);
      }
    };

    void fetchAQ();
    const interval = setInterval(() => void fetchAQ(), 30 * 60 * 1000); // refresh every 30 min
    return () => clearInterval(interval);
  }, [connectionState.isActive, isHost]);

  const hasSpawnedAgents = useRef(false);
  useEffect(() => {
    if (!connectionState.isActive || !isHost || hasSpawnedAgents.current) return;
    hasSpawnedAgents.current = true;
    // Despawn all first to clear any stale positions, then respawn fresh
    updateAgentCount({ agentType: 'car', newCount: 0 })
      .then(() => updateAgentCount({ agentType: 'car', newCount: 200 }))
      .catch(console.warn);
    updateAgentCount({ agentType: 'pedestrian', newCount: 0 }).catch(console.warn);
  }, [connectionState.isActive, isHost, updateAgentCount]);

  const lastEconomyRef = useRef<number | null>(null);
  const lastDisasterRef = useRef<string>('');
  const recoveryIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!cityStats || !connectionState.isActive || !isHost) return;

    const currentEconomy = cityStats.economyScore;
    const wasDisaster = lastDisasterRef.current !== '';
    const isDisaster = activeEvents.length > 0;
    const justCleared = wasDisaster && !isDisaster;

    lastDisasterRef.current = isDisaster ? 'active' : '';

    const popRatio = cityStats.population / BASE_POPULATION;
    const targetCars = Math.floor(20 + currentEconomy * 1.5 + popRatio * 50);

    if (justCleared) {
      if (recoveryIntervalRef.current) clearInterval(recoveryIntervalRef.current);
      
      let step = 1;
      const startCars = lastEconomyRef.current ? Math.floor(20 + lastEconomyRef.current * 1.5 + popRatio * 50) : 50;
      
      lastEconomyRef.current = currentEconomy;

      recoveryIntervalRef.current = window.setInterval(() => {
        if (step > 6) {
          if (recoveryIntervalRef.current) {
            clearInterval(recoveryIntervalRef.current);
            recoveryIntervalRef.current = null;
          }
          return;
        }
        
        const curTargetCars = startCars + Math.floor(((targetCars - startCars) * step) / 6);
        updateAgentCount({ agentType: 'car', newCount: curTargetCars }).catch(console.warn);
        updateAgentCount({ agentType: 'pedestrian', newCount: 0 }).catch(console.warn);
        
        step++;
      }, 5000);
      return;
    }

    if (isDisaster || !recoveryIntervalRef.current) {
      if (lastEconomyRef.current === null || Math.abs(currentEconomy - lastEconomyRef.current) > 5) {
        lastEconomyRef.current = currentEconomy;
        updateAgentCount({ agentType: 'car', newCount: targetCars }).catch(console.warn);
        updateAgentCount({ agentType: 'pedestrian', newCount: 0 }).catch(console.warn);
      }
    }
  }, [cityStats, connectionState.isActive, updateAgentCount, isHost, activeEvents.length]);

  const lastCitySummaryRef = useRef<string>('');

  useEffect(() => {
    if (!citySummary || !connectionState.isActive || !isHost) return;
    const summaryStr = JSON.stringify(citySummary);
    if (summaryStr !== lastCitySummaryRef.current) {
      lastCitySummaryRef.current = summaryStr;
      updateCityStats(citySummary).catch(error => console.warn('City stats update failed:', error));
    }
  }, [citySummary, connectionState.isActive, updateCityStats, isHost]);

  const updateMoveSource = useCallback((source: MoveSource | null) => {
    moveSourceRef.current = source;
    setMoveSource(source);
  }, []);

  const updatePendingBuildingMove = useCallback((building: SelectedBuilding | null) => {
    pendingBuildingMoveRef.current = building;
    setPendingBuildingMove(building);
  }, []);

  const hydrateSelectedBuilding = useCallback((building: BuildingFootprint, anchor: GridCell): SelectedBuilding => {
    const heightLevels = Math.max(...building.cells.map(cell => getBuildingColumnHeight(liveCity, cell.x, cell.z)), 1);
    return {
      ...building,
      anchor: { x: anchor.x, z: anchor.z },
      center: getBuildingCenter(building.cells),
      heightLevels,
    };
  }, [liveCity]);

  const handleNameSubmit = useCallback(() => {
    const name = nameInput.trim();
    if (!name) return;
    localStorage.setItem(PLAYER_NAME_KEY, name);
    playerNameRef.current = name;
    setShowNameEntry(false);
  }, [nameInput]);

  const clearSelection = useCallback(() => {
    setSelectedCell(null);
    setSelectedBuilding(null);
    updateMoveSource(null);
    updatePendingBuildingMove(null);
  }, [updateMoveSource, updatePendingBuildingMove]);

  const handleUndo = useCallback(() => {
    undoLastEdit()
      .then(() => {
        setUndoFeedback('Undo applied');
        window.setTimeout(() => setUndoFeedback(null), 1500);
      })
      .catch(error => {
        console.warn('Undo failed:', error);
        setUndoFeedback('Undo failed');
        window.setTimeout(() => setUndoFeedback(null), 1800);
      });
  }, [undoLastEdit]);

  const handleFullReset = useCallback(() => {
    setIsResetting(true);
    resetCity()
      .then(() => {
        setSelectedCell(null);
        setSelectedBuilding(null);
        updateMoveSource(null);
        updatePendingBuildingMove(null);
        setResetFeedback('City reset');
        window.setTimeout(() => setResetFeedback(null), 1800);
      })
      .catch(error => {
        console.warn('Full reset failed:', error);
        setResetFeedback('Reset failed');
        window.setTimeout(() => setResetFeedback(null), 3200);
      })
      .finally(() => setIsResetting(false));
  }, [resetCity, updateMoveSource, updatePendingBuildingMove]);

  useEffect(() => {
    if (activeTool !== 'move') {
      updateMoveSource(null);
      updatePendingBuildingMove(null);
    }
  }, [activeTool, updateMoveSource, updatePendingBuildingMove]);

  const onlinePlayers = useMemo(() => players.filter(player => player.isOnline), [players]);

  const removeWholeBuilding = useCallback((building: SelectedBuilding) => {
    // Check if this building has stored GDP meta
    const meta = buildingMetaRows.find(m => m.buildingId === building.id);

    const edits = building.cells.map((cell, idx) => {
      const height = getBuildingColumnHeight(liveCity, cell.x, cell.z);
      return removeBuilding({
        editId: uuidv4(),
        fromX: cell.x,
        fromZ: cell.z,
        fromHeight: height,
        label: `Removed ${building.name} cell at ${cell.x}, ${cell.z}`,
        buildingMetaId: idx === 0 ? (meta?.buildingId ?? '') : '',
      });
    });

    if (meta) {
      const fmtGDP = meta.gdpContributionUsd >= 1e9
        ? `$${(meta.gdpContributionUsd / 1e9).toFixed(2)}B`
        : meta.gdpContributionUsd >= 1e6
        ? `$${(meta.gdpContributionUsd / 1e6).toFixed(1)}M`
        : `$${meta.gdpContributionUsd.toLocaleString()}`;
      setRemoveFeedback(`Removed ${building.name} — GDP −${fmtGDP}/yr`);
      window.setTimeout(() => setRemoveFeedback(null), 4000);
    } else {
      // For un-tracked buildings, estimate GDP from name via Gemini (fire-and-forget)
      const key = import.meta.env.VITE_GEMINI_KEY ?? '';
      const prompt = `You are an urban economist. A building named "${building.name}" is being demolished from a city.
Estimate its annual GDP contribution (economic output) in USD.
Reply with ONLY a JSON object like: {"gdp": 5000000000, "reasoning": "brief 1-sentence reason"}
No markdown, no extra text.`;
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      })
        .then(r => r.json())
        .then(data => {
          const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
          const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
          if (typeof parsed.gdp === 'number') {
            const fmtGDP = parsed.gdp >= 1e9 ? `$${(parsed.gdp / 1e9).toFixed(2)}B` : parsed.gdp >= 1e6 ? `$${(parsed.gdp / 1e6).toFixed(1)}M` : `$${parsed.gdp.toLocaleString()}`;
            setRemoveFeedback(`Removed ${building.name} — Est. GDP impact: −${fmtGDP}/yr`);
            window.setTimeout(() => setRemoveFeedback(null), 5000);
          }
        })
        .catch(() => {});
    }

    Promise.all(edits)
      .catch(error => console.warn('Building remove failed:', error))
      .finally(clearSelection);
  }, [buildingMetaRows, clearSelection, liveCity, removeBuilding]);

  const moveWholeBuilding = useCallback((building: SelectedBuilding, target: GridCell) => {
    const dx = target.x - building.anchor.x;
    const dz = target.z - building.anchor.z;
    const edits = building.cells.map(cell => {
      const height = getBuildingColumnHeight(liveCity, cell.x, cell.z);
      return moveBuilding({
        editId: uuidv4(),
        fromX: cell.x,
        fromZ: cell.z,
        fromHeight: height,
        toX: cell.x + dx,
        toZ: cell.z + dz,
        height,
        label: `Moved ${building.name} footprint cell from ${cell.x}, ${cell.z}`,
        color: playerColorRef.current,
      });
    });
    Promise.all(edits)
      .catch(error => console.warn('Building move failed:', error))
      .finally(clearSelection);
  }, [clearSelection, liveCity, moveBuilding]);

  const handleGetGdpEstimate = useCallback(async () => {
    if (!buildingDescription.trim()) return;
    setIsEstimating(true);
    const key = import.meta.env.VITE_GEMINI_KEY ?? '';
    const prompt = `You are an urban economist. A building is being placed in a city simulation.
Building description: "${buildingDescription}"
Dimensions: ${buildingDimensions.width}×${buildingDimensions.depth} footprint, ${buildingDimensions.height} floors.
Estimate the annual GDP contribution (economic output) of this building/business in USD.
Reply with ONLY a JSON object like: {"gdp": 125000000, "reasoning": "brief 1-sentence reason"}
No markdown, no extra text.`;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      if (typeof parsed.gdp === 'number') setGdpEstimate(parsed.gdp);
    } catch (err) {
      console.warn('Gemini GDP estimate failed:', err);
    } finally {
      setIsEstimating(false);
    }
  }, [buildingDescription, buildingDimensions]);

  const handleMoveSelected = useCallback(() => {
    if (!selectedBuilding) return;
    updatePendingBuildingMove(selectedBuilding);
    updateMoveSource({ x: selectedBuilding.center.x, z: selectedBuilding.center.z, height: selectedBuilding.heightLevels });
    setActiveTool('move');
  }, [selectedBuilding, updateMoveSource, updatePendingBuildingMove]);

  const handleCellClick = (cell: GridCell) => {
    const currentBuildingMove = pendingBuildingMoveRef.current;
    if (currentBuildingMove && activeTool === 'move') {
      moveWholeBuilding(currentBuildingMove, { x: cell.x, z: cell.z });
      return;
    }
    
    if (activeTool === 'trigger_disaster' && armedDisaster) {
      handleTriggerDisaster(armedDisaster.type, armedDisaster.intensity, armedDisaster.radius, armedDisaster.deathToll, cell);
      setArmedDisaster(null);
      setActiveTool('select');
      return;
    }

    if (activeTool === 'add_building') {
      const groupId = uuidv4();
      const desc = buildingDescription.trim();
      const gdp = gdpEstimate ?? 0;
      const edits = [];
      for (let w = 0; w < buildingDimensions.width; w++) {
        for (let d = 0; d < buildingDimensions.depth; d++) {
          edits.push(placeBuilding({
            editId: uuidv4(),
            toX: cell.x + w,
            toZ: cell.z + d,
            voxelType: 1,
            height: buildingDimensions.height,
            label: desc || `Added building at ${cell.x + w}, ${cell.z + d}`,
            color: playerColorRef.current,
            buildingId: groupId,
            description: desc,
            gdpContributionUsd: gdp,
          }));
        }
      }
      Promise.all(edits).catch(error => console.warn('Building add failed:', error));
      return;
    }
    
    if (activeTool === 'add_park') {
      placeBuilding({ editId: uuidv4(), toX: cell.x, toZ: cell.z, voxelType: 2, height: 3, label: `Added park at ${cell.x}, ${cell.z}`, color: playerColorRef.current, buildingId: '', description: '', gdpContributionUsd: 0 });
      return;
    }

    if (cell.voxelType !== 1) return;

    const building = getBuildingAt(liveBuildingLookup, cell);
    if (!building) return;
    const hydratedBuilding = hydrateSelectedBuilding(building, cell);

    setSelectedCell({ x: cell.x, z: cell.z, voxelType: cell.voxelType });
    setSelectedBuilding(hydratedBuilding);
    moveCursor({ x: cell.x, z: cell.z, isPlacingDisaster: false, disasterPreviewX: 0, disasterPreviewZ: 0, disasterPreviewRadius: 0 }).catch(error => console.warn('Cursor update failed:', error));

    if (activeTool === 'remove') {
      removeWholeBuilding(hydratedBuilding);
    } else if (activeTool === 'move') {
      updatePendingBuildingMove(hydratedBuilding);
      updateMoveSource({ x: hydratedBuilding.center.x, z: hydratedBuilding.center.z, height: hydratedBuilding.heightLevels });
    }
  };

  const handleCellHover = useCallback((cell: GridCell | null) => {
    setHoveredCell(cell);
    if (!cell || activeTool !== 'trigger_disaster' || !armedDisaster) return;
    const now = Date.now();
    if (now - lastCursorSendRef.current < 150) return;
    lastCursorSendRef.current = now;
    moveCursor({
      x: cell.x,
      z: cell.z,
      isPlacingDisaster: true,
      disasterPreviewX: cell.x,
      disasterPreviewZ: cell.z,
      disasterPreviewRadius: armedDisaster.radius,
    }).catch(error => console.warn('Cursor update failed:', error));
  }, [activeTool, armedDisaster, moveCursor]);

  useEffect(() => {
    if (prevToolRef.current === 'trigger_disaster' && activeTool !== 'trigger_disaster') {
      moveCursor({ x: 0, z: 0, isPlacingDisaster: false, disasterPreviewX: 0, disasterPreviewZ: 0, disasterPreviewRadius: 0 }).catch(console.warn);
    }
    prevToolRef.current = activeTool;
  }, [activeTool, moveCursor]);

  const removeFireDamagedColumns = useCallback(async (event: DisasterEvent) => {
    if (!liveCity) return;
    const affectedColumns = getAffectedBuildingColumns(liveCity, event);
    if (affectedColumns.length === 0) return;
    const targetVoxelDamage = Math.max(1, Math.round(affectedColumns.reduce((sum, column) => sum + column.height, 0) * 0.1));
    const shuffled = [...affectedColumns].sort(() => Math.random() - 0.5);
    const damagedColumns: Array<GridCell & { height: number }> = [];
    let damagedVoxels = 0;

    for (const column of shuffled) {
      damagedColumns.push(column);
      damagedVoxels += column.height;
      if (damagedVoxels >= targetVoxelDamage) break;
    }

    await Promise.all(
      damagedColumns.map(column =>
        removeBuilding({
          editId: uuidv4(),
          fromX: column.x,
          fromZ: column.z,
          fromHeight: column.height,
          label: `Fire damaged building column at ${column.x}, ${column.z}`,
          buildingMetaId: '',
        })
      )
    );
  }, [liveCity, removeBuilding]);

  const handleTriggerDisaster = async (eventType: string, intensity: number, radius: number, deathToll: number, affectedCell: GridCell) => {
    const boundedIntensity = Math.max(0, Math.min(100, Math.round(intensity)));
    const event = { eventType, intensity: boundedIntensity, affectedX: affectedCell.x, affectedZ: affectedCell.z, radius, deathToll };
    await triggerDisaster({ eventId: uuidv4(), ...event, duration: 60 });
    if (eventType === 'fire') {
      await removeFireDamagedColumns(event);
    }
  };

  const disasterOverlay = useMemo(() => {
    if (activeEvents.length === 0) return null;
    const latestEvent = activeEvents[activeEvents.length - 1];
    const colors: Record<string, string> = {
      earthquake: 'rgba(170,170,170,1)',
      hurricane: 'rgba(82,159,255,1)',
      flood: 'rgba(21,101,192,1)',
      fire: 'rgba(255,94,46,1)',
      heatwave: 'rgba(255,170,58,1)',
      economic_crash: 'rgba(255,80,80,1)',
    };
    return colors[latestEvent.eventType] ?? 'rgba(255,255,255,1)';
  }, [activeEvents]);

  if (loadError) {
    return (
      <div className="error-screen">
        <style>{styles()}</style>
        <div className="error-card"><h1>City data did not load</h1><p>{loadError}</p></div>
      </div>
    );
  }

  if (!baseGrid) {
    return (
      <div className="loading-screen">
        <style>{styles()}</style>
        <div className="loading-card"><h1>Loading Lower Manhattan</h1><p>Fetching voxel city data.</p></div>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <style>{styles()}</style>
      {showNameEntry && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            width: 'min(420px, calc(100vw - 2rem))', padding: '2rem',
            border: '1px solid rgba(255,255,255,0.14)', borderRadius: 28,
            background: 'rgba(0,0,0,0.88)', display: 'grid', gap: '1.2rem',
          }}>
            <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#f4f1e8' }}>Enter Your Name</h1>
            <p style={{ margin: 0, color: '#aeb7bd', fontSize: '0.9rem' }}>
              Choose a display name. Other players will see it above your cursor.
            </p>
            <input
              type="text"
              placeholder="e.g. Alice"
              value={nameInput}
              maxLength={24}
              autoFocus
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNameSubmit(); }}
              style={{
                padding: '0.65rem 1rem', borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)', color: '#f4f1e8',
                fontSize: '1rem', outline: 'none',
              }}
            />
            <button
              type="button"
              disabled={!nameInput.trim()}
              onClick={handleNameSubmit}
              style={{
                padding: '0.65rem', borderRadius: 999, fontSize: '1rem',
                ...(nameInput.trim() ? { background: '#ffd700', color: '#0a0a0a', borderColor: '#ffd700' } : {}),
              }}
            >
              Enter City
            </button>
          </div>
        </div>
      )}
      <CityScene
        baseGrid={baseGrid}
        edits={cityEdits}
        players={onlinePlayers}
        selectedBuilding={selectedBuilding}
        moveSource={moveSource}
        densityHeatmapEnabled={densityHeatmapEnabled}
        onCellClick={handleCellClick}
        currentIdentity={currentIdentity}
        onCellHover={handleCellHover}
        onMoveSelected={handleMoveSelected}
        onRemoveSelected={() => selectedBuilding && removeWholeBuilding(selectedBuilding)}
        onCancelSelection={clearSelection}
        onFpsUpdate={setFps}
        ghostPreview={ghostPreview}
        armedDisaster={activeTool === 'trigger_disaster' ? armedDisaster : null}
        hoveredCell={hoveredCell}
        agentsVisible={agentsVisible}
        clock={clock}
      />
      {disasterOverlay && <div className="disaster-overlay" style={{ background: disasterOverlay }} />}
      {removeFeedback && (
        <div style={{ position: 'absolute', bottom: '7rem', left: '50%', transform: 'translateX(-50%)', zIndex: 20, padding: '.6rem 1.1rem', borderRadius: 14, border: '1px solid rgba(255,107,107,.5)', color: '#ff9a9a', background: 'rgba(0,0,0,.88)', fontSize: '.88rem', fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {removeFeedback}
        </div>
      )}
      <StatsPanel cityStats={cityStats} citySummary={citySummary} weather={displayWeather} economicData={economicData} players={players} fps={fps} cityShape={cityShape} clock={clock} airQuality={displayAQI} />
      <NewsTicker
        cityStats={cityStats}
        players={players}
        currentIdentity={currentIdentity}
        liveCity={liveCity}
      />
      <ActivityFeed players={players} />
      <div className="right-sidebar">
        <EventPanel
          activeEvents={activeEvents}
          onArmDisaster={(disaster) => {
            setArmedDisaster(disaster);
            setActiveTool('trigger_disaster');
          }}
          onClearDisaster={() => clearDisaster()}
          armedDisasterType={armedDisaster?.type ?? null}
        />
        {showAdvisor && (
          <AIAdvisor
            cityStats={cityStats}
            citySummary={citySummary}
            weather={weather}
            economicData={economicData}
            players={players}
            cityEdits={cityEdits}
          />
        )}
      </div>
      <Toolbar activeTool={activeTool as Tool} selectedCell={selectedCell} moveSource={moveSource} selectedBuildingName={selectedBuilding?.name ?? null} buildingDimensions={buildingDimensions} undoFeedback={undoFeedback} resetFeedback={resetFeedback} isResetting={isResetting} densityHeatmapEnabled={densityHeatmapEnabled} onDensityHeatmapToggle={() => setDensityHeatmapEnabled(enabled => !enabled)} onToolChange={(t) => { setActiveTool(t as ToolState); if (t !== 'add_building') { setBuildingDescription(''); setGdpEstimate(null); } }} onDimensionsChange={setBuildingDimensions} onUndo={handleUndo} onFullReset={handleFullReset} agentsVisible={agentsVisible} onAgentsToggle={() => setAgentsVisible(v => !v)} clock={clock} onSetSpeed={(speed) => setClockSpeed({ multiplier: speed })} onTogglePause={() => togglePause()} showAdvisor={showAdvisor} onAdvisorToggle={() => setShowAdvisor(v => !v)} buildingDescription={buildingDescription} onDescriptionChange={desc => { setBuildingDescription(desc); setGdpEstimate(null); }} gdpEstimate={gdpEstimate} onGetGdpEstimate={handleGetGdpEstimate} isEstimating={isEstimating} />
    </main>
  );
}
