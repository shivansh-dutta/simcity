import { useCallback, useEffect, useRef, useState } from 'react';
import type { CityEdit, CityStats, EconomicData, Player, WeatherState } from '../module_bindings/types';

type Props = {
  cityStats: CityStats | null;
  citySummary: { population: number; gdpDollars: number; unemployment: number } | null;
  weather: WeatherState | null;
  economicData: EconomicData | null;
  players: readonly Player[];
  cityEdits: readonly CityEdit[];
};

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
const COOLDOWN_MS = 30_000;
const AUTO_INTERVAL_MS = 90_000;
const CHARS_PER_SEC = 20;

function pillColor(value: number): string {
  if (value < 40) return '#ff6b6b';
  if (value < 70) return '#f4d35e';
  return '#46d9a8';
}

export default function AIAdvisor({ cityStats, citySummary, weather, economicData, players, cityEdits }: Props) {
  const [response, setResponse] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cooldownRef = useRef<number>(0);
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charIndexRef = useRef(0);

  useEffect(() => {
    if (!response) return;
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    charIndexRef.current = 0;
    setDisplayedText('');
    const ms = 1000 / CHARS_PER_SEC;
    typewriterRef.current = setInterval(() => {
      charIndexRef.current += 1;
      setDisplayedText(response.slice(0, charIndexRef.current));
      if (charIndexRef.current >= response.length && typewriterRef.current) {
        clearInterval(typewriterRef.current);
      }
    }, ms);
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current); };
  }, [response]);

  const buildPrompt = useCallback((customQ?: string): string => {
    const population = cityStats?.population ?? citySummary?.population ?? 0;
    const economyScore = Math.round(cityStats?.economyScore ?? 0);
    const happiness = Math.round(cityStats?.happiness ?? 0);
    const healthScore = Math.round(cityStats?.healthScore ?? 0);
    const trafficScore = Math.round(cityStats?.trafficScore ?? 0);
    const greenScore = Math.round(cityStats?.greenScore ?? 0);
    const disasterActive = cityStats?.disasterActive || 'none';
    const tempC = (weather?.tempC ?? 0).toFixed(1);
    const gdpGrowth = (economicData?.gdpGrowth ?? 0).toFixed(1);
    const unemployment = (citySummary?.unemployment ?? economicData?.unemployment ?? 0).toFixed(1);
    const playerCount = players.filter(p => p.isOnline).length;

    const recentActions = [...players]
      .filter(p => p.lastAction)
      .sort((a, b) => Number(b.lastActionAt) - Number(a.lastActionAt))
      .slice(0, 5)
      .map(p => p.lastAction)
      .join(', ') || 'none';

    const placeCount = cityEdits.filter(e => e.editType === 'place').length;
    const removeCount = cityEdits.filter(e => e.editType === 'remove').length;

    let prompt =
      `You are an urban economics advisor for a real-time city simulation of Lower Manhattan. Analyze the current city state and give 3 specific actionable recommendations. Current data: Population is ${population}. Economy score is ${economyScore} out of 100. Happiness is ${happiness} out of 100. Health score is ${healthScore} out of 100. Traffic score is ${trafficScore} out of 100. Green score is ${greenScore} out of 100. Active disaster is ${disasterActive}. Current weather is ${tempC} degrees Celsius. GDP growth is ${gdpGrowth} percent. Unemployment is ${unemployment} percent. Number of online players is ${playerCount}. Recent player actions are ${recentActions}. Total buildings placed this session is ${placeCount}. Total buildings removed this session is ${removeCount}. Respond with exactly 3 numbered recommendations. Each recommendation must reference a specific current metric by its actual number. Maximum 60 words total. One sentence per recommendation. Be extremely concise.`;

    if (customQ?.trim()) {
      prompt += ` Additionally, the player asks: ${customQ.trim()}`;
    }

    return prompt;
  }, [cityStats, citySummary, weather, economicData, players, cityEdits]);

  const analyze = useCallback(async (customQ?: string) => {
    const now = Date.now();
    if (now - cooldownRef.current < COOLDOWN_MS) return;
    cooldownRef.current = now;

    const apiKey = import.meta.env.VITE_GEMINI_KEY as string | undefined;
    if (!apiKey) {
      setError('VITE_GEMINI_KEY not set in .env.local');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(customQ) }] }],
        }),
      });
      const data = await res.json() as unknown;
      const dataObj = data as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        error?: { message?: string; status?: string };
      };
      if (!res.ok || dataObj.error) {
        setError(`Gemini API error: ${dataObj.error?.message ?? dataObj.error?.status ?? res.status}`);
        return;
      }
      const text = dataObj.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        setError(`Unexpected response format — raw: ${JSON.stringify(data).slice(0, 200)}`);
        return;
      }
      setResponse(text);
      setLastAnalysisTime(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsLoading(false);
    }
  }, [buildPrompt]);

  useEffect(() => {
    if (autoEnabled) {
      autoIntervalRef.current = setInterval(() => { void analyze(); }, AUTO_INTERVAL_MS);
    } else if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
    }
    return () => { if (autoIntervalRef.current) clearInterval(autoIntervalRef.current); };
  }, [autoEnabled, analyze]);

  const metrics = [
    { label: 'Economy', value: Math.round(cityStats?.economyScore ?? 0) },
    { label: 'Happiness', value: Math.round(cityStats?.happiness ?? 0) },
    { label: 'Health', value: Math.round(cityStats?.healthScore ?? 0) },
    { label: 'Traffic', value: Math.round(cityStats?.trafficScore ?? 0) },
    { label: 'Green', value: Math.round(cityStats?.greenScore ?? 0) },
  ];
  const criticalMetrics = [...metrics].sort((a, b) => a.value - b.value).slice(0, 3);

  const handleAsk = () => {
    void analyze(customQuestion);
    setCustomQuestion('');
  };

  return (
    <aside
      className="panel ai-advisor-panel"
      style={isLoading ? { animation: 'advisorPulse 1.2s ease-in-out infinite' } : undefined}
    >
      <div className="panel-header" style={{ marginBottom: '0.6rem' }}>
        <h2 style={{ margin: 0 }}>🤖 AI Advisor</h2>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {criticalMetrics.map(m => (
          <span
            key={m.label}
            style={{
              padding: '0.18rem 0.55rem',
              borderRadius: 999,
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#0a0a0a',
              background: pillColor(m.value),
            }}
          >
            {m.label}: {m.value}
          </span>
        ))}
      </div>

      <div
        style={{
          minHeight: '5rem',
          maxHeight: '12rem',
          overflowY: 'auto',
          fontSize: '0.83rem',
          color: '#d8d4c8',
          lineHeight: 1.65,
          marginBottom: '0.6rem',
          whiteSpace: 'pre-wrap',
        }}
      >
        {error ? (
          <span style={{ color: '#ff6b6b' }}>{error}</span>
        ) : displayedText || (
          <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
            {isLoading ? 'Analyzing city state…' : 'Click "Analyze Now" to get AI recommendations.'}
          </span>
        )}
      </div>

      {lastAnalysisTime && (
        <div style={{ color: '#6b7280', fontSize: '0.71rem', marginBottom: '0.5rem' }}>
          Last analysis: {lastAnalysisTime.toLocaleTimeString()}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
        <button type="button" onClick={() => { void analyze(); }} disabled={isLoading}>
          {isLoading ? '⏳' : '🔍'} Analyze Now
        </button>
        <button type="button" className={autoEnabled ? 'active' : ''} onClick={() => setAutoEnabled(v => !v)}>
          🔄 Auto
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <input
          type="text"
          placeholder="Ask about the city…"
          value={customQuestion}
          onChange={e => setCustomQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAsk(); }}
          style={{
            flex: 1,
            padding: '0.38rem 0.7rem',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.08)',
            color: '#f4f1e8',
            fontSize: '0.81rem',
            outline: 'none',
          }}
        />
        <button type="button" onClick={handleAsk} disabled={isLoading || !customQuestion.trim()}>
          Ask
        </button>
      </div>
    </aside>
  );
}
