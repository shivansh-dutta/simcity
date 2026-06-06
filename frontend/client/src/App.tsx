import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducer as useStdbReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { v4 as uuidv4 } from 'uuid';
import CityScene from './components/CityScene';
import EventPanel from './components/EventPanel';
import StatsPanel from './components/StatsPanel';
import Toolbar, { type MoveSource, type Tool } from './components/Toolbar';
import TradePanel from './components/TradePanel';
import { applyCityEdits, type GridCell, type VoxelGridData } from './components/VoxelGrid';
import { reducers, tables } from './module_bindings';
import type { EconomicData } from './module_bindings/types';

type CityPayload = {
  shape: number[];
  voxcity_grid?: number[][][];
  grid?: number[][][];
};

type CitySummary = {
  population: number;
  happiness: number;
  economyScore: number;
  healthScore: number;
  trafficScore: number;
  greenScore: number;
};

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const PLAYER_COLOR_KEY = 'urban-whatif-player-color';
const PLAYER_NAME_KEY = 'urban-whatif-player-name';

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

function getColumnHeight(grid: VoxelGridData | null, x: number, z: number): number {
  const column = grid?.[x]?.[z];
  if (!column) return 1;
  let height = 0;
  for (let level = 0; level < column.length; level += 1) {
    if (column[level] !== 0) height = level + 1;
  }
  return Math.max(1, height);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function summarizeCity(grid: VoxelGridData, economicData: EconomicData | null, disasterIntensity: number): CitySummary {
  let nonAir = 0;
  let green = 0;
  let buildingColumns = 0;
  let tallBuildings = 0;
  let skyscraperColumns = 0;

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      let buildingHeight = 0;
      for (const voxelType of grid[row][col]) {
        if (voxelType === 0) continue;
        nonAir += 1;
        if (voxelType === 2) green += 1;
        if (voxelType === 1) buildingHeight += 1;
      }
      if (buildingHeight > 0) {
        buildingColumns += 1;
        if (buildingHeight > 10) tallBuildings += 1;
        if (buildingHeight > 15) skyscraperColumns += 1;
      }
    }
  }

  const gdpGrowth = economicData?.gdpGrowth ?? 2.2;
  const inflation = economicData?.inflation ?? 3.1;
  const greenScore = nonAir > 0 ? (green / nonAir) * 100 : 0;
  const trafficScore = buildingColumns > 0 ? 100 - (skyscraperColumns / buildingColumns) * 50 : 100;
  const healthScore = greenScore * 0.4 + (100 - disasterIntensity) * 0.6;
  const economyScore = (buildingColumns > 0 ? (tallBuildings / buildingColumns) * 60 : 0) + gdpGrowth * 4 - inflation * 2;
  const happiness = healthScore * 0.3 + trafficScore * 0.3 + greenScore * 0.2 + economyScore * 0.2 - disasterIntensity * 0.5;
  const population = 850000 + (happiness - 50) * 5000 + economyScore * 3000 - disasterIntensity * 20000;

  return {
    population: Math.max(0, Math.round(population)),
    happiness: clampScore(happiness),
    economyScore: clampScore(economyScore),
    healthScore: clampScore(healthScore),
    trafficScore: clampScore(trafficScore),
    greenScore: clampScore(greenScore),
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
    .event-panel { right: 1rem; top: 1rem; width: min(315px, calc(100vw - 2rem)); padding: 1rem; }
    .trade-panel { left: 1rem; bottom: 5.9rem; width: min(340px, calc(100vw - 2rem)); padding: .65rem; }
    .toolbar { left: 50%; bottom: 1rem; width: min(920px, calc(100vw - 2rem)); padding: .85rem; transform: translateX(-50%); }
    .tool-row, .disaster-grid { display: flex; flex-wrap: wrap; gap: .5rem; }
    .toolbar-status, .metric-row, .score-label, .player-pill, .active-disaster { display: flex; justify-content: space-between; gap: .75rem; align-items: center; }
    .toolbar-status { flex-wrap: wrap; margin-top: .65rem; color: #d8d4c8; font-size: .86rem; }
    .toolbar-flash { color: #46d9a8; font-weight: 700; }
    .height-control { display: grid; grid-template-columns: auto 1fr auto; gap: .65rem; align-items: center; margin: .75rem 0; color: #d8d4c8; font-size: .84rem; }
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
    @media (max-width: 760px) { .event-panel { top: auto; right: 1rem; bottom: 9.5rem; } .stats-panel { max-height: 45vh; } .toolbar { bottom: .5rem; } }
  `;
}

export default function App() {
  const [baseGrid, setBaseGrid] = useState<VoxelGridData | null>(null);
  const [cityShape, setCityShape] = useState<number[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);
  const [moveSource, setMoveSource] = useState<MoveSource | null>(null);
  const [buildingHeight, setBuildingHeight] = useState(18);
  const [undoFeedback, setUndoFeedback] = useState<string | null>(null);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [fps, setFps] = useState(0);
  const playerColorRef = useRef(persistentValue(PLAYER_COLOR_KEY, randomPlayerColor));
  const playerNameRef = useRef(persistentValue(PLAYER_NAME_KEY, () => `Planner-${Math.floor(1000 + Math.random() * 9000)}`));
  const joinedIdentityRef = useRef<string | null>(null);
  const moveSourceRef = useRef<MoveSource | null>(null);

  const connectionState = useSpacetimeDB();
  const [cityEdits] = useTable(tables.cityEdit);
  const [players] = useTable(tables.player);
  const [cityStatsRows] = useTable(tables.cityStats);
  const [weatherRows] = useTable(tables.weatherState);
  const [economicRows] = useTable(tables.economicData);
  const [events] = useTable(tables.event);
  const [tradeOffers] = useTable(tables.tradeOffer);

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

  const cityStats = cityStatsRows[0] ?? null;
  const weather = weatherRows[0] ?? null;
  const economicData = economicRows[0] ?? null;
  const currentIdentity = connectionState.identity?.toHexString() ?? null;
  const liveCity = useMemo(() => (baseGrid ? applyCityEdits(baseGrid, cityEdits).liveGrid : null), [baseGrid, cityEdits]);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchCity() {
      try {
        const response = await fetch(`${API_URL}/city`, { signal: controller.signal });
        if (!response.ok) throw new Error(`FastAPI returned ${response.status}`);
        const payload = (await response.json()) as CityPayload;
        const rawGrid = payload.voxcity_grid ?? payload.grid;
        if (!rawGrid) throw new Error('City payload did not include voxcity_grid');
        const normalized = normalizeGrid(rawGrid);
        startTransition(() => {
          setBaseGrid(normalized);
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
    if (!connectionState.isActive || !currentIdentity || joinedIdentityRef.current === currentIdentity) return;
    joinedIdentityRef.current = currentIdentity;
    joinCity({ username: playerNameRef.current, color: playerColorRef.current }).catch(error => console.error('Failed to join city:', error));
  }, [connectionState.isActive, currentIdentity, joinCity]);

  useEffect(() => {
    if (!connectionState.isActive) return;
    updateWeather({ tempC: 22, weatherCode: 1, windSpeed: 10, precipitation: 0 }).catch(error => console.warn('Weather update failed:', error));
    updateEconomicData({ gdpGrowth: 2.2, inflation: 3.1, unemployment: 3.9 }).catch(error => console.warn('Economic update failed:', error));
  }, [connectionState.isActive, updateEconomicData, updateWeather]);

  useEffect(() => {
    if (!liveCity || !connectionState.isActive) return;
    const summary = summarizeCity(liveCity, economicData, cityStats?.disasterIntensity ?? 0);
    updateCityStats(summary).catch(error => console.warn('City stats update failed:', error));
  }, [cityStats?.disasterIntensity, connectionState.isActive, economicData, liveCity, updateCityStats]);

  const updateMoveSource = useCallback((source: MoveSource | null) => {
    moveSourceRef.current = source;
    setMoveSource(source);
  }, []);

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
        updateMoveSource(null);
        setResetFeedback('City reset');
        window.setTimeout(() => setResetFeedback(null), 1800);
      })
      .catch(error => {
        console.warn('Full reset failed:', error);
        setResetFeedback('Reset failed');
        window.setTimeout(() => setResetFeedback(null), 3200);
      })
      .finally(() => setIsResetting(false));
  }, [resetCity, updateMoveSource]);

  useEffect(() => {
    if (activeTool !== 'move') updateMoveSource(null);
  }, [activeTool, updateMoveSource]);

  const onlinePlayers = useMemo(() => players.filter(player => player.isOnline), [players]);

  const handleCellClick = (cell: GridCell) => {
    setSelectedCell(cell);
    moveCursor({ x: cell.x, z: cell.z }).catch(error => console.warn('Cursor update failed:', error));

    if (activeTool === 'remove') {
      const height = getColumnHeight(liveCity, cell.x, cell.z);
      removeBuilding({ editId: uuidv4(), fromX: cell.x, fromZ: cell.z, fromHeight: height, label: `Removed ${height}-level building at ${cell.x}, ${cell.z}` });
    } else if (activeTool === 'add_building') {
      placeBuilding({ editId: uuidv4(), toX: cell.x, toZ: cell.z, voxelType: 1, height: buildingHeight, label: `Added building at ${cell.x}, ${cell.z}`, color: playerColorRef.current });
    } else if (activeTool === 'add_park') {
      placeBuilding({ editId: uuidv4(), toX: cell.x, toZ: cell.z, voxelType: 2, height: 3, label: `Added park at ${cell.x}, ${cell.z}`, color: playerColorRef.current });
    } else if (activeTool === 'move') {
      const currentMoveSource = moveSourceRef.current;
      if (!currentMoveSource) {
        updateMoveSource({ ...cell, height: getColumnHeight(liveCity, cell.x, cell.z) });
      } else {
        moveBuilding({
          editId: uuidv4(),
          fromX: currentMoveSource.x,
          fromZ: currentMoveSource.z,
          fromHeight: currentMoveSource.height,
          toX: cell.x,
          toZ: cell.z,
          height: currentMoveSource.height,
          label: `Moved ${currentMoveSource.height}-level building from ${currentMoveSource.x}, ${currentMoveSource.z} to ${cell.x}, ${cell.z}`,
          color: playerColorRef.current,
        }).finally(() => {
          updateMoveSource(null);
          setSelectedCell(null);
        });
      }
    }
  };

  const handleTriggerDisaster = async (eventType: string, intensity: number, affectedCell: GridCell) => {
    const boundedIntensity = Math.max(0, Math.min(100, Math.round(intensity)));
    await triggerDisaster({ eventId: uuidv4(), eventType, intensity: boundedIntensity, affectedX: affectedCell.x, affectedZ: affectedCell.z, radius: 18, duration: 60 });
    if (!liveCity) return;
    await updateCityStats(summarizeCity(liveCity, economicData, boundedIntensity));
  };

  const disasterOverlay = useMemo(() => {
    const active = cityStats?.disasterActive;
    if (!active) return null;
    const colors: Record<string, string> = {
      earthquake: 'rgba(170,170,170,1)',
      hurricane: 'rgba(82,159,255,1)',
      flood: 'rgba(21,101,192,1)',
      fire: 'rgba(255,94,46,1)',
      heatwave: 'rgba(255,170,58,1)',
      economic_crash: 'rgba(255,80,80,1)',
    };
    return colors[active] ?? 'rgba(255,255,255,1)';
  }, [cityStats?.disasterActive]);

  if (loadError) {
    return (
      <div className="error-screen">
        <style>{styles()}</style>
        <div className="error-card"><h1>City data did not load</h1><p>{loadError}</p><p>Make sure FastAPI is running at {API_URL}.</p></div>
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
      <CityScene baseGrid={baseGrid} edits={cityEdits} players={onlinePlayers} selectedCell={selectedCell} moveSource={moveSource} onCellClick={handleCellClick} onFpsUpdate={setFps} />
      {disasterOverlay && <div className="disaster-overlay" style={{ background: disasterOverlay }} />}
      <StatsPanel cityStats={cityStats} weather={weather} economicData={economicData} players={players} fps={fps} cityShape={cityShape} />
      <TradePanel players={players} tradeOffers={tradeOffers} currentIdentity={currentIdentity} />
      <EventPanel cityStats={cityStats} events={events} selectedCell={selectedCell} onTriggerDisaster={handleTriggerDisaster} onClearDisaster={() => clearDisaster()} />
      <Toolbar activeTool={activeTool} selectedCell={selectedCell} moveSource={moveSource} buildingHeight={buildingHeight} undoFeedback={undoFeedback} resetFeedback={resetFeedback} isResetting={isResetting} onToolChange={setActiveTool} onHeightChange={setBuildingHeight} onUndo={handleUndo} onFullReset={handleFullReset} />
    </main>
  );
}
