import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CityEdit } from '../module_bindings/types';

export type VoxelGridData = number[][][];
export type GridCell = { x: number; z: number; voxelType?: number };

const VOXEL_SIZE = 5;
const DENSE_CITY_BUILDING_COUNT = 350;
const TYPE_COLORS: Record<number, string> = {
  1: '#7D858B',
  2: '#16A34A',
  3: '#8B7355',
  4: '#0D69B8',
  5: '#6D4C41',
};

type VoxelInstance = GridCell & { y: number };
type VoxelGroup = { voxelType: number; color: string; instances: VoxelInstance[] };
type HeatmapBucket = { color: string; instances: VoxelInstance[] };

type VoxelGridProps = {
  baseGrid: VoxelGridData;
  edits: readonly CityEdit[];
  densityHeatmapEnabled: boolean;
  onCellClick: (cell: GridCell) => void;
  onCellHover?: (cell: GridCell | null) => void;
  ghostPreview?: { x: number; z: number; width: number; depth: number } | null;
  armedDisaster?: { type: string; intensity: number; radius: number; deathToll: number; color: string } | null;
  hoveredCell?: GridCell | null;
};

type HoveredDensity = GridCell & { count: number };

const DENSITY_RADIUS = 5;
const HEATMAP_UPDATE_RADIUS = 10;
const heatColor = new THREE.Color();
const heatA = new THREE.Color();
const heatB = new THREE.Color();

function cloneGrid(grid: VoxelGridData): VoxelGridData {
  return grid.map(row => row.map(column => column.slice()));
}

function isInsideGrid(grid: VoxelGridData, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < grid.length && z < (grid[x]?.length ?? 0);
}

function clearColumn(grid: VoxelGridData, x: number, z: number, height: number) {
  if (!isInsideGrid(grid, x, z)) return;
  const column = grid[x][z];
  for (let y = 0; y < Math.min(Math.max(1, height), column.length); y += 1) {
    column[y] = 0;
  }
}

function fillColumn(
  grid: VoxelGridData,
  x: number,
  z: number,
  height: number,
  voxelType: number
) {
  if (!isInsideGrid(grid, x, z)) return;
  const column = grid[x][z];
  for (let y = 0; y < Math.min(Math.max(1, height), column.length); y += 1) {
    column[y] = voxelType;
  }
}

export function applyCityEdits(baseGrid: VoxelGridData, edits: readonly CityEdit[]) {
  const liveGrid = cloneGrid(baseGrid);
  const orderedEdits = [...edits].sort((a, b) => Number(a.createdAt - b.createdAt));

  for (const edit of orderedEdits) {
    if (edit.editType === 'remove') {
      clearColumn(liveGrid, edit.fromX, edit.fromZ, edit.fromHeight);
    } else if (edit.editType === 'move') {
      clearColumn(liveGrid, edit.fromX, edit.fromZ, edit.fromHeight);
      fillColumn(liveGrid, edit.toX, edit.toZ, edit.height, edit.voxelType);
    } else if (edit.editType === 'place' || edit.editType === 'zone_change') {
      fillColumn(liveGrid, edit.toX, edit.toZ, edit.height, edit.voxelType);
    }
  }

  return { liveGrid };
}

function voxelAt(grid: VoxelGridData, row: number, col: number, level: number) {
  return grid[row]?.[col]?.[level] ?? 0;
}

function isSurfaceVoxel(grid: VoxelGridData, row: number, col: number, level: number) {
  return (
    voxelAt(grid, row + 1, col, level) === 0 ||
    voxelAt(grid, row - 1, col, level) === 0 ||
    voxelAt(grid, row, col + 1, level) === 0 ||
    voxelAt(grid, row, col - 1, level) === 0 ||
    voxelAt(grid, row, col, level + 1) === 0 ||
    voxelAt(grid, row, col, level - 1) === 0
  );
}

function groupVoxels(liveGrid: VoxelGridData): VoxelGroup[] {
  const groups = new Map<number, VoxelInstance[]>();

  for (let row = 0; row < liveGrid.length; row += 1) {
    for (let col = 0; col < liveGrid[row].length; col += 1) {
      const column = liveGrid[row][col];
      for (let level = 0; level < column.length; level += 1) {
        const voxelType = column[level];
        if (voxelType === 0 || !isSurfaceVoxel(liveGrid, row, col, level)) continue;
        const instances = groups.get(voxelType) ?? [];
        instances.push({ x: row, z: col, y: level });
        groups.set(voxelType, instances);
      }
    }
  }

  return Array.from(groups.entries()).map(([voxelType, instances]) => ({
    voxelType,
    color: TYPE_COLORS[voxelType] ?? '#A7A7A7',
    instances,
  }));
}

function cellKey(x: number, z: number): string {
  return `${x}_${z}`;
}

function countBuildingVoxelsNear(grid: VoxelGridData, x: number, z: number): number {
  let count = 0;
  const radiusSquared = DENSITY_RADIUS * DENSITY_RADIUS;
  const minX = Math.max(0, x - DENSITY_RADIUS);
  const maxX = Math.min(grid.length - 1, x + DENSITY_RADIUS);

  for (let row = minX; row <= maxX; row += 1) {
    const minZ = Math.max(0, z - DENSITY_RADIUS);
    const maxZ = Math.min((grid[row]?.length ?? 1) - 1, z + DENSITY_RADIUS);
    for (let col = minZ; col <= maxZ; col += 1) {
      const dx = row - x;
      const dz = col - z;
      if (dx * dx + dz * dz > radiusSquared) continue;
      for (const voxelType of grid[row]?.[col] ?? []) {
        if (voxelType === 1) count += 1;
      }
    }
  }

  return count;
}

function heatmapColor(normalizedDensity: number): THREE.Color {
  const value = Math.max(0, Math.min(1, normalizedDensity));
  if (value <= 0.3) {
    heatA.set('#1a237e');
    heatB.set('#4CAF50');
    return heatColor.copy(heatA).lerp(heatB, value / 0.3);
  }
  if (value <= 0.6) {
    heatA.set('#4CAF50');
    heatB.set('#FF9800');
    return heatColor.copy(heatA).lerp(heatB, (value - 0.3) / 0.3);
  }
  heatA.set('#FF9800');
  heatB.set('#F44336');
  return heatColor.copy(heatA).lerp(heatB, (value - 0.6) / 0.4);
}

function buildDensityCounts(grid: VoxelGridData, groundInstances: VoxelInstance[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cell of groundInstances) {
    counts.set(cellKey(cell.x, cell.z), countBuildingVoxelsNear(grid, cell.x, cell.z));
  }
  return counts;
}

function densityScaleMax(counts: Map<string, number>): number {
  const values = [...counts.values()].sort((a, b) => a - b);
  if (values.length === 0) return 1;
  return Math.max(1, Math.min(DENSE_CITY_BUILDING_COUNT, values[Math.floor((values.length - 1) * 0.95)]));
}

function changedCellsForEdit(edit: CityEdit): GridCell[] {
  const cells: GridCell[] = [];
  if (edit.editType === 'remove' || edit.editType === 'move') {
    cells.push({ x: edit.fromX, z: edit.fromZ });
  }
  if (edit.editType === 'place' || edit.editType === 'zone_change' || edit.editType === 'move') {
    cells.push({ x: edit.toX, z: edit.toZ });
  }
  return cells;
}

function updateDensityCountsNearEdits(
  counts: Map<string, number>,
  grid: VoxelGridData,
  groundKeys: Set<string>,
  edits: readonly CityEdit[]
): Map<string, number> {
  const next = new Map(counts);
  for (const edit of edits) {
    for (const changed of changedCellsForEdit(edit)) {
      for (let x = changed.x - HEATMAP_UPDATE_RADIUS; x <= changed.x + HEATMAP_UPDATE_RADIUS; x += 1) {
        for (let z = changed.z - HEATMAP_UPDATE_RADIUS; z <= changed.z + HEATMAP_UPDATE_RADIUS; z += 1) {
          const key = cellKey(x, z);
          if (!groundKeys.has(key)) continue;
          next.set(key, countBuildingVoxelsNear(grid, x, z));
        }
      }
    }
  }
  return next;
}

function buildHeatmapBuckets(
  instances: VoxelInstance[],
  densityCounts: Map<string, number>,
  maxDensityCount: number
): HeatmapBucket[] {
  const buckets = new Map<string, HeatmapBucket>();
  const scale = Math.max(1, maxDensityCount);

  for (const voxel of instances) {
    const count = densityCounts.get(cellKey(voxel.x, voxel.z)) ?? 0;
    const normalized = Math.max(0, Math.min(1, count / scale));
    const bucketValue = Math.round(normalized * 12) / 12;
    const color = `#${heatmapColor(bucketValue).getHexString()}`;
    const bucket = buckets.get(color) ?? { color, instances: [] };
    bucket.instances.push(voxel);
    buckets.set(color, bucket);
  }

  return [...buckets.values()];
}

function createBuildingWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create building texture canvas');

  context.fillStyle = '#596168';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = 'rgba(255, 255, 255, 0.12)';
  context.fillRect(0, 0, 64, 5);
  context.fillRect(0, 59, 64, 5);

  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const isDark = Math.random() < 0.3;
      context.fillStyle = isDark ? '#252A2E' : col % 2 === 0 ? '#FFF4B8' : '#EAF7FF';
      context.fillRect(8 + col * 14, 7 + row * 10, 7, 5);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipMapNearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createGroundFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create ground-floor texture canvas');

  context.fillStyle = '#586067';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = '#1F252A';
  context.fillRect(23, 30, 18, 28);
  context.fillStyle = '#C7A05B';
  context.fillRect(37, 43, 2, 2);
  context.fillStyle = '#F2E8B8';
  context.fillRect(8, 18, 8, 7);
  context.fillRect(48, 18, 8, 7);
  context.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  context.strokeRect(23, 30, 18, 28);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipMapNearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createRoofTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create roof texture canvas');

  context.fillStyle = '#747D84';
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = 'rgba(255, 255, 255, 0.1)';
  context.fillRect(8, 8, 48, 4);
  context.fillRect(8, 52, 48, 4);
  context.fillStyle = '#525B62';
  context.fillRect(18, 20, 12, 12);
  context.fillRect(38, 34, 10, 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipMapNearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function useVoxelMatrices(instances: VoxelInstance[]) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    instances.forEach((voxel, index) => {
      matrix.setPosition(voxel.x * VOXEL_SIZE, voxel.y * VOXEL_SIZE, voxel.z * VOXEL_SIZE);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [instances, matrix]);

  return meshRef;
}

function useCellClick(instances: VoxelInstance[], voxelType: number, onCellClick: (cell: GridCell) => void) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId === undefined) return;
    const voxel = instances[event.instanceId];
    if (voxel) onCellClick({ x: voxel.x, z: voxel.z, voxelType });
  };

  return handleClick;
}

function HeatmapBucketMesh({ bucket }: { bucket: HeatmapBucket }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const disableRaycast = () => null;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    bucket.instances.forEach((voxel, index) => {
      matrix.setPosition(voxel.x * VOXEL_SIZE, voxel.y * VOXEL_SIZE + VOXEL_SIZE * 0.64, voxel.z * VOXEL_SIZE);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [bucket.instances, matrix]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, bucket.instances.length]} raycast={disableRaycast}>
      <boxGeometry args={[VOXEL_SIZE * 1.12, VOXEL_SIZE * 0.22, VOXEL_SIZE * 1.12]} />
      <meshBasicMaterial color={bucket.color} transparent opacity={0.78} depthWrite={false} />
    </instancedMesh>
  );
}

function GroundHeatmapOverlay({
  instances,
  densityCounts,
  maxDensityCount,
}: {
  instances: VoxelInstance[];
  densityCounts: Map<string, number>;
  maxDensityCount: number;
}) {
  const buckets = useMemo(
    () => buildHeatmapBuckets(instances, densityCounts, maxDensityCount),
    [densityCounts, instances, maxDensityCount]
  );

  return (
    <group>
      {buckets.map(bucket => (
        <HeatmapBucketMesh key={bucket.color} bucket={bucket} />
      ))}
    </group>
  );
}

function GroundLayer({
  group,
  densityHeatmapEnabled,
  densityCounts,
  maxDensityCount,
  onCellClick,
  onDensityHover,
  onCellHover,
}: {
  group: VoxelGroup;
  densityHeatmapEnabled: boolean;
  densityCounts: Map<string, number>;
  maxDensityCount: number;
  onCellClick: (cell: GridCell) => void;
  onDensityHover: (density: HoveredDensity | null) => void;
  onCellHover?: (cell: GridCell | null) => void;
}) {
  const meshRef = useVoxelMatrices(group.instances);
  const handleClick = useCellClick(group.instances, group.voxelType, onCellClick);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    if (event.instanceId === undefined) return;
    event.stopPropagation();
    const voxel = group.instances[event.instanceId];
    if (!voxel) return;
    if (densityHeatmapEnabled) {
      onDensityHover({ x: voxel.x, z: voxel.z, count: densityCounts.get(cellKey(voxel.x, voxel.z)) ?? 0 });
    }
    if (onCellHover) {
      onCellHover({ x: voxel.x, z: voxel.z, voxelType: group.voxelType });
    }
  };

  const handlePointerOut = () => {
    if (densityHeatmapEnabled) onDensityHover(null);
    if (onCellHover) onCellHover(null);
  };

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, group.instances.length]} onClick={handleClick} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
        <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
        <meshBasicMaterial color={group.color} />
      </instancedMesh>
      {densityHeatmapEnabled && <GroundHeatmapOverlay instances={group.instances} densityCounts={densityCounts} maxDensityCount={maxDensityCount} />}
    </group>
  );
}

function BuildingFacadeMesh({
  instances,
  voxelType,
  texture,
  color,
  emissive,
  onCellClick,
}: {
  instances: VoxelInstance[];
  voxelType: number;
  texture: THREE.Texture;
  color: string;
  emissive: string;
  onCellClick: (cell: GridCell) => void;
}) {
  const meshRef = useVoxelMatrices(instances);
  const handleClick = useCellClick(instances, voxelType, onCellClick);

  if (instances.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]} onClick={handleClick}>
      <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
      <meshLambertMaterial map={texture} color={color} emissive={emissive} emissiveIntensity={0.45} />
    </instancedMesh>
  );
}

function BuildingLayer({
  instances,
  onCellClick,
}: {
  instances: VoxelInstance[];
  onCellClick: (cell: GridCell) => void;
}) {
  const texture = useMemo(() => createBuildingWindowTexture(), []);
  const groundFloorTexture = useMemo(() => createGroundFloorTexture(), []);
  const roofTexture = useMemo(() => createRoofTexture(), []);
  const groundFloorInstances = useMemo(() => instances.filter(voxel => voxel.y <= 1), [instances]);
  const roofInstances = useMemo(() => {
    const highestByColumn = new Map<string, VoxelInstance>();
    for (const voxel of instances) {
      const key = `${voxel.x}:${voxel.z}`;
      const existing = highestByColumn.get(key);
      if (!existing || voxel.y > existing.y) highestByColumn.set(key, voxel);
    }
    return Array.from(highestByColumn.values());
  }, [instances]);
  const roofKeys = useMemo(
    () => new Set(roofInstances.map(voxel => `${voxel.x}:${voxel.z}:${voxel.y}`)),
    [roofInstances]
  );
  const normalInstances = useMemo(
    () => instances.filter(voxel => voxel.y > 1 && voxel.y <= 10 && !roofKeys.has(`${voxel.x}:${voxel.z}:${voxel.y}`)),
    [instances, roofKeys]
  );
  const tallInstances = useMemo(
    () => instances.filter(voxel => voxel.y > 10 && !roofKeys.has(`${voxel.x}:${voxel.z}:${voxel.y}`)),
    [instances, roofKeys]
  );

  return (
    <group>
      <BuildingFacadeMesh instances={groundFloorInstances} voxelType={1} texture={groundFloorTexture} color="#F0F2F0" emissive="#4A514E" onCellClick={onCellClick} />
      <BuildingFacadeMesh instances={normalInstances} voxelType={1} texture={texture} color="#E8EEF2" emissive="#56616A" onCellClick={onCellClick} />
      <BuildingFacadeMesh instances={tallInstances} voxelType={1} texture={texture} color="#AEB8C0" emissive="#3F4A52" onCellClick={onCellClick} />
      <BuildingFacadeMesh instances={roofInstances} voxelType={1} texture={roofTexture} color="#C1C7C8" emissive="#30373A" onCellClick={onCellClick} />
    </group>
  );
}

function InstancedVoxelLayer({
  group,
  densityHeatmapEnabled,
  densityCounts,
  maxDensityCount,
  onCellClick,
  onDensityHover,
  onCellHover,
}: {
  group: VoxelGroup;
  densityHeatmapEnabled: boolean;
  densityCounts: Map<string, number>;
  maxDensityCount: number;
  onCellClick: (cell: GridCell) => void;
  onDensityHover: (density: HoveredDensity | null) => void;
  onCellHover?: (cell: GridCell | null) => void;
}) {
  const meshRef = useVoxelMatrices(group.instances);
  const handleClick = useCellClick(group.instances, group.voxelType, onCellClick);

  if (group.voxelType === 1) {
    return <BuildingLayer instances={group.instances} onCellClick={onCellClick} />;
  }

  if (group.voxelType === 3) {
    return (
      <GroundLayer
        group={group}
        densityHeatmapEnabled={densityHeatmapEnabled}
        densityCounts={densityCounts}
        maxDensityCount={maxDensityCount}
        onCellClick={onCellClick}
        onDensityHover={onDensityHover}
        onCellHover={onCellHover}
      />
    );
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, group.instances.length]} onClick={handleClick}>
      <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
      <meshBasicMaterial color={group.color} />
    </instancedMesh>
  );
}

function CityBoundaryApron({ grid }: { grid: VoxelGridData }) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const width = rows * VOXEL_SIZE;
  const depth = cols * VOXEL_SIZE;
  const centerX = Math.max(0, ((rows - 1) * VOXEL_SIZE) / 2);
  const centerZ = Math.max(0, ((cols - 1) * VOXEL_SIZE) / 2);
  const apron = 250;
  const strip = 80;
  const waterWidth = width + apron * 2;
  const waterDepth = depth + apron * 2;
  const shoreWidth = width + strip;
  const shoreDepth = depth + strip;
  const disableRaycast = () => null;

  return (
    <group>
      <mesh raycast={disableRaycast} position={[centerX, -VOXEL_SIZE * 0.7, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[waterWidth, waterDepth]} />
        <meshBasicMaterial color="#2F9BDA" side={THREE.DoubleSide} />
      </mesh>
      <mesh raycast={disableRaycast} position={[centerX, -VOXEL_SIZE * 0.58, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[shoreWidth, shoreDepth]} />
        <meshBasicMaterial color="#8F8065" side={THREE.DoubleSide} />
      </mesh>
      <mesh raycast={disableRaycast} position={[centerX, -VOXEL_SIZE * 0.46, -VOXEL_SIZE / 2 - strip / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[shoreWidth, strip]} />
        <meshBasicMaterial color="#6E8F87" transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh raycast={disableRaycast} position={[centerX, -VOXEL_SIZE * 0.46, (cols - 1) * VOXEL_SIZE + VOXEL_SIZE / 2 + strip / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[shoreWidth, strip]} />
        <meshBasicMaterial color="#6E8F87" transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh raycast={disableRaycast} position={[-VOXEL_SIZE / 2 - strip / 2, -VOXEL_SIZE * 0.46, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[strip, shoreDepth]} />
        <meshBasicMaterial color="#6E8F87" transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh raycast={disableRaycast} position={[(rows - 1) * VOXEL_SIZE + VOXEL_SIZE / 2 + strip / 2, -VOXEL_SIZE * 0.46, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[strip, shoreDepth]} />
        <meshBasicMaterial color="#6E8F87" transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function GhostPreviewMesh({ preview }: { preview: { x: number; z: number; width: number; depth: number } | null }) {
  if (!preview) return null;
  const centerX = (preview.x + (preview.width - 1) / 2) * VOXEL_SIZE;
  const centerZ = (preview.z + (preview.depth - 1) / 2) * VOXEL_SIZE;
  const sizeX = preview.width * VOXEL_SIZE + 0.2;
  const sizeZ = preview.depth * VOXEL_SIZE + 0.2;
  
  return (
    <mesh position={[centerX, VOXEL_SIZE * 0.55, centerZ]}>
      <boxGeometry args={[sizeX, VOXEL_SIZE * 1.12, sizeZ]} />
      <meshBasicMaterial color="#FFD700" transparent opacity={0.6} />
    </mesh>
  );
}

function EventRadiusPreviewMesh({ disaster, cell }: { disaster: { type: string; radius: number; color: string } | null, cell: GridCell | null }) {
  if (!disaster || !cell) return null;
  
  const centerX = cell.x * VOXEL_SIZE;
  const centerZ = cell.z * VOXEL_SIZE;
  const radiusUnits = disaster.radius * VOXEL_SIZE;
  
  return (
    <mesh position={[centerX, 0, centerZ]}>
      <cylinderGeometry args={[radiusUnits, radiusUnits, VOXEL_SIZE * 40, 32]} />
      <meshBasicMaterial color={disaster.color} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function VoxelGrid({ baseGrid, edits, densityHeatmapEnabled, ghostPreview, armedDisaster, hoveredCell: externalHoveredCell, onCellClick, onCellHover }: VoxelGridProps) {
  const { liveGrid } = useMemo(() => applyCityEdits(baseGrid, edits), [baseGrid, edits]);
  const voxelGroups = useMemo(() => groupVoxels(liveGrid), [liveGrid]);
  const groundInstances = useMemo(() => voxelGroups.find(group => group.voxelType === 3)?.instances ?? [], [voxelGroups]);
  const groundKeys = useMemo(() => new Set(groundInstances.map(cell => cellKey(cell.x, cell.z))), [groundInstances]);
  const [densityCounts, setDensityCounts] = useState<Map<string, number>>(() => new Map());
  const [hoveredDensity, setHoveredDensity] = useState<HoveredDensity | null>(null);
  const previousEditIdsRef = useRef<Set<string>>(new Set());
  const heatmapWasEnabledRef = useRef(false);
  const maxDensityCount = useMemo(() => densityScaleMax(densityCounts), [densityCounts]);

  useEffect(() => {
    if (!densityHeatmapEnabled) {
      heatmapWasEnabledRef.current = false;
      setHoveredDensity(null);
      return;
    }

    const currentEditIds = new Set(edits.map(edit => edit.editId));
    const previousEditIds = previousEditIdsRef.current;
    const firstEnable = !heatmapWasEnabledRef.current;
    const resetHeatmap =
      firstEnable ||
      currentEditIds.size < previousEditIds.size ||
      [...previousEditIds].some(editId => !currentEditIds.has(editId));
    const newEdits = edits.filter(edit => !previousEditIds.has(edit.editId));

    heatmapWasEnabledRef.current = true;
    previousEditIdsRef.current = currentEditIds;

    setDensityCounts(previous => {
      if (resetHeatmap || previous.size === 0) return buildDensityCounts(liveGrid, groundInstances);
      if (newEdits.length === 0) return previous;
      return updateDensityCountsNearEdits(previous, liveGrid, groundKeys, newEdits);
    });
  }, [densityHeatmapEnabled, edits, groundInstances, groundKeys, liveGrid]);

  return (
    <group>
      <CityBoundaryApron grid={liveGrid} />
      {voxelGroups.map(group => (
        <InstancedVoxelLayer
          key={group.voxelType}
          group={group}
          densityHeatmapEnabled={densityHeatmapEnabled}
          densityCounts={densityCounts}
          maxDensityCount={maxDensityCount}
          onCellClick={onCellClick}
          onDensityHover={setHoveredDensity}
          onCellHover={onCellHover}
        />
      ))}
      <GhostPreviewMesh preview={ghostPreview ?? null} />
      <EventRadiusPreviewMesh disaster={armedDisaster ?? null} cell={externalHoveredCell ?? null} />
      {densityHeatmapEnabled && hoveredDensity && (
        <Html position={[hoveredDensity.x * VOXEL_SIZE, VOXEL_SIZE * 3, hoveredDensity.z * VOXEL_SIZE]} center>
          <div className="density-label">Density: {hoveredDensity.count} buildings nearby</div>
        </Html>
      )}
    </group>
  );
}
