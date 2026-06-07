import type { GridCell } from './VoxelGrid';
import type { SimulationClock } from '../module_bindings/types';

export type Tool = 'select' | 'move' | 'remove' | 'add_building' | 'add_park';
export type MoveSource = GridCell & { height: number };
export type BuildingDimensions = { width: number; depth: number; height: number };

type ToolbarProps = {
  activeTool: Tool;
  selectedCell: GridCell | null;
  moveSource: MoveSource | null;
  selectedBuildingName: string | null;
  buildingDimensions: BuildingDimensions;
  undoFeedback: string | null;
  resetFeedback: string | null;
  isResetting: boolean;
  densityHeatmapEnabled: boolean;
  onDensityHeatmapToggle: () => void;
  onToolChange: (tool: Tool) => void;
  onDimensionsChange: (dimensions: BuildingDimensions) => void;
  onUndo: () => void;
  onFullReset: () => void;
  agentsVisible: boolean;
  onAgentsToggle: () => void;
  clock: SimulationClock | null;
  onSetSpeed: (speed: number) => void;
  onTogglePause: () => void;
  showAdvisor: boolean;
  onAdvisorToggle: () => void;
};

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'move', label: 'Move' },
  { id: 'remove', label: 'Remove' },
  { id: 'add_building', label: 'Add Building' },
  { id: 'add_park', label: 'Add Park' },
];

export default function Toolbar({
  activeTool,
  selectedCell,
  moveSource,
  selectedBuildingName,
  buildingDimensions,
  undoFeedback,
  resetFeedback,
  isResetting,
  densityHeatmapEnabled,
  onDensityHeatmapToggle,
  onToolChange,
  onDimensionsChange,
  onUndo,
  onFullReset,
  agentsVisible,
  onAgentsToggle,
  clock,
  onSetSpeed,
  onTogglePause,
  showAdvisor,
  onAdvisorToggle,
}: ToolbarProps) {
  const isPaused = clock?.isPaused ?? false;
  const currentSpeed = clock?.speedMultiplier ?? 1;

  return (
    <section className="toolbar">
      <div className="tool-row">
        {TOOLS.map(tool => (
          <button key={tool.id} className={activeTool === tool.id ? 'active' : ''} type="button" onClick={() => onToolChange(tool.id)}>
            {tool.label}
          </button>
        ))}
        <button className={undoFeedback ? 'undo-feedback' : ''} type="button" onClick={onUndo}>
          Undo
        </button>
        <button className={resetFeedback ? 'reset-feedback' : ''} disabled={isResetting} type="button" onClick={onFullReset}>
          {isResetting ? 'Resetting' : 'Full Reset'}
        </button>
        <button className={densityHeatmapEnabled ? 'active' : ''} type="button" onClick={onDensityHeatmapToggle}>
          🌡️ Density
        </button>
        <button className={agentsVisible ? 'active' : ''} type="button" onClick={onAgentsToggle}>
          👥 Agents
        </button>
        <button className={showAdvisor ? 'active' : ''} type="button" onClick={onAdvisorToggle}>
          🤖 Advisor
        </button>
      </div>

      <div className="playback-controls tool-row">
        <button type="button" className={isPaused ? 'active' : ''} onClick={onTogglePause}>
          {isPaused ? '▶ Play' : '⏸ Pause'}
        </button>
        {[1, 10, 60, 720].map(speed => (
          <button key={speed} className={currentSpeed === speed && !isPaused ? 'active' : ''} type="button" onClick={() => onSetSpeed(speed)}>
            {speed}x
          </button>
        ))}
      </div>

      {activeTool === 'add_building' && (
        <div className="dimensions-control">
          <label>
            Width
            <input type="number" min={1} max={20} value={buildingDimensions.width} onChange={event => onDimensionsChange({ ...buildingDimensions, width: Number(event.target.value) })} />
          </label>
          <label>
            Depth
            <input type="number" min={1} max={20} value={buildingDimensions.depth} onChange={event => onDimensionsChange({ ...buildingDimensions, depth: Number(event.target.value) })} />
          </label>
          <label>
            Height
            <input type="number" min={1} max={50} value={buildingDimensions.height} onChange={event => onDimensionsChange({ ...buildingDimensions, height: Number(event.target.value) })} />
          </label>
        </div>
      )}

      <div className="toolbar-status">
        <span>Active: {activeTool.replace('_', ' ')}</span>
        <span>Building: {selectedBuildingName ?? 'none selected'}</span>
        <span>Cell: {selectedCell ? `${selectedCell.x}, ${selectedCell.z}` : 'none selected'}</span>
        {activeTool === 'move' && (
          <span>
            {moveSource ? `Drop target next. Picked building height ${moveSource.height}` : 'Pick a source building first'}
          </span>
        )}
        {activeTool === 'remove' && <span>Click a building to remove its full footprint</span>}
        {undoFeedback && <span className="toolbar-flash">{undoFeedback}</span>}
        {resetFeedback && <span className="toolbar-flash">{resetFeedback}</span>}
      </div>
    </section>
  );
}
