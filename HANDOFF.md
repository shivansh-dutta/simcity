# HANDOFF — Urban What-If

## Last completed phase
Phase 5+ — Building Size Inputs & Real Economic Metrics

## What exists and works
- Toolbar.tsx: Supports BuildingDimensions inputs (Width, Depth, Height).
- VoxelGrid.tsx: Renders a GhostPreviewMesh for add building mode and tracks pointer over cells.
- App.tsx: summarizeCity calculates real GDP and population based on base rates and total voxel volume. Stats sync immediately on edit.
- StatsPanel.tsx: Displays formatted GDP and Unemployment.
- Build verified: app runs and React fast refresh is active.

## Key decisions made that differ from SPEC.md
- Used onPointerOver instead of onPointerMove to trigger cell hovers on the GroundLayer.

## Current known issues
- KNOWN_FLAWS.md contains a bug where "Moving an already-moved building causes it to disappear".

## Verify the previous phase still works
npm run build (from frontend/)

## Next phase starts with
Fix the "Disappearing Building" bug when moving an already moved building.

## Phases Before That
- Phase 5+ density heatmap overlay, Phase 5 multiplayer sync, full reset, simulation fixes, visual polish, and whole-building selection.
