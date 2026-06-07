import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducer as useStdbReducer, useTable } from 'spacetimedb/react';
import { v4 as uuidv4 } from 'uuid';
import { reducers, tables } from '../module_bindings';
import type { CityStats, Event, NewsBulletin, Player } from '../module_bindings/types';
import type { VoxelGridData } from './VoxelGrid';

type Props = {
  cityStats: CityStats | null;
  players: readonly Player[];
  currentIdentity: string | null;
  liveCity: VoxelGridData | null;
};

type DisplayBulletin = { headline: string; body: string; disasterType: string; triggerName: string };

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const NARRATOR_COOLDOWN_MS = 20_000;
const SHOW_DURATION_MS = 12_000;
const SLIDE_MS = 400;
const GAP_MS = 2_000;

const GENERIC_BODIES: Record<string, string> = {
  earthquake: 'Emergency services are responding to a powerful seismic event shaking Lower Manhattan. Residents are urged to shelter in place and stay away from windows.',
  hurricane: 'A powerful hurricane is battering Lower Manhattan with destructive winds and rain. Mass evacuations are underway along the waterfront.',
  flood: 'Rising floodwaters are inundating streets across Lower Manhattan. Transit systems are suspended as emergency crews deploy.',
  fire: 'A fast-moving wildfire has broken out in Lower Manhattan. Evacuation orders are in effect for multiple blocks.',
  heatwave: 'An extreme heatwave is gripping Lower Manhattan with dangerous temperatures. Cooling centers are open across the borough.',
  blizzard: 'A blizzard is paralyzing Lower Manhattan with heavy snowfall and near-zero visibility. All roads are closed.',
  meteor_strike: 'A meteor strike has devastated Lower Manhattan. First responders are on the scene assessing catastrophic damage.',
  economic_crash: 'A financial shock is reverberating through the Financial District. Markets are in freefall as emergency sessions are called.',
  tech_boom: 'A historic tech boom is transforming Lower Manhattan. Investment is flooding the district at unprecedented levels.',
  transit_strike: 'A transit strike has ground all public transportation to a halt. Streets are gridlocked across Lower Manhattan.',
};

function countBuildingsInRadius(grid: VoxelGridData, x: number, z: number, radius: number): number {
  let count = 0;
  const r2 = radius * radius;
  for (let row = Math.max(0, x - radius); row < Math.min(grid.length, x + radius); row++) {
    for (let col = Math.max(0, z - radius); col < Math.min((grid[0]?.length ?? 0), z + radius); col++) {
      if ((row - x) ** 2 + (col - z) ** 2 > r2) continue;
      if (grid[row]?.[col]?.some(v => v === 1)) count++;
    }
  }
  return count;
}

function locationName(x: number, z: number): string {
  if (x < 60 && z < 80) return 'the Financial District';
  if (x < 80 && z > 140) return 'Tribeca';
  if (x > 120 && z < 80) return 'the World Trade Center site';
  if (x > 100 && z > 150) return 'Battery Park City';
  return 'Lower Manhattan';
}

export default function NewsTicker({ cityStats, players, currentIdentity, liveCity }: Props) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<DisplayBulletin | null>(null);

  const queue = useRef<DisplayBulletin[]>([]);
  const isShowing = useRef(false);
  const cooldownRef = useRef<number>(0);
  const seenEventIds = useRef<Set<string>>(new Set());
  const seenBulletinIds = useRef<Set<string>>(new Set());
  const showTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const postBulletin = useStdbReducer(reducers.postBulletin);

  const clearShowTimers = () => {
    showTimers.current.forEach(clearTimeout);
    showTimers.current = [];
  };

  const showNext = useCallback(() => {
    if (queue.current.length === 0) {
      isShowing.current = false;
      return;
    }
    const next = queue.current.shift()!;
    isShowing.current = true;
    setCurrent(next);
    setVisible(true);

    const hideTimer = setTimeout(() => {
      setVisible(false);
      const gapTimer = setTimeout(showNext, SLIDE_MS + GAP_MS);
      showTimers.current.push(gapTimer);
    }, SHOW_DURATION_MS + SLIDE_MS);
    showTimers.current.push(hideTimer);
  }, []);

  const enqueue = useCallback((bulletin: DisplayBulletin) => {
    queue.current.push(bulletin);
    if (!isShowing.current) showNext();
  }, [showNext]);

  // Watch for new bulletins from SpacetimeDB (all clients display these)
  useTable(tables.newsBulletin, {
    onInsert: (row: NewsBulletin) => {
      if (seenBulletinIds.current.has(row.bulletinId)) return;
      // Skip bulletins older than 15s (initial subscription data)
      if (Date.now() - Number(row.createdAt) > 15_000) {
        seenBulletinIds.current.add(row.bulletinId);
        return;
      }
      seenBulletinIds.current.add(row.bulletinId);
      const triggerPlayer = players.find(p => p.identity === row.triggeredBy);
      enqueue({
        headline: row.headlineText,
        body: row.bodyText,
        disasterType: row.disasterType,
        triggerName: triggerPlayer?.username ?? 'Unknown Player',
      });
    },
  });

  // Watch for new events — only the triggering player calls Gemini
  useTable(tables.event, {
    onInsert: useCallback(async (row: Event) => {
      if (seenEventIds.current.has(row.eventId)) return;
      seenEventIds.current.add(row.eventId);

      // Skip stale events from initial load
      if (Date.now() - Number(row.createdAt) > 10_000) return;
      // Only the player who triggered this event generates the bulletin
      if (row.triggeredBy !== currentIdentity) return;

      const disasterType = row.eventType;
      const buildingCount = liveCity
        ? countBuildingsInRadius(liveCity, row.affectedX, row.affectedZ, row.radius)
        : '~50';
      const population = cityStats?.population ?? 0;
      const economyScore = Math.round(cityStats?.economyScore ?? 0);

      const prompt =
        `You are a breaking news anchor for a Manhattan local news channel. Write a urgent breaking news bulletin about a disaster that just occurred. The disaster type is ${disasterType}. The intensity is ${row.intensity} out of 100. The affected area is centered at grid coordinates ${row.affectedX} and ${row.affectedZ} in Lower Manhattan. The current city population is ${population}. The current economy score is ${economyScore} out of 100. The number of buildings in the affected radius is approximately ${buildingCount}. Respond with exactly two parts separated by a newline. The first part is a single sentence headline in all caps maximum 12 words. The second part is two sentences of breaking news body text written in urgent broadcast style. Reference specific locations in Lower Manhattan by name if the coordinates correspond to known areas like the Financial District, Tribeca, or the World Trade Center site. The approximate location name is ${locationName(row.affectedX, row.affectedZ)}. Maximum 80 words total.`;

      const now = Date.now();
      const onCooldown = now - cooldownRef.current < NARRATOR_COOLDOWN_MS;

      let headlineText: string;
      let bodyText: string;

      if (onCooldown) {
        headlineText = `BREAKING: ${disasterType.replace(/_/g, ' ').toUpperCase()} STRIKES LOWER MANHATTAN`;
        bodyText = GENERIC_BODIES[disasterType] ?? 'Emergency services are responding to an incident in Lower Manhattan. Residents are urged to follow official safety guidance.';
      } else {
        cooldownRef.current = now;
        const apiKey = import.meta.env.VITE_GEMINI_KEY as string | undefined;
        if (!apiKey) {
          headlineText = `BREAKING: ${disasterType.replace(/_/g, ' ').toUpperCase()} STRIKES LOWER MANHATTAN`;
          bodyText = GENERIC_BODIES[disasterType] ?? '';
        } else {
          try {
            const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
            });
            const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
            const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            const newlineIdx = raw.indexOf('\n');
            if (newlineIdx > 0) {
              headlineText = raw.slice(0, newlineIdx).trim();
              bodyText = raw.slice(newlineIdx + 1).trim();
            } else {
              headlineText = raw.trim() || `BREAKING: ${disasterType.replace(/_/g, ' ').toUpperCase()} STRIKES`;
              bodyText = GENERIC_BODIES[disasterType] ?? '';
            }
          } catch {
            headlineText = `BREAKING: ${disasterType.replace(/_/g, ' ').toUpperCase()} STRIKES LOWER MANHATTAN`;
            bodyText = GENERIC_BODIES[disasterType] ?? '';
          }
        }
      }

      const bulletinId = uuidv4();
      postBulletin({
        bulletinId,
        headlineText,
        bodyText,
        disasterType,
        triggeredBy: currentIdentity ?? '',
      }).catch(console.warn);
    }, [currentIdentity, cityStats, liveCity, postBulletin]),
  });

  useEffect(() => () => clearShowTimers(), []);

  if (!current) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        transform: visible ? 'translateY(0)' : 'translateY(-110%)',
        transition: `transform ${SLIDE_MS}ms cubic-bezier(0.4,0,0.2,1)`,
        background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
        borderBottom: '3px solid #ef4444',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        padding: '0.75rem 1.5rem',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{
          fontSize: '1rem',
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '0.04em',
          marginBottom: '0.2rem',
          textTransform: 'uppercase',
        }}>
          📡 {current.headline}
        </div>
        <div style={{ fontSize: '0.82rem', color: '#fca5a5', lineHeight: 1.5 }}>
          {current.body}
        </div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.72rem', color: '#fca5a5' }}>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: '0.15rem' }}>
          {current.disasterType.replace(/_/g, ' ').toUpperCase()}
        </div>
        <div>triggered by</div>
        <div style={{ color: '#fbbf24' }}>{current.triggerName}</div>
      </div>
    </div>
  );
}
