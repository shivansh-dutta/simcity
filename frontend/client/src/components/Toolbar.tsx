import type { GridCell } from './VoxelGrid';

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
}: ToolbarProps) {
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
