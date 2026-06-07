import { useEffect, useState } from 'react';
import type { Player } from '../module_bindings/types';

type ActivityFeedProps = {
  players: readonly Player[];
};

const FADE_AFTER_MS = 30_000;
const MAX_ENTRIES = 8;

export default function ActivityFeed({ players }: ActivityFeedProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const visible = players
    .filter(p => p.lastAction && p.lastActionAt && (now - Number(p.lastActionAt)) < FADE_AFTER_MS)
    .sort((a, b) => Number(b.lastActionAt - a.lastActionAt))
    .slice(0, MAX_ENTRIES);

  if (visible.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '5.5rem',
      left: '1rem',
      zIndex: 10,
      display: 'grid',
      gap: '0.4rem',
      maxWidth: 'min(340px, calc(100vw - 2rem))',
      pointerEvents: 'none',
    }}>
      <style>{`
        @keyframes activityFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {visible.map(player => {
        const secsAgo = Math.floor((now - Number(player.lastActionAt)) / 1000);
        const opacity = secsAgo >= 20 ? Math.max(0, 1 - (secsAgo - 20) / 10) : 1;
        return (
          <div
            key={player.identity + String(player.lastActionAt)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 0.75rem',
              borderRadius: 14,
              background: 'rgba(0,0,0,0.78)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
              fontSize: '0.8rem',
              color: '#f4f1e8',
              opacity,
              animation: 'activityFadeIn 0.3s ease',
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: player.color, boxShadow: `0 0 6px ${player.color}`,
            }} />
            <span style={{ fontWeight: 700, color: player.color, flexShrink: 0 }}>
              {player.username}
            </span>
            <span style={{
              color: '#d8d4c8', flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {player.lastAction}
            </span>
            <span style={{ color: '#888', flexShrink: 0 }}>{secsAgo}s</span>
          </div>
        );
      })}
    </div>
  );
}
