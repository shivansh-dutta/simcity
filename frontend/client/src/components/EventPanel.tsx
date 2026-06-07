import { useMemo, useState } from 'react';
import type { Event } from '../module_bindings/types';

type EventPanelProps = {
  activeEvents: readonly Event[];
  onArmDisaster: (disaster: { type: string; intensity: number; radius: number; deathToll: number; color: string }) => void;
  onClearDisaster: () => void;
  armedDisasterType: string | null;
};

export const EVENT_CONFIG = [
  // Natural
  { type: 'earthquake', category: 'Natural', label: 'Earthquake', color: '#B8B8B8', baseDeath: 150000 },
  { type: 'hurricane', category: 'Natural', label: 'Hurricane', color: '#5AB8FF', baseDeath: 100000 },
  { type: 'flood', category: 'Natural', label: 'Flood', color: '#1565C0', baseDeath: 80000 },
  { type: 'fire', category: 'Natural', label: 'Wildfire', color: '#FF6B35', baseDeath: 30000 },
  { type: 'heatwave', category: 'Natural', label: 'Heatwave', color: '#F4A83D', baseDeath: 10000 },
  { type: 'blizzard', category: 'Natural', label: 'Blizzard', color: '#FFFFFF', baseDeath: 5000 },
  { type: 'meteor_strike', category: 'Natural', label: 'Meteor Strike', color: '#FF3333', baseDeath: 400000 },
  { type: 'sinkhole', category: 'Natural', label: 'Sinkhole', color: '#8B4513', baseDeath: 15000 },
  
  // Economic / Manmade
  { type: 'economic_crash', category: 'Manmade', label: 'Financial Crash', color: '#FF5050', baseDeath: 0 },
  { type: 'tech_boom', category: 'Manmade', label: 'Tech Boom', color: '#00E676', baseDeath: -50000 }, // Negative death = immigration/growth
  { type: 'transit_strike', category: 'Manmade', label: 'Transit Strike', color: '#FFEA00', baseDeath: 0 },
  { type: 'cyberattack', category: 'Manmade', label: 'Cyberattack', color: '#9C27B0', baseDeath: 2000 },
  { type: 'power_outage', category: 'Manmade', label: 'Power Outage', color: '#1A1A1A', baseDeath: 5000 },
  { type: 'alien_invasion', category: 'Manmade', label: 'Alien Invasion', color: '#00FF00', baseDeath: 500000 },
];

export default function EventPanel({
  activeEvents,
  onArmDisaster,
  onClearDisaster,
  armedDisasterType,
}: EventPanelProps) {
  const [intensity, setIntensity] = useState(55);
  const [radius, setRadius] = useState(25);
  const [category, setCategory] = useState('Natural');
  const [, setTick] = useState(0);

  // Force re-render every second to update countdowns
  useMemo(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  
  const filteredEvents = EVENT_CONFIG.filter(e => e.category === category);

  return (
    <aside className="panel event-panel">
      <h2>Events</h2>
      <label className="height-control">
        Intensity
        <input type="range" min={0} max={100} value={intensity} onChange={event => setIntensity(Number(event.target.value))} />
        <span>{intensity}</span>
      </label>
      <label className="height-control">
        Radius
        <input type="range" min={5} max={100} value={radius} onChange={event => setRadius(Number(event.target.value))} />
        <span>{radius}</span>
      </label>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <button className={category === 'Natural' ? 'active-tab' : ''} onClick={() => setCategory('Natural')}>Natural</button>
        <button className={category === 'Manmade' ? 'active-tab' : ''} onClick={() => setCategory('Manmade')}>Manmade</button>
      </div>
      
      <div className="disaster-grid">
        {filteredEvents.map(disaster => (
          <button
            key={disaster.type}
            style={{ 
              borderColor: disaster.color, 
              background: armedDisasterType === disaster.type ? 'rgba(255,255,255,0.1)' : 'transparent' 
            }}
            type="button"
            onClick={() => {
              const intensityFactor = intensity / 100;
              const radiusFactor = radius / 25; // 25 is baseline
              const calculatedDeathToll = Math.floor(disaster.baseDeath * intensityFactor * radiusFactor);
              
              onArmDisaster({
                type: disaster.type,
                intensity,
                radius,
                deathToll: calculatedDeathToll,
                color: disaster.color,
              });
            }}
          >
            {armedDisasterType === disaster.type ? 'Arming...' : disaster.label}
          </button>
        ))}
      </div>
      <div className="active-disasters">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span>Active Events ({activeEvents.length})</span>
          {activeEvents.length > 0 && (
            <button className="clear-button" type="button" onClick={onClearDisaster} style={{ padding: '2px 8px', fontSize: '12px' }}>
              Clear All
            </button>
          )}
        </div>
        {activeEvents.length === 0 ? (
          <strong>None</strong>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {activeEvents.map(event => {
              const countdown = Math.max(0, Math.ceil((Number(event.createdAt) + event.duration * 1000 - Date.now()) / 1000));
              return (
                <div key={event.eventId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <strong>{event.eventType}</strong>
                  <small>{countdown}s</small>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
