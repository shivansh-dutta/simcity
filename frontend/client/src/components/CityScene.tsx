import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import VoxelGrid, { type GridCell, type VoxelGridData } from './VoxelGrid';
import type { CityEdit, Player } from '../module_bindings/types';

const VOXEL_SIZE = 5;

type MoveSource = GridCell & { height: number };

type CitySceneProps = {
  baseGrid: VoxelGridData;
  edits: readonly CityEdit[];
  players: readonly Player[];
  selectedCell: GridCell | null;
  moveSource: MoveSource | null;
  onCellClick: (cell: GridCell) => void;
  onFpsUpdate: (fps: number) => void;
};

function PlayerCursors({ players }: { players: readonly Player[] }) {
  return (
    <group>
      {players.filter(player => player.isOnline).map(player => (
        <mesh key={player.identity} position={[player.cursorX * VOXEL_SIZE, VOXEL_SIZE * 4, player.cursorZ * VOXEL_SIZE]}>
          <sphereGeometry args={[3.4, 18, 18]} />
          <meshStandardMaterial color={player.color || '#FFD700'} emissive={player.color || '#FFD700'} emissiveIntensity={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function CellHighlight({ cell }: { cell: GridCell | null }) {
  if (!cell) return null;
  return (
    <mesh position={[cell.x * VOXEL_SIZE, VOXEL_SIZE * 0.55, cell.z * VOXEL_SIZE]}>
      <boxGeometry args={[VOXEL_SIZE * 1.12, VOXEL_SIZE * 1.12, VOXEL_SIZE * 1.12]} />
      <meshBasicMaterial color="#FFD700" wireframe transparent opacity={0.92} />
    </mesh>
  );
}

function MoveBeam({ source }: { source: MoveSource | null }) {
  if (!source) return null;
  const beamHeight = Math.max(source.height * VOXEL_SIZE + VOXEL_SIZE * 8, VOXEL_SIZE * 10);
  return (
    <mesh position={[source.x * VOXEL_SIZE, beamHeight / 2, source.z * VOXEL_SIZE]}>
      <cylinderGeometry args={[VOXEL_SIZE * 0.32, VOXEL_SIZE * 0.32, beamHeight, 18]} />
      <meshBasicMaterial color="#FFD700" transparent opacity={0.42} />
    </mesh>
  );
}

function FpsTracker({ onFpsUpdate }: { onFpsUpdate: (fps: number) => void }) {
  const frames = useRef(0);
  const lastSample = useRef(performance.now());

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    if (now - lastSample.current >= 1000) {
      onFpsUpdate(Math.round((frames.current * 1000) / (now - lastSample.current)));
      frames.current = 0;
      lastSample.current = now;
    }
  });

  return null;
}

function CameraTarget({ baseGrid }: { baseGrid: VoxelGridData }) {
  const controlsRef = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const target = useMemo(() => {
    const rows = baseGrid.length;
    const cols = baseGrid[0]?.length ?? 0;
    return new THREE.Vector3((rows * VOXEL_SIZE) / 2, VOXEL_SIZE * 8, (cols * VOXEL_SIZE) / 2);
  }, [baseGrid]);

  useEffect(() => {
    controlsRef.current?.target.copy(target);
    controlsRef.current?.update();
  }, [target]);

  return <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.1} />;
}

export default function CityScene({
  baseGrid,
  edits,
  players,
  selectedCell,
  moveSource,
  onCellClick,
  onFpsUpdate,
}: CitySceneProps) {
  return (
    <Canvas camera={{ position: [100, 120, 100], fov: 50 }} dpr={[0.75, 1]} gl={{ antialias: false }} style={{ height: '100vh', width: '100vw', background: '#101820' }}>
      <color attach="background" args={['#101820']} />
      <fog attach="fog" args={['#101820', 1150, 3600]} />
      <ambientLight intensity={1.05} />
      <hemisphereLight args={['#CFEFFF', '#30251A', 1.1]} />
      <directionalLight position={[220, 340, 180]} intensity={2.1} />
      <VoxelGrid baseGrid={baseGrid} edits={edits} onCellClick={onCellClick} />
      <PlayerCursors players={players} />
      <CellHighlight cell={selectedCell} />
      <MoveBeam source={moveSource} />
      <CameraTarget baseGrid={baseGrid} />
      <FpsTracker onFpsUpdate={onFpsUpdate} />
    </Canvas>
  );
}
