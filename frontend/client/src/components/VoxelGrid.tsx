import { useLayoutEffect, useMemo, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CityEdit } from '../module_bindings/types';

export type VoxelGridData = number[][][];
export type GridCell = { x: number; z: number; voxelType?: number };

const VOXEL_SIZE = 5;
const TYPE_COLORS: Record<number, string> = {
  1: '#7D858B',
  2: '#16A34A',
  3: '#8B7355',
  4: '#0D69B8',
  5: '#6D4C41',
};

type VoxelInstance = GridCell & { y: number };
type VoxelGroup = { voxelType: number; color: string; instances: VoxelInstance[] };

type VoxelGridProps = {
  baseGrid: VoxelGridData;
  edits: readonly CityEdit[];
  onCellClick: (cell: GridCell) => void;
};

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
  onCellClick,
}: {
  group: VoxelGroup;
  onCellClick: (cell: GridCell) => void;
}) {
  const meshRef = useVoxelMatrices(group.instances);
  const handleClick = useCellClick(group.instances, group.voxelType, onCellClick);

  if (group.voxelType === 1) {
    return <BuildingLayer instances={group.instances} onCellClick={onCellClick} />;
  }

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, group.instances.length]} onClick={handleClick}>
      <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
      <meshBasicMaterial color={group.color} />
    </instancedMesh>
  );
}

export default function VoxelGrid({ baseGrid, edits, onCellClick }: VoxelGridProps) {
  const { liveGrid } = useMemo(() => applyCityEdits(baseGrid, edits), [baseGrid, edits]);
  const voxelGroups = useMemo(() => groupVoxels(liveGrid), [liveGrid]);

  return (
    <group>
      {voxelGroups.map(group => (
        <InstancedVoxelLayer key={group.voxelType} group={group} onCellClick={onCellClick} />
      ))}
    </group>
  );
}
