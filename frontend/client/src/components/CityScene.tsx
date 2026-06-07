import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import VoxelGrid, { type GridCell, type VoxelGridData } from './VoxelGrid';
import AgentLayer from './AgentLayer';
import type { CityEdit, Player, SimulationClock } from '../module_bindings/types';
import type { BuildingFootprint } from '../utils/buildingMap';

const VOXEL_SIZE = 5;

type MoveSource = GridCell & { height: number };
type SelectedBuilding = BuildingFootprint & { center: GridCell; heightLevels: number };

type CitySceneProps = {
  baseGrid: VoxelGridData;
  edits: readonly CityEdit[];
  players: readonly Player[];
  selectedBuilding: SelectedBuilding | null;
  moveSource: MoveSource | null;
  ghostPreview: { x: number; z: number; width: number; depth: number } | null;
  armedDisaster: { type: string; intensity: number; radius: number; deathToll: number; color: string } | null;
  hoveredCell: GridCell | null;
  densityHeatmapEnabled: boolean;
  currentIdentity: string | null;
  onCellClick: (cell: GridCell) => void;
  onCellHover?: (cell: GridCell | null) => void;
  onMoveSelected: () => void;
  onRemoveSelected: () => void;
  onCancelSelection: () => void;
  onFpsUpdate: (fps: number) => void;
  agentsVisible: boolean;
  clock: SimulationClock | null;
};

function PlayerCursor({ player }: { player: Player }) {
  const sphereRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (sphereRef.current) {
      const scale = 1 + Math.sin(clock.elapsedTime * 2) * 0.08;
      sphereRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      <mesh
        ref={sphereRef}
        position={[player.cursorX * VOXEL_SIZE, VOXEL_SIZE * 3, player.cursorZ * VOXEL_SIZE]}
      >
        <sphereGeometry args={[3.4, 18, 18]} />
        <meshStandardMaterial
          color={player.color || '#FFD700'}
          emissive={player.color || '#FFD700'}
          emissiveIntensity={0.35}
        />
        <Html position={[0, 6, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.78)',
            color: '#fff',
            fontSize: 11,
            fontFamily: '"Aptos","Segoe UI",sans-serif',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            border: `1px solid ${player.color || '#FFD700'}`,
          }}>
            {player.username}
          </div>
        </Html>
      </mesh>
      {player.isPlacingDisaster && (
        <mesh
          position={[player.disasterPreviewX * VOXEL_SIZE, 0.5, player.disasterPreviewZ * VOXEL_SIZE]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[
            Math.max(0, (player.disasterPreviewRadius - 0.5) * VOXEL_SIZE),
            (player.disasterPreviewRadius + 0.5) * VOXEL_SIZE,
            64,
          ]} />
          <meshBasicMaterial
            color={player.color || '#FFD700'}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

function PlayerCursors({ players, currentIdentity }: { players: readonly Player[]; currentIdentity: string | null }) {
  return (
    <group>
      {players
        .filter(p => p.isOnline && p.identity !== currentIdentity)
        .map(player => (
          <PlayerCursor key={player.identity} player={player} />
        ))}
    </group>
  );
}

function BuildingHighlight({ building }: { building: SelectedBuilding | null }) {
  if (!building) return null;
  return (
    <group>
      {building.cells.map(cell => (
        <mesh key={`${cell.x}_${cell.z}`} position={[cell.x * VOXEL_SIZE, VOXEL_SIZE * 0.55, cell.z * VOXEL_SIZE]}>
          <boxGeometry args={[VOXEL_SIZE * 1.12, VOXEL_SIZE * 1.12, VOXEL_SIZE * 1.12]} />
          <meshBasicMaterial color="#FFD700" wireframe transparent opacity={0.92} />
        </mesh>
      ))}
    </group>
  );
}

function BuildingInfoPanel({
  building,
  onMoveSelected,
  onRemoveSelected,
  onCancelSelection,
}: {
  building: SelectedBuilding | null;
  onMoveSelected: () => void;
  onRemoveSelected: () => void;
  onCancelSelection: () => void;
}) {
  if (!building) return null;
  const heightM = Math.round(building.heightM || building.heightLevels * VOXEL_SIZE);
  const floors = Math.max(1, Math.round(heightM / 4));
  const y = Math.max(building.heightLevels * VOXEL_SIZE + VOXEL_SIZE * 5, VOXEL_SIZE * 8);

  return (
    <Html position={[building.center.x * VOXEL_SIZE, y, building.center.z * VOXEL_SIZE]} center>
      <div className="building-info-panel">
        <strong>{building.name}</strong>
        <span>Height: {heightM} meters</span>
        <span>Floors: ~{floors}</span>
        <div>
          <button type="button" onClick={onMoveSelected}>Move</button>
          <button type="button" onClick={onRemoveSelected}>Remove</button>
          <button type="button" onClick={onCancelSelection}>Cancel</button>
        </div>
      </div>
    </Html>
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
  const bounds = useMemo(() => {
    const rows = baseGrid.length;
    const cols = baseGrid[0]?.length ?? 0;
    const width = rows * VOXEL_SIZE;
    const depth = cols * VOXEL_SIZE;
    return {
      maxX: Math.max(0, (rows - 1) * VOXEL_SIZE),
      maxZ: Math.max(0, (cols - 1) * VOXEL_SIZE),
      maxDistance: Math.min(2300, Math.max(450, Math.hypot(width, depth) * 1.25)),
    };
  }, [baseGrid]);
  const target = useMemo(() => {
    const rows = baseGrid.length;
    const cols = baseGrid[0]?.length ?? 0;
    return new THREE.Vector3((rows * VOXEL_SIZE) / 2, VOXEL_SIZE * 8, (cols * VOXEL_SIZE) / 2);
  }, [baseGrid]);

  useEffect(() => {
    controlsRef.current?.target.copy(target);
    controlsRef.current?.update();
  }, [target]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, 0, bounds.maxX);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, VOXEL_SIZE * 35);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, 0, bounds.maxZ);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={70}
      maxDistance={bounds.maxDistance}
      maxPolarAngle={Math.PI / 2.1}
    />
  );
}

export default function CityScene({
  baseGrid,
  edits,
  players,
  selectedBuilding,
  moveSource,
  ghostPreview,
  armedDisaster,
  hoveredCell,
  densityHeatmapEnabled,
  currentIdentity,
  onCellClick,
  onCellHover,
  onMoveSelected,
  onRemoveSelected,
  onCancelSelection,
  onFpsUpdate,
  agentsVisible,
  clock,
}: CitySceneProps) {
  return (
    <Canvas camera={{ position: [100, 120, 100], fov: 50, near: 0.1, far: 12000 }} dpr={[0.75, 1]} gl={{ antialias: false }} style={{ height: '100vh', width: '100vw', background: '#A9D8F2' }}>
      <color attach="background" args={['#A9D8F2']} />
      <ambientLight intensity={1.55} />
      <hemisphereLight args={['#FFFFFF', '#B99B73', 1.55]} />
      <directionalLight position={[220, 340, 180]} intensity={2.75} />
      <VoxelGrid baseGrid={baseGrid} edits={edits} densityHeatmapEnabled={densityHeatmapEnabled} onCellClick={onCellClick} onCellHover={onCellHover} ghostPreview={ghostPreview} armedDisaster={armedDisaster} hoveredCell={hoveredCell} />
      {agentsVisible && <AgentLayer clock={clock} baseGrid={baseGrid} />}
      <PlayerCursors players={players} currentIdentity={currentIdentity} />
      <BuildingHighlight building={selectedBuilding} />
      <BuildingInfoPanel building={selectedBuilding} onMoveSelected={onMoveSelected} onRemoveSelected={onRemoveSelected} onCancelSelection={onCancelSelection} />
      <MoveBeam source={moveSource} />
      <CameraTarget baseGrid={baseGrid} />
      <FpsTracker onFpsUpdate={onFpsUpdate} />
    </Canvas>
  );
}
