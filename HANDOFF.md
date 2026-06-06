# HANDOFF - Urban What-If

## Last completed phase
Phase 5+ - Whole-Building Selection And Footprint Edits

## What exists and works
- frontend/client/src/utils/buildingMap.ts: builds cell-to-building and building-to-footprint maps from building_id_grid/building_gdf.
- frontend/client/src/components/VoxelGrid.tsx: clicks include voxel type so only building voxels are interactive.
- frontend/client/src/App.tsx: selects full building footprints and applies move/remove across all footprint cells.
- frontend/client/src/components/CityScene.tsx: highlights full footprints and shows a readable building info panel.

## Key decisions made that differ from SPEC.md
- Whole-building move/remove uses existing per-cell reducers instead of adding array reducer args.

## Current known issues
- Vite still warns that the Three/R3F bundle chunk is larger than 500 kB.

## Verify the previous phase still works
cd frontend && npm run build

## Next phase starts with
Optionally add direct search/camera focus for specific landmark testing like One World Trade Center.

##Phases Before That
- Phase 5 multiplayer sync, full reset, and visual polish were completed before this session.
