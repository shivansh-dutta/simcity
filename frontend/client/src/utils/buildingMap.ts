import type { GridCell } from '../components/VoxelGrid';

export type BuildingFeature = {
  id?: string;
  properties?: {
    id?: string | number | null;
    name?: string | null;
    height?: number | string | null;
    levels?: number | string | null;
  };
};

export type BuildingMapPayload = {
  building_id_grid?: (number | string | null)[][];
  building_gdf?: {
    features?: BuildingFeature[];
  };
};

export type BuildingFootprint = {
  id: string;
  name: string;
  heightM: number;
  cells: GridCell[];
};

export type BuildingLookup = {
  cellToBuildingId: Map<string, string>;
  buildingsById: Map<string, BuildingFootprint>;
};

function cellKey(x: number, z: number): string {
  return `${x}_${z}`;
}

function normalizeId(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return String(Math.trunc(numeric));
  return String(value);
}

function numberValue(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function buildBuildingLookup(payload: BuildingMapPayload): BuildingLookup {
  const cellToBuildingId = new Map<string, string>();
  const buildingsById = new Map<string, BuildingFootprint>();
  const metadataById = new Map<string, Omit<BuildingFootprint, 'cells'>>();

  for (const feature of payload.building_gdf?.features ?? []) {
    const id = normalizeId(feature.properties?.id ?? feature.id);
    if (!id) continue;
    const heightM = numberValue(feature.properties?.height);
    const levels = numberValue(feature.properties?.levels);
    const existing = metadataById.get(id);
    const featureName = feature.properties?.name || '';
    metadataById.set(id, {
      id,
      name: existing?.name && !existing.name.startsWith('Building ') ? existing.name : featureName || `Building ${id}`,
      heightM: Math.max(existing?.heightM ?? 0, heightM || levels * 4),
    });
  }

  const idGrid = payload.building_id_grid ?? [];
  for (let x = 0; x < idGrid.length; x += 1) {
    const row = idGrid[x] ?? [];
    for (let z = 0; z < row.length; z += 1) {
      const id = normalizeId(row[z]);
      if (!id) continue;
      cellToBuildingId.set(cellKey(x, z), id);
      const existing = buildingsById.get(id);
      if (existing) {
        existing.cells.push({ x, z });
      } else {
        const metadata = metadataById.get(id) ?? { id, name: `Building ${id}`, heightM: 0 };
        buildingsById.set(id, { ...metadata, cells: [{ x, z }] });
      }
    }
  }

  return { cellToBuildingId, buildingsById };
}

export function getBuildingAt(lookup: BuildingLookup | null, cell: GridCell): BuildingFootprint | null {
  const id = lookup?.cellToBuildingId.get(cellKey(cell.x, cell.z));
  return id ? lookup?.buildingsById.get(id) ?? null : null;
}
