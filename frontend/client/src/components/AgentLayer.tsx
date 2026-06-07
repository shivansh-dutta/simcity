import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import type { SimulationClock } from '../module_bindings/types';

const VOXEL_SIZE = 5;

const scratchObject3D = new THREE.Object3D();
const scratchColor = new THREE.Color();

export default function AgentLayer({ clock, baseGrid }: { clock: SimulationClock | null, baseGrid: number[][][] | null }) {
  const [agents] = useTable(tables.agent);
  
  const cars = useMemo(() => agents.filter((a) => a.agentType === 'car'), [agents]);
  const pedestrians = useMemo(() => agents.filter((a) => a.agentType === 'pedestrian'), [agents]);

  const carMeshRef = useRef<THREE.InstancedMesh>(null);
  const pedMeshRef = useRef<THREE.InstancedMesh>(null);

  // Store visual positions so we can interpolate towards target positions
  const visualPos = useRef(new Map<string, { x: number; z: number }>());

  useFrame(() => {
    function getSurfaceY(x: number, z: number, offset: number): number {
      if (!baseGrid) return offset;
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      const col = baseGrid[ix]?.[iz];
      if (!col) return offset;
      let topLevel = 0;
      for (let level = col.length - 1; level >= 0; level--) {
        if (col[level] !== 0) {
          topLevel = level;
          break;
        }
      }
      return (topLevel * VOXEL_SIZE) + offset;
    }

    if (carMeshRef.current && cars.length > 0) {
      cars.forEach((agent, i) => {
        let pos = visualPos.current.get(agent.agentId);
        if (!pos) {
          pos = { x: agent.x, z: agent.z };
          visualPos.current.set(agent.agentId, pos);
        }

        // Interpolate (lerp factor 0.15) * speed
        const speedMultiplier = clock?.speedMultiplier ?? 1.0;
        
        const dx = agent.x - pos.x;
        const dz = agent.z - pos.z;
        
        if (dx * dx + dz * dz > 16) {
          // Snap if distance > 4 units (e.g. teleport)
          pos.x = agent.x;
          pos.z = agent.z;
        } else {
          pos.x += dx * Math.min(0.15 * speedMultiplier, 1.0);
          pos.z += dz * Math.min(0.15 * speedMultiplier, 1.0);
        }

        const targetY = getSurfaceY(pos.x, pos.z, 3.5);
        scratchObject3D.position.set(pos.x * VOXEL_SIZE, targetY, pos.z * VOXEL_SIZE);
        if (dx * dx + dz * dz > 0.0001) {
          scratchObject3D.rotation.set(0, Math.atan2(dx, dz), 0);
        }
        scratchObject3D.updateMatrix();
        carMeshRef.current!.setMatrixAt(i, scratchObject3D.matrix);

        // Handle fleeing color
        scratchColor.set(agent.state === 'fleeing' ? '#ff0000' : agent.color);
        carMeshRef.current!.setColorAt(i, scratchColor);
      });
      carMeshRef.current.instanceMatrix.needsUpdate = true;
      if (carMeshRef.current.instanceColor) carMeshRef.current.instanceColor.needsUpdate = true;
    }

    if (pedMeshRef.current && pedestrians.length > 0) {
      pedestrians.forEach((agent, i) => {
        let pos = visualPos.current.get(agent.agentId);
        if (!pos) {
          pos = { x: agent.x, z: agent.z };
          visualPos.current.set(agent.agentId, pos);
        }

        const speedMultiplier = clock?.speedMultiplier ?? 1.0;
        
        const dx = agent.x - pos.x;
        const dz = agent.z - pos.z;
        
        if (dx * dx + dz * dz > 16) {
          pos.x = agent.x;
          pos.z = agent.z;
        } else {
          pos.x += dx * Math.min(0.15 * speedMultiplier, 1.0);
          pos.z += dz * Math.min(0.15 * speedMultiplier, 1.0);
        }

        const targetY = getSurfaceY(pos.x, pos.z, 3.75);
        scratchObject3D.position.set(pos.x * VOXEL_SIZE, targetY, pos.z * VOXEL_SIZE);
        if (dx * dx + dz * dz > 0.0001) {
          scratchObject3D.rotation.set(0, Math.atan2(dx, dz), 0);
        }
        scratchObject3D.updateMatrix();
        pedMeshRef.current!.setMatrixAt(i, scratchObject3D.matrix);

        scratchColor.set(agent.state === 'fleeing' ? '#ff0000' : agent.color);
        pedMeshRef.current!.setColorAt(i, scratchColor);
      });
      pedMeshRef.current.instanceMatrix.needsUpdate = true;
      if (pedMeshRef.current.instanceColor) pedMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {cars.length > 0 && (
        <instancedMesh ref={carMeshRef} args={[undefined as any, undefined as any, cars.length]}>
          <boxGeometry args={[0.8 * VOXEL_SIZE, 0.4 * VOXEL_SIZE, 1.5 * VOXEL_SIZE]} />
          <meshStandardMaterial />
        </instancedMesh>
      )}
      {pedestrians.length > 0 && (
        <instancedMesh ref={pedMeshRef} args={[undefined as any, undefined as any, pedestrians.length]}>
          <sphereGeometry args={[0.25 * VOXEL_SIZE, 16, 16]} />
          <meshStandardMaterial />
        </instancedMesh>
      )}
    </group>
  );
}
