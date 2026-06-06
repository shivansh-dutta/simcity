import { useMemo, useState } from 'react';
import type { CityStats, Event } from '../module_bindings/types';
import type { GridCell } from './VoxelGrid';

type EventPanelProps = {
  cityStats: CityStats | null;
  events: readonly Event[];
  selectedCell: GridCell | null;
  onTriggerDisaster: (eventType: string, intensity: number, affectedCell: GridCell) => Promise<void>;
  onClearDisaster: () => void;
};

const DISASTERS = [
  { type: 'earthquake', label: 'Earthquake', color: '#B8B8B8' },
  { type: 'hurricane', label: 'Hurricane', color: '#5AB8FF' },
  { type: 'flood', label: 'Flood', color: '#1565C0' },
  { type: 'fire', label: 'Fire', color: '#FF6B35' },
  { type: 'heatwave', label: 'Heatwave', color: '#F4A83D' },
  { type: 'economic_crash', label: 'Economic Crash', color: '#FF5050' },
];

export default function EventPanel({
  cityStats,
  events,
  selectedCell,
  onTriggerDisaster,
  onClearDisaster,
}: EventPanelProps) {
  const [intensity, setIntensity] = useState(55);
  const [pendingDisaster, setPendingDisaster] = useState<string | null>(null);
  const activeEvent = useMemo(() => {
    if (!cityStats?.disasterActive) return null;
    return [...events]
      .filter(event => event.eventType === cityStats.disasterActive)
      .sort((a, b) => Number(b.createdAt - a.createdAt))[0] ?? null;
  }, [cityStats?.disasterActive, events]);

  const countdown = activeEvent ? Math.max(0, Math.ceil((Number(activeEvent.createdAt) + activeEvent.duration * 1000 - Date.now()) / 1000)) : 0;
  const target = selectedCell ?? { x: 120, z: 100 };

  return (
    <aside className="panel event-panel">
      <h2>Events</h2>
      <label className="height-control">
        Intensity
        <input type="range" min={0} max={100} value={intensity} onChange={event => setIntensity(Number(event.target.value))} />
        <span>{intensity}</span>
      </label>
      <div className="disaster-grid">
        {DISASTERS.map(disaster => (
          <button
            key={disaster.type}
            disabled={pendingDisaster !== null}
            style={{ borderColor: disaster.color }}
            type="button"
            onClick={() => {
              setPendingDisaster(disaster.type);
              onTriggerDisaster(disaster.type, intensity, target)
                .catch(error => console.warn('Disaster trigger failed:', error))
                .finally(() => setPendingDisaster(null));
            }}
          >
            {pendingDisaster === disaster.type ? 'Triggering...' : disaster.label}
          </button>
        ))}
      </div>
      <button className="clear-button" type="button" onClick={onClearDisaster}>
        Clear Disaster
      </button>
      <div className="active-disaster">
        <span>Active disaster</span>
        <strong>{cityStats?.disasterActive || 'None'}</strong>
        {activeEvent && <small>{countdown}s remaining</small>}
      </div>
    </aside>
  );
}
