import type { CityStats, EconomicData, Player, WeatherState } from '../module_bindings/types';

type StatsPanelProps = {
  cityStats: CityStats | null;
  weather: WeatherState | null;
  economicData: EconomicData | null;
  players: readonly Player[];
  fps: number;
  cityShape: number[] | null;
};

function scoreClass(value: number) {
  if (value >= 70) return 'good';
  if (value >= 40) return 'warning';
  return 'critical';
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="score-row">
      <div className="score-label"><span>{label}</span><strong>{rounded}</strong></div>
      <div className="score-track"><div className={`score-fill ${scoreClass(rounded)}`} style={{ width: `${rounded}%` }} /></div>
    </div>
  );
}

export default function StatsPanel({ cityStats, weather, economicData, players, fps, cityShape }: StatsPanelProps) {
  const onlinePlayers = players.filter(player => player.isOnline);

  return (
    <aside className="panel stats-panel">
      <h2>City Metrics</h2>
      <div className="metric-hero">
        <span>Population</span>
        <strong>{(cityStats?.population ?? 0).toLocaleString()}</strong>
      </div>
      <div className="metric-row"><span>Renderer</span><strong>{fps} FPS</strong></div>
      <div className="metric-row"><span>Grid</span><strong>{cityShape?.join(' x ') ?? 'loading'}</strong></div>
      <ScoreRow label="Happiness" value={cityStats?.happiness ?? 0} />
      <ScoreRow label="Economy" value={cityStats?.economyScore ?? 0} />
      <ScoreRow label="Health" value={cityStats?.healthScore ?? 0} />
      <ScoreRow label="Traffic" value={cityStats?.trafficScore ?? 0} />
      <ScoreRow label="Green" value={cityStats?.greenScore ?? 0} />
      <h3>Weather</h3>
      <div className="metric-row"><span>Temp</span><strong>{weather ? `${weather.tempC.toFixed(1)} C` : '...'}</strong></div>
      <div className="metric-row"><span>Wind</span><strong>{weather ? `${weather.windSpeed.toFixed(1)} km/h` : '...'}</strong></div>
      <h3>Economic Data</h3>
      <div className="metric-row"><span>GDP growth</span><strong>{economicData ? `${economicData.gdpGrowth.toFixed(1)}%` : '...'}</strong></div>
      <div className="metric-row"><span>Inflation</span><strong>{economicData ? `${economicData.inflation.toFixed(1)}%` : '...'}</strong></div>
      <h3>Players Online</h3>
      <div className="player-list">
        {onlinePlayers.map(player => (
          <div className="player-pill" key={player.identity}>
            <span className="player-dot" style={{ color: player.color, background: player.color }} />
            <span>{player.username}</span>
            <strong>{player.score}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
}
