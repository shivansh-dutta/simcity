import type { GridCell } from './VoxelGrid';

export type Tool = 'select' | 'move' | 'remove' | 'add_building' | 'add_park';
export type MoveSource = GridCell & { height: number };

type ToolbarProps = {
  activeTool: Tool;
  selectedCell: GridCell | null;
  moveSource: MoveSource | null;
  selectedBuildingName: string | null;
  buildingHeight: number;
  undoFeedback: string | null;
  resetFeedback: string | null;
  isResetting: boolean;
  onToolChange: (tool: Tool) => void;
  onHeightChange: (height: number) => void;
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
  buildingHeight,
  undoFeedback,
  resetFeedback,
  isResetting,
  onToolChange,
  onHeightChange,
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
      </div>

      {activeTool === 'add_building' && (
        <label className="height-control">
          Height
          <input type="range" min={1} max={50} value={buildingHeight} onChange={event => onHeightChange(Number(event.target.value))} />
          <span>{buildingHeight} floors</span>
        </label>
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
