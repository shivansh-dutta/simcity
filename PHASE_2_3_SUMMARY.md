# Phase 2 and 3 Summary - Urban What-If

## Scope
- Phase 2: FastAPI backend serving generated Manhattan city JSON.
- Phase 3: SpacetimeDB project bootstrap, schema/reducers, Maincloud publish, and TypeScript bindings.
- No Phase 4 frontend components were implemented in this work.

## Phase 2 - FastAPI Server
- Created `backend/main.py`.
- Added a FastAPI app with CORS allowing all origins.
- Loaded `backend/data/manhattan.json` once at application startup.
- Added `GET /city`, which returns the cached Manhattan voxel JSON.
- Added `GET /health`, which returns `{"status": "ok"}`.
- Added recursive JSON conversion support for numpy arrays/scalars using `.tolist()` and scalar `.item()`.

## Phase 2 Verification
- Ran Uvicorn from `backend/`.
- Verified `GET /health` returned `{"status":"ok"}`.
- Verified `GET /city` returned JSON with `shape: [287, 222, 110]`.
- Confirmed the shape field has 3 numeric values.

## Phase 3 - SpacetimeDB Module
- Installed the SpacetimeDB CLI because `spacetime` was not initially on PATH.
- CLI installed at `C:\Users\shiva\AppData\Local\SpacetimeDB\spacetime.exe`.
- Bootstrapped the SpacetimeDB React TypeScript template under `frontend/`.
- Created `frontend/spacetimedb/src/index.ts` with all SPEC tables and reducers.
- Used server imports only from `spacetimedb/server`.
- Used `ctx.sender.toHexString()` for player identity in reducers.
- Made every table public with `{ public: true }`.

## Phase 3 Tables
- `CityEdit`
- `Player`
- `CityStats`
- `WeatherState`
- `EconomicData`
- `TradeOffer`
- `Event`

## Phase 3 Reducers
- `joinCity`
- `moveCursor`
- `leaveCity`
- `addScore`
- `removeBuilding`
- `placeBuilding`
- `moveBuilding`
- `changeZone`
- `undoLastEdit`
- `triggerDisaster`
- `clearDisaster`
- `updateCityStats`
- `updateWeather`
- `updateEconomicData`
- `createTradeOffer`
- `respondToTrade`

## Phase 3 Verification
- Ran `spacetime build --module-path spacetimedb`.
- Confirmed output: `Build finished successfully.`
- Published `urban-whatif` to Maincloud.
- Confirmed `spacetime list --server maincloud` shows `urban-whatif`.
- Maincloud identity: `c200469931cdb48cefca2179d2c41276e93ea1f825e9ebbcb79d6bb2fbc964fb`.
- Generated bindings with `spacetime generate --lang typescript --out-dir client/src/module_bindings`.
- Confirmed generated `.ts` files exist in `frontend/client/src/module_bindings/`.

## Generated Bindings
- Table bindings were generated for all 7 tables.
- Reducer bindings were generated for all 16 reducers.
- Shared exports were generated in `index.ts`, `types.ts`, `types/reducers.ts`, and `types/procedures.ts`.

## Deviations and Notes
- `npx spacetime dev urban-whatif --template react` failed because npm could not determine an executable.
- `spacetime dev urban-whatif --template react` also failed in this non-interactive shell.
- The installed SpacetimeDB CLI rejected `--template react`; `react-ts` was used instead.
- The installed SpacetimeDB CLI rejected legacy `--maincloud`; `--server maincloud` was used instead.
- Maincloud publishing initially failed with `401 Unauthorized` until login was completed.
- Current PowerShell sessions may need to call the CLI by absolute path until PATH refreshes.

## Extension Notes For Later
- Phase 4 should use the generated bindings from `frontend/client/src/module_bindings/`.
- Do not manually edit files inside `module_bindings/`; regenerate them from the SpacetimeDB module.
- If `frontend/spacetimedb/src/index.ts` changes, rerun publish and generate bindings.
- If SpacetimeDB publish reports breaking schema changes, avoid destructive delete-data flags unless resetting all game state is intentional.
- Phase 4 still needs the React app structure aligned around `frontend/client/` before building components.
