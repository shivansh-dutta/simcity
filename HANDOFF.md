# HANDOFF - Urban What-If

## Last completed phase
Phase 3 - SpacetimeDB Module

## What exists and works
- `frontend/spacetimedb/src/index.ts`: all SPEC tables/reducers build successfully.
- `urban-whatif`: published on Maincloud, identity `c200469931cdb48cefca2179d2c41276e93ea1f825e9ebbcb79d6bb2fbc964fb`.
- `frontend/client/src/module_bindings/`: generated TypeScript bindings are present.

## Key decisions made that differ from SPEC.md
- Used template `react-ts`; CLI rejected `--template react`.
- Used `--server maincloud`; CLI 2.4.1 rejected legacy `--maincloud`.

## Current known issues
- None

## Verify the previous phase still works
cd frontend && spacetime list --server maincloud && spacetime generate --lang typescript --out-dir client/src/module_bindings

## Next phase starts with
Build Phase 4 React frontend components and render the voxel city.

---

# HANDOFF - Urban What-If

## Last completed phase
Phase 2 - FastAPI Server

## What exists and works
- `backend/data/manhattan.json`: generated Lower Manhattan voxel data is present and readable.
- `backend/main.py`: FastAPI app loads the city JSON at startup and serves `/city` and `/health`.

## Key decisions made that differ from SPEC.md
- None

## Current known issues
- None

## Verify the previous phase still works
python backend/generate_city.py

## Next phase starts with
Write `frontend/spacetimedb/src/index.ts` with all tables and reducers from `SPEC.md`.

---

# Urban What-If - Phase 1 Handoff

## Status
- Phase 1 is complete.
- `backend/data/manhattan.json` exists and contains the generated Lower Manhattan voxel grid.

## What Was Done
- Read `AGENTS.md` and `SPEC.md` before editing anything.
- Created the Phase 1 files:
  - `backend/requirements.txt`
  - `backend/generate_city.py`
- Ran the VoxCity generator for the target area:
  - SW `(-74.0210, 40.7040)`
  - NE `(-74.0040, 40.7140)`
  - mesh size `5`
- Used `building_source='OpenStreetMap'` and `land_cover_source='OpenStreetMap'`.
- Destructured the VoxCity return into 8 values in the generator script.
- Converted numpy grids with `.tolist()` before saving JSON.
- Saved the output to `backend/data/manhattan.json`.

## Verification
- Printed grid shape:
  - `(287, 222, 110)`
- Confirmed JSON output exists at:
  - `backend/data/manhattan.json`

## Notes
- `conda` was not available in this environment, so the requested conda environment could not be created here.
- VoxCity required a temporary runtime package install to run successfully in this workspace.
- VoxCity also created extra files in `output/` during generation:
  - `output/dataset-links.csv`
  - `output/NorthAmerica_032010110.gz`
  - `output/voxcity.h5`

## Next Step
- Phase 2: build `backend/main.py` for the FastAPI city endpoint.
