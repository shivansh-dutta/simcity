import { useLayoutEffect, useMemo, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CityEdit } from '../module_bindings/types';

export type VoxelGridData = number[][][];
export type GridCell = { x: number; z: number };

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

function InstancedVoxelLayer({
  group,
  onCellClick,
}: {
  group: VoxelGroup;
  onCellClick: (cell: GridCell) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    group.instances.forEach((voxel, index) => {
      matrix.setPosition(voxel.x * VOXEL_SIZE, voxel.y * VOXEL_SIZE, voxel.z * VOXEL_SIZE);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [group.instances, matrix]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.instanceId === undefined) return;
    const voxel = group.instances[event.instanceId];
    if (voxel) onCellClick({ x: voxel.x, z: voxel.z });
  };

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
