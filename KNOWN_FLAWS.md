# Known Flaws — Urban What-If

## 1. Moving an already-moved building causes it to disappear

**Status**: Unresolved  
**Severity**: Medium  
**File**: `frontend/client/src/App.tsx` — `moveWholeBuilding`, `handleCellClick`, `buildLiveBuildingLookup`

### What works
- First move: select a building → click Move → click drop target → building moves correctly to new location.
- Selecting a moved building: clicking on a building at its new (moved) position correctly selects it and shows the info panel. This is handled by `buildLiveBuildingLookup` which derives a live cell-to-building mapping from the base lookup + all CityEdit rows.

### What breaks
- Second move: select the already-moved building → click Move → click a new drop target → the building disappears from the intermediate position but does NOT appear at the new target.

### What was fixed in this session
- `handleCellClick` state machine reordered so the pending-move-drop check (STATE 2) runs BEFORE the `voxelType !== 1` filter. Previously the second click was being blocked by the type filter or re-intercepted by selection logic.
- `buildLiveBuildingLookup` added to derive a live lookup that tracks move/remove edits, so moved buildings can be re-selected at their new positions.
- Non-building voxels (types 2–5) now pass click events through silently.

### Suspected root causes to investigate
1. **Height mismatch**: `moveWholeBuilding` queries `getBuildingColumnHeight(liveCity, cell.x, cell.z)` for each cell. If `liveCity` doesn't reflect the first move's fill at the intermediate position (stale closure, timing issue), the height could default to 1, producing a nearly invisible single-voxel at the destination while clearing the full column at the source.
2. **`applyCityEdits` ordering**: The second move's edits reference cells created by the first move's `fillColumn`. If edit timestamps collide or sort incorrectly, the clear could run before the fill that creates the source voxels, producing an empty clear and a fill of height 0/1.
3. **Grid column length**: `fillColumn` caps at `column.length`. If the target column in the base grid is shorter than the building height, voxels above that length are silently dropped.
4. **`liveBuildingLookup` cell reference staleness**: The `SelectedBuilding` stored in `pendingBuildingMoveRef` holds a snapshot of cells from the lookup at selection time. If the lookup recomputes mid-flow (due to SpacetimeDB subscription update), the ref's cells could reference stale positions.

### Debugging approach for next session
- Add `console.log` inside `moveWholeBuilding` to print: `building.anchor`, `target`, `dx/dz`, each cell's `fromX/fromZ/fromHeight/toX/toZ/height`.
- Verify the `applyCityEdits` output after both moves by logging the voxel values at the target column.
- Check whether `isInsideGrid` returns false for any target coordinates.
- Check browser console for any SpacetimeDB reducer errors on the second move.

---

## 2. SpacetimeDB CLI missing from PATH

**Status**: Pre-existing, unresolved  
**Severity**: Low (local dev only)  
**Impact**: Cannot publish reducer changes from this machine. Prior reducer change removing flat disaster deltas was not published.

---

## 3. Vite large chunk warning

**Status**: Pre-existing, cosmetic  
**Severity**: Low  
**Impact**: Three.js + R3F bundle exceeds 500 kB. No functional impact. Could be fixed with code-splitting via dynamic `import()`.
