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
  buildingDescription: string;
  onDescriptionChange: (desc: string) => void;
  gdpEstimate: number | null;
  onGetGdpEstimate: () => void;
  isEstimating: boolean;
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
  buildingDescription,
  onDescriptionChange,
  gdpEstimate,
  onGetGdpEstimate,
  isEstimating,
}: ToolbarProps) {
  const isPaused = clock?.isPaused ?? false;
  const currentSpeed = clock?.speedMultiplier ?? 1;

  function fmtGDP(v: number) {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    return `$${v.toLocaleString()}`;
  }

  return (
    <section className="toolbar">
      {/* Row 1: editing tools */}
      <div className="tool-row">
        {TOOLS.map(tool => (
          <button key={tool.id} className={activeTool === tool.id ? 'active' : ''} type="button" onClick={() => onToolChange(tool.id)}>
            {tool.label}
          </button>
        ))}
        <button className={undoFeedback ? 'undo-feedback' : ''} type="button" onClick={onUndo}>Undo</button>
        <button className={resetFeedback ? 'reset-feedback' : ''} disabled={isResetting} type="button" onClick={onFullReset}>
          {isResetting ? 'Resetting…' : 'Full Reset'}
        </button>
        <button className={densityHeatmapEnabled ? 'active' : ''} type="button" onClick={onDensityHeatmapToggle}>🌡️ Density</button>
        <button className={agentsVisible ? 'active' : ''} type="button" onClick={onAgentsToggle}>👥 Agents</button>
      </div>

      <hr className="toolbar-divider" />

      {/* Row 2: playback + advisor (right-aligned) */}
      <div className="toolbar-row">
        <button type="button" className={isPaused ? 'active' : ''} onClick={onTogglePause}>
          {isPaused ? '▶ Play' : '⏸ Pause'}
        </button>
        {[1, 10, 60, 720].map(speed => (
          <button key={speed} className={currentSpeed === speed && !isPaused ? 'active' : ''} type="button" onClick={() => onSetSpeed(speed)}>
            {speed}×
          </button>
        ))}
        <span className="spacer" />
        <button className={showAdvisor ? 'active' : ''} type="button" onClick={onAdvisorToggle}>🤖 Advisor</button>
      </div>

      {/* Building editor — only when add_building is active */}
      {activeTool === 'add_building' && (
        <div className="building-editor">
          <hr className="toolbar-divider" style={{ margin: '0' }} />
          <div className="dim-row">
            {(['width', 'depth', 'height'] as const).map(dim => (
              <div className="dim-field" key={dim}>
                <label htmlFor={`dim-${dim}`}>{dim.charAt(0).toUpperCase() + dim.slice(1)}</label>
                <input
                  id={`dim-${dim}`}
                  className="dim-input"
                  type="number"
                  min={dim === 'height' ? 1 : 1}
                  max={dim === 'height' ? 50 : 20}
                  value={buildingDimensions[dim]}
                  onChange={e => onDimensionsChange({ ...buildingDimensions, [dim]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <textarea
            className="desc-textarea"
            placeholder="Describe the building or business (e.g. 'Luxury 40-story residential tower, 300 units')"
            value={buildingDescription}
            onChange={e => onDescriptionChange(e.target.value)}
            rows={2}
          />
          <div className="gdp-row">
            <button type="button" onClick={onGetGdpEstimate} disabled={isEstimating || !buildingDescription.trim()}>
              {isEstimating ? 'Estimating…' : '💰 Get GDP Estimate'}
            </button>
            {gdpEstimate !== null && (
              <span className="gdp-badge">~{fmtGDP(gdpEstimate)}/yr GDP</span>
            )}
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="toolbar-status">
        <span>Tool: <strong style={{ color: '#f4f1e8' }}>{activeTool.replace(/_/g, ' ')}</strong></span>
        <span>Building: {selectedBuildingName ?? '—'}</span>
        <span>Cell: {selectedCell ? `${selectedCell.x}, ${selectedCell.z}` : '—'}</span>
        {activeTool === 'move' && (
          <span>{moveSource ? `Drop target next · h=${moveSource.height}` : 'Pick a source building'}</span>
        )}
        {activeTool === 'remove' && <span>Click a building to remove it</span>}
        {undoFeedback && <span className="toolbar-flash">{undoFeedback}</span>}
        {resetFeedback && <span className="toolbar-flash">{resetFeedback}</span>}
      </div>
    </section>
  );
}
