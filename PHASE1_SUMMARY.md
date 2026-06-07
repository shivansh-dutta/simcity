# Phase 1 Summary - Urban What-If

## What we completed
- Read `AGENTS.md` and `SPEC.md` before making changes.
- Created the Phase 1 scaffold:
  - `backend/requirements.txt`
  - `backend/generate_city.py`
- Generated the original Lower Manhattan voxel grid with:
  - SW `(-74.0210, 40.7040)`
  - NE `(-74.0040, 40.7140)`
  - `meshsize=5`
  - `building_source='OpenStreetMap'`
  - `land_cover_source='OpenStreetMap'`
- Confirmed VoxCity returned 8 values and converted numpy arrays with `.tolist()` before saving.
- Saved the city data to `backend/data/manhattan.json`.
- Verified the generated grid shape printed as `(287, 222, 110)`.

## Later extension attempt
- Briefly updated `generate_city.py` to try a larger bounding box:
  - SW `(-74.0210, 40.6980)`
  - NE `(-73.9400, 40.7680)`
- Added a chunking pass that would have written 50x50 tile files to:
  - `backend/data/chunks/{row}_{col}.json`
  - `backend/data/chunk_index.json`
- That expanded-map run was too heavy in this environment and was not kept.

## Final state
- Reverted the repo back to the pre-expansion commit.
- `backend/generate_city.py` is back to the original Phase 1 bounds.
- The workspace is clean and the original generator still runs successfully.

## Notes
- `conda` was not available in this workspace, so the requested conda environment could not be created here.
- VoxCity required a temporary runtime package install and a lightweight `osgeo` shim to run offline in this environment.
