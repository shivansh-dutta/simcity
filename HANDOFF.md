# HANDOFF — Urban What-If

## Last completed phase
Phase 10 — AI Disaster Narrator (Breaking News Ticker)

## What exists and works
- `spacetimedb/src/index.ts`: Added `NewsBulletin` public table (bulletinId PK, headlineText, bodyText, disasterType, triggeredBy, createdAt). Added `postBulletin` reducer. Module redeployed to `urban-whatif-xunfn`, bindings regenerated.
- `client/src/components/NewsTicker.tsx`: Watches Event table via useTable onInsert. When a new event arrives within 10s, the triggering player calls Gemini (`gemini-3-flash-preview`) to generate headline + body. Posts via `postBulletin` reducer. All clients display from NewsBulletin table via onInsert. Slide-down animation (400ms), 12s visible, 2s gap between queued bulletins. 20s Gemini cooldown — falls back to generic template. Player name shown on right.
- `client/src/App.tsx`: NewsTicker rendered at top of app shell, receives cityStats, players, currentIdentity, liveCity.

## Key decisions made that differ from SPEC.md
- Only the player who triggered the disaster calls Gemini (checked via `row.triggeredBy === currentIdentity`), preventing duplicate API calls from all connected clients.
- Uses `gemini-3-flash-preview` (same as AIAdvisor) instead of `gemini-2.0-flash` from spec — the latter has quota 0 on this account.

## Current known issues
- Traffic agents still move like ants (pre-existing bug from Phase 7).

## Verify the previous phase still works
`cd frontend && npm run build`

## Next phase starts with
Trigger an earthquake disaster and confirm the news banner slides down within 5 seconds on both browser tabs with identical text.

## Phases Before That

# HANDOFF — Urban What-If

## Last completed phase
Phase 9 — AI City Advisor (Gemini API Integration)

## What exists and works
- `client/src/components/AIAdvisor.tsx`: Panel using plain fetch to Gemini 2.0 Flash. Builds prompt from live SpacetimeDB state (cityStats, citySummary, weather, economicData, players, cityEdits). Typewriter animation at 20 chars/sec. 30s cooldown via useRef. Auto-analyze every 90s toggle. Three lowest-score metric pills (red/yellow/green). Pulsing border via CSS animation while loading. Custom question input appends to base prompt.
- `client/src/components/Toolbar.tsx`: Added "🤖 Advisor" toggle button with showAdvisor/onAdvisorToggle props.
- `client/src/App.tsx`: showAdvisor state, imports AIAdvisor, renders it conditionally on right side at top:380px.
- `client/.env.local`: Added VITE_GEMINI_KEY= (user must fill in the actual key from Google Cloud Console).

## Key decisions made that differ from SPEC.md
- None

## Current known issues
- VITE_GEMINI_KEY is empty in .env.local — must be filled with a real Google Cloud Gemini API key before the advisor will work.
- Traffic agents still move like ants (pre-existing bug from Phase 7).

## Verify the previous phase still works
`cd frontend && npm run build`

## Next phase starts with
Fill VITE_GEMINI_KEY in client/.env.local with a real Gemini API key, then test by clicking "🤖 Advisor" in the toolbar and clicking "Analyze Now".

## Phases Before That

# HANDOFF — Urban What-If

## Last completed phase
Phase 8 — Live Player Visibility & Multiplayer Presence

## What exists and works
- `spacetimedb/src/index.ts`: Player table has 6 new presence fields (isPlacingDisaster, disasterPreviewX/Z/Radius, lastAction, lastActionAt). moveCursor now takes 6 params. removeBuilding, placeBuilding, moveBuilding, and triggerDisaster all write lastAction/lastActionAt to the calling player's row.
- `CityScene.tsx`: Other players appear as pulsing colored spheres (8% breathing scale via useFrame + Math.sin) with username pill labels (Drei Html). When a player has isPlacingDisaster=true, a semi-transparent colored ring shows their disaster target radius.
- `ActivityFeed.tsx`: Fixed bottom-left overlay showing last 8 player actions, live "Xs ago" timestamps updating every second, entries fade out after 30s.
- `App.tsx`: Name-entry modal on first visit (skipped if name already in localStorage, city loads in background concurrently). Throttled moveCursor (150ms) during disaster placement mode. Clears isPlacingDisaster flag when exiting disaster mode. Passes currentIdentity to CityScene so players don't see their own cursor sphere.
- SpacetimeDB module deployed to `urban-whatif-xunfn` on maincloud. VITE_STDB_MODULE updated to match.

## Key decisions made that differ from SPEC.md
- moveCursor signature extended from 2 to 6 params; all callers in App.tsx updated.
- ActivityFeed reads directly from the Player table subscription — no new table needed.
- Players do not see their own cursor sphere (filtered by currentIdentity in CityScene).

## Current known issues
- Traffic agents still move like ants (existing bug from Phase 7 — not addressed here).

## Verify the previous phase still works
`cd frontend && npm run build`

## Next phase starts with
Fix agent-based pathing so cars exhibit fluid vehicle motion and stay strictly on roads without phasing through buildings.

## Phases Before That

# HANDOFF — Urban What-If

## Last completed phase
Phase 7+ — Disaster Polish & Multiplayer Stability

## What exists and works
- `EventPanel.tsx` / `Toolbar.tsx`: Disasters can be placed manually via grid crosshairs, supporting custom radius, intensity, and a wide variety of event types.
- `spacetimedb/src/index.ts`: Supports stacking multiple concurrent disasters in the `event` table. Backend actively expires them via `tickDisasters`.
- `App.tsx`: "Host Election" implemented to solve severe metric flickering. The oldest connected player is the implicit host, solely responsible for spawning agents, polling real-world weather, and pushing math to `updateCityStats`.
- `StatsPanel.tsx`: Gracefully accumulates penalties for overlapping disasters without oscillating or UI flickering. 

## Key decisions made that differ from SPEC.md
- Implemented "Host Election" pattern in `App.tsx` (using identity sorting) to prevent distributed feedback loops and race conditions between multiple connected clients processing simulation intervals.

## Current known issues
- Traffic visually moves like ants (checking every direction sequentially) and phases through buildings instead of sticking fluidly to the road network.
- KNOWN_FLAWS.md contains a bug where "Moving an already-moved building causes it to disappear".

## Verify the previous phase still works
`cd frontend && npm run build` 

## Next phase starts with
Fix the agent-based pathing refinement so cars exhibit fluid vehicle motion and stay strictly on roads without phasing through buildings.

## Full Summary of What Was Accomplished in This Session
The following is an exhaustive record of all fixes and features built during this long session, for context when starting the next session:
1. **Attempted Vehicle Pathing Fixes**: Initially tried to resolve car agents moving like ants, going in circles, originating strictly near Marriott Downtown, and phasing through buildings. This remains the top priority for the next session.
2. **Dynamic & Manual Disaster System**: Completely overhauled the disaster system. Replaced hardcoded death tolls with dynamic calculations based on radius. Added a massive array of new events (Heatwaves, Tech Booms, Alien Invasions, Transit Strikes, etc.). Allowed users to manually click and place disasters anywhere on the map using a color-coded target preview.
3. **Live Syncing & Stacking**: Linked disasters to dynamically and instantly impact the live traffic and population scores. Upgraded both the SpacetimeDB backend (`events` table) and React frontend (`activeEvents`) to support triggering and cleanly stacking multiple different disasters concurrently, complete with independent expiration timers.
4. **Host Election Architecture (Anti-Flicker Fix)**: Discovered and permanently resolved a critical multiplayer race condition. Previously, multiple connected users would fight to spawn/despawn cars and update the global `cityStats` when a disaster hit, causing the UI to rapidly flip-flop (the "haywire" bug). Fixed by implementing a "Host Election" pattern where the oldest connected client silently takes responsibility for background simulation math, eliminating all UI flickering and car popping.
5. **Typescript & Build Stabilization**: Resolved multiple TS compilation errors (BigInt math, missing row properties) that were causing white screen crashes, ensuring `npm run build` succeeds flawlessly.

## Phases Before That
- Phase 6+ Time Simulation (SimulationClock, playback controls, economic drift).
- Phase 5+ Building Size Inputs & Real Economic Metrics.
