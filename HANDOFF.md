# HANDOFF - Urban What-If

## Last completed phase
Phase 5 - Core Interactions plus Full Reset

## What exists and works
- frontend/client/src: Vite now serves the restored Urban What-If city app, not the starter SpacetimeDB sample.
- SpacetimeDB Maincloud: urban-whatif was republished with resetCity/reset_city.
- localhost:5173: browser-verified with city canvas, panels, toolbar, and no console errors.

## Key decisions made that differ from SPEC.md
- None.

## Current known issues
- Used `spacetime publish --module-path spacetimedb --server maincloud urban-whatif` equivalent because CLI rejects AGENTS `--maincloud`.
- Vite still warns that the Three/R3F bundle chunk is larger than 500 kB.

## Verify the previous phase still works
cd frontend && npm run build

## Next phase starts with
Open two real browser tabs/devices and verify move/remove/reset sync across both clients.

##Phases Before That
- Previous handoff: Full Reset works; two-tab visual sync still needs real browser verification.
