import type { CityStats, EconomicData, Player, WeatherState, SimulationClock } from '../module_bindings/types';

type StatsPanelProps = {
  cityStats: CityStats | null;
  citySummary: { gdpDollars: number; unemployment: number; population: number } | null;
  weather: WeatherState | null;
  economicData: EconomicData | null;
  players: readonly Player[];
  fps: number;
  cityShape: number[] | null;
  clock: SimulationClock | null;
  airQuality: { aqi: number; pm25: number } | null;
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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDollars(value: number) {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function aqiLabel(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#46d9a8';
  if (aqi <= 100) return '#f4d35e';
  if (aqi <= 150) return '#f97316';
  if (aqi <= 200) return '#ef4444';
  return '#9333ea';
}

export default function StatsPanel({ cityStats, citySummary, weather, economicData, players, fps, cityShape, clock, airQuality }: StatsPanelProps) {
  const onlinePlayers = players.filter(player => player.isOnline);

  // We use cityStats for scores because it is the authoritative SpacetimeDB state,
  // but we can use citySummary for the real economic numbers (GDP, unemployment)
  // because they are deterministically derived from the synced city grid.
  const population = cityStats?.population ?? citySummary?.population ?? 0;
  
  let formattedDate = '...';
  if (clock) {
    const monthIndex = Math.floor(Number(clock.currentTick) / 720) % 12;
    formattedDate = `${MONTH_NAMES[monthIndex]} ${clock.simulatedYear}`;
  }

  return (
    <aside className="panel stats-panel">
      <div className="panel-header">
        <h2>City Metrics</h2>
        <div className="simulation-date">{formattedDate}</div>
      </div>
      <div className="metric-hero">
        <span>Population</span>
        <strong>{population.toLocaleString()}</strong>
      </div>
      <div className="metric-row"><span>Renderer</span><strong>{fps} FPS</strong></div>
      <div className="metric-row"><span>Grid</span><strong>{cityShape?.join(' x ') ?? 'loading'}</strong></div>
      <ScoreRow label="Happiness" value={cityStats?.happiness ?? 0} />
      <ScoreRow label="Economy" value={cityStats?.economyScore ?? 0} />
      <ScoreRow label="Health" value={cityStats?.healthScore ?? 0} />
      <ScoreRow label="Traffic" value={cityStats?.trafficScore ?? 0} />
      <ScoreRow label="Green" value={cityStats?.greenScore ?? 0} />
      
      <h3>Weather &amp; Air Quality</h3>
      <div className="metric-row"><span>Temp</span><strong>{weather ? `${weather.tempC.toFixed(1)} °C` : '...'}</strong></div>
      <div className="metric-row"><span>Wind</span><strong>{weather ? `${weather.windSpeed.toFixed(1)} km/h` : '...'}</strong></div>
      {airQuality && (
        <div className="metric-row">
          <span>AQI (NYC)</span>
          <strong style={{ color: aqiColor(airQuality.aqi) }}>
            {airQuality.aqi} — {aqiLabel(airQuality.aqi)}
          </strong>
        </div>
      )}
      {airQuality && (
        <div className="metric-row"><span>PM2.5 AQI</span><strong style={{ color: aqiColor(airQuality.pm25) }}>{airQuality.pm25}</strong></div>
      )}

      <h3>Economic Data <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 400 }}>live · FRED</span></h3>
      <div className="metric-row"><span>GDP Contrib</span><strong>{citySummary ? formatDollars(citySummary.gdpDollars) : '...'}</strong></div>
      <div className="metric-row"><span>NY Unemployment</span><strong>{economicData ? `${economicData.unemployment.toFixed(1)}%` : '...'}</strong></div>
      <div className="metric-row"><span>US GDP Growth</span><strong>{economicData ? `${economicData.gdpGrowth.toFixed(1)}%` : '...'}</strong></div>
      <div className="metric-row"><span>US Inflation</span><strong>{economicData ? `${economicData.inflation.toFixed(1)}%` : '...'}</strong></div>
      
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
