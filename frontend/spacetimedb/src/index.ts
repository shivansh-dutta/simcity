import { schema, table, t } from 'spacetimedb/server';

const cityEdit = table(
  { name: 'CityEdit', public: true },
  {
    editId: t.string().primaryKey(),
    editType: t.string(),
    fromX: t.i32(),
    fromZ: t.i32(),
    fromHeight: t.i32(),
    toX: t.i32(),
    toZ: t.i32(),
    voxelType: t.i32(),
    height: t.i32(),
    label: t.string(),
    placedBy: t.string(),
    color: t.string(),
    createdAt: t.i64(),
  }
);

const player = table(
  { name: 'Player', public: true },
  {
    identity: t.string().primaryKey(),
    username: t.string(),
    cursorX: t.i32(),
    cursorZ: t.i32(),
    color: t.string(),
    isOnline: t.bool(),
    score: t.i32(),
    lastSeen: t.i64(),
    isPlacingDisaster: t.bool(),
    disasterPreviewX: t.i32(),
    disasterPreviewZ: t.i32(),
    disasterPreviewRadius: t.i32(),
    lastAction: t.string(),
    lastActionAt: t.i64(),
  }
);

const cityStats = table(
  { name: 'CityStats', public: true },
  {
    id: t.i32().primaryKey(),
    population: t.i32(),
    happiness: t.f64(),
    economyScore: t.f64(),
    healthScore: t.f64(),
    trafficScore: t.f64(),
    greenScore: t.f64(),
    disasterActive: t.string(),
    disasterIntensity: t.i32(),
    populationLoss: t.i32(),
    lastUpdated: t.i64(),
  }
);

const weatherState = table(
  { name: 'WeatherState', public: true },
  {
    id: t.i32().primaryKey(),
    city: t.string(),
    tempC: t.f64(),
    weatherCode: t.i32(),
    windSpeed: t.f64(),
    precipitation: t.f64(),
    updatedAt: t.i64(),
  }
);

const economicData = table(
  { name: 'EconomicData', public: true },
  {
    id: t.i32().primaryKey(),
    gdpGrowth: t.f64(),
    inflation: t.f64(),
    unemployment: t.f64(),
    country: t.string(),
    updatedAt: t.i64(),
  }
);

const tradeOffer = table(
  { name: 'TradeOffer', public: true },
  {
    offerId: t.string().primaryKey(),
    fromPlayer: t.string(),
    toPlayer: t.string(),
    offerType: t.string(),
    offerDetails: t.string(),
    status: t.string(),
    createdAt: t.i64(),
  }
);

const event = table(
  { name: 'Event', public: true },
  {
    eventId: t.string().primaryKey(),
    eventType: t.string(),
    triggeredBy: t.string(),
    intensity: t.i32(),
    affectedX: t.i32(),
    affectedZ: t.i32(),
    radius: t.i32(),
    duration: t.i32(),
    label: t.string(),
    createdAt: t.i64(),
  }
);

const agent = table(
  { name: 'Agent', public: true },
  {
    agentId: t.string().primaryKey(),
    agentType: t.string(),
    x: t.f64(),
    z: t.f64(),
    targetX: t.f64(),
    targetZ: t.f64(),
    speed: t.f64(),
    state: t.string(),
    color: t.string(),
    spawnedAt: t.i64(),
  }
);

const simulationClock = table(
  { name: 'SimulationClock', public: true },
  {
    id: t.i32().primaryKey(),
    currentTick: t.i64(),
    speedMultiplier: t.f64(),
    isPaused: t.bool(),
    simulatedYear: t.i32(),
  }
);

const surfaceGrid = table(
  { name: 'SurfaceGrid', public: true },
  {
    id: t.i32().primaryKey(),
    width: t.i32(),
    depth: t.i32(),
    gridData: t.string(),
  }
);

const spacetimedb = schema({
  cityEdit,
  player,
  cityStats,
  weatherState,
  economicData,
  tradeOffer,
  event,
  agent,
  simulationClock,
  surfaceGrid,
});

export default spacetimedb;

export const uploadSurfaceGrid = spacetimedb.reducer(
  { width: t.i32(), depth: t.i32(), gridData: t.string() },
  (ctx, { width, depth, gridData }) => {
    const existing = ctx.db.surfaceGrid.id.find(0);
    if (existing) {
      ctx.db.surfaceGrid.id.update({ id: 0, width, depth, gridData });
    } else {
      ctx.db.surfaceGrid.insert({ id: 0, width, depth, gridData });
    }
  }
);

type TimestampContext = {
  timestamp: { __timestamp_micros_since_unix_epoch__: bigint };
};

function nowMs(ctx: TimestampContext): bigint {
  return ctx.timestamp.__timestamp_micros_since_unix_epoch__ / 1000n;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function defaultStats(lastUpdated: bigint) {
  return {
    id: 0,
    population: 850000,
    happiness: 50,
    economyScore: 50,
    healthScore: 50,
    trafficScore: 50,
    greenScore: 50,
    disasterActive: '',
    disasterIntensity: 0,
    populationLoss: 0,
    lastUpdated,
  };
}

export const joinCity = spacetimedb.reducer(
  { username: t.string(), color: t.string() },
  (ctx, { username, color }) => {
    const identity = ctx.sender.toHexString();
    const existing = ctx.db.player.identity.find(identity);
    const row = {
      identity,
      username,
      cursorX: existing?.cursorX ?? 0,
      cursorZ: existing?.cursorZ ?? 0,
      color,
      isOnline: true,
      score: existing?.score ?? 0,
      lastSeen: nowMs(ctx),
      isPlacingDisaster: false,
      disasterPreviewX: existing?.disasterPreviewX ?? 0,
      disasterPreviewZ: existing?.disasterPreviewZ ?? 0,
      disasterPreviewRadius: existing?.disasterPreviewRadius ?? 0,
      lastAction: existing?.lastAction ?? '',
      lastActionAt: existing?.lastActionAt ?? 0n,
    };

    if (existing) {
      ctx.db.player.identity.update(row);
    } else {
      ctx.db.player.insert(row);
    }
  }
);

export const moveCursor = spacetimedb.reducer(
  {
    x: t.i32(),
    z: t.i32(),
    isPlacingDisaster: t.bool(),
    disasterPreviewX: t.i32(),
    disasterPreviewZ: t.i32(),
    disasterPreviewRadius: t.i32(),
  },
  (ctx, { x, z, isPlacingDisaster, disasterPreviewX, disasterPreviewZ, disasterPreviewRadius }) => {
    const identity = ctx.sender.toHexString();
    const existing = ctx.db.player.identity.find(identity);
    if (!existing) return;

    ctx.db.player.identity.update({
      ...existing,
      cursorX: x,
      cursorZ: z,
      isPlacingDisaster,
      disasterPreviewX,
      disasterPreviewZ,
      disasterPreviewRadius,
      lastSeen: nowMs(ctx),
    });
  }
);

export const leaveCity = spacetimedb.reducer(ctx => {
  const identity = ctx.sender.toHexString();
  const existing = ctx.db.player.identity.find(identity);
  if (!existing) return;

  ctx.db.player.identity.update({
    ...existing,
    isOnline: false,
    lastSeen: nowMs(ctx),
  });
});

export const addScore = spacetimedb.reducer({ points: t.i32() }, (ctx, { points }) => {
  const identity = ctx.sender.toHexString();
  const existing = ctx.db.player.identity.find(identity);
  if (!existing) return;

  ctx.db.player.identity.update({
    ...existing,
    score: existing.score + points,
    lastSeen: nowMs(ctx),
  });
});

export const removeBuilding = spacetimedb.reducer(
  {
    editId: t.string(),
    fromX: t.i32(),
    fromZ: t.i32(),
    fromHeight: t.i32(),
    label: t.string(),
  },
  (ctx, { editId, fromX, fromZ, fromHeight, label }) => {
    const identity = ctx.sender.toHexString();
    const playerRow = ctx.db.player.identity.find(identity);
    const ts = nowMs(ctx);

    ctx.db.cityEdit.insert({
      editId,
      editType: 'remove',
      fromX,
      fromZ,
      fromHeight,
      toX: 0,
      toZ: 0,
      voxelType: 0,
      height: 0,
      label,
      placedBy: identity,
      color: playerRow?.color ?? '',
      createdAt: ts,
    });

    if (playerRow) {
      ctx.db.player.identity.update({
        ...playerRow,
        lastAction: `Removed building at grid position ${fromX} ${fromZ}`,
        lastActionAt: ts,
      });
    }
  }
);

export const placeBuilding = spacetimedb.reducer(
  {
    editId: t.string(),
    toX: t.i32(),
    toZ: t.i32(),
    voxelType: t.i32(),
    height: t.i32(),
    label: t.string(),
    color: t.string(),
  },
  (ctx, { editId, toX, toZ, voxelType, height, label, color }) => {
    const identity = ctx.sender.toHexString();
    const ts = nowMs(ctx);

    ctx.db.cityEdit.insert({
      editId,
      editType: 'place',
      fromX: 0,
      fromZ: 0,
      fromHeight: 0,
      toX,
      toZ,
      voxelType,
      height,
      label,
      placedBy: identity,
      color,
      createdAt: ts,
    });

    const playerRow = ctx.db.player.identity.find(identity);
    if (playerRow) {
      ctx.db.player.identity.update({
        ...playerRow,
        lastAction: `Placed building at ${toX} ${toZ}`,
        lastActionAt: ts,
      });
    }
  }
);

export const moveBuilding = spacetimedb.reducer(
  {
    editId: t.string(),
    fromX: t.i32(),
    fromZ: t.i32(),
    fromHeight: t.i32(),
    toX: t.i32(),
    toZ: t.i32(),
    height: t.i32(),
    label: t.string(),
    color: t.string(),
  },
  (ctx, { editId, fromX, fromZ, fromHeight, toX, toZ, height, label, color }) => {
    const identity = ctx.sender.toHexString();
    const ts = nowMs(ctx);

    ctx.db.cityEdit.insert({
      editId,
      editType: 'move',
      fromX,
      fromZ,
      fromHeight,
      toX,
      toZ,
      voxelType: 1,
      height,
      label,
      placedBy: identity,
      color,
      createdAt: ts,
    });

    const playerRow = ctx.db.player.identity.find(identity);
    if (playerRow) {
      ctx.db.player.identity.update({
        ...playerRow,
        lastAction: `Moved building from ${fromX} ${fromZ} to ${toX} ${toZ}`,
        lastActionAt: ts,
      });
    }
  }
);

export const changeZone = spacetimedb.reducer(
  {
    editId: t.string(),
    toX: t.i32(),
    toZ: t.i32(),
    voxelType: t.i32(),
    height: t.i32(),
    label: t.string(),
  },
  (ctx, { editId, toX, toZ, voxelType, height, label }) => {
    const identity = ctx.sender.toHexString();
    const playerRow = ctx.db.player.identity.find(identity);

    ctx.db.cityEdit.insert({
      editId,
      editType: 'zone_change',
      fromX: 0,
      fromZ: 0,
      fromHeight: 0,
      toX,
      toZ,
      voxelType,
      height,
      label,
      placedBy: identity,
      color: playerRow?.color ?? '',
      createdAt: nowMs(ctx),
    });
  }
);

export const undoLastEdit = spacetimedb.reducer(ctx => {
  const identity = ctx.sender.toHexString();
  let lastEdit: { editId: string; createdAt: bigint } | null = null;

  for (const edit of ctx.db.cityEdit.iter()) {
    if (edit.placedBy !== identity) continue;
    if (!lastEdit || edit.createdAt > lastEdit.createdAt) {
      lastEdit = edit;
    }
  }

  if (lastEdit) {
    ctx.db.cityEdit.editId.delete(lastEdit.editId);
  }
});

export const resetCity = spacetimedb.reducer(ctx => {
  const updatedAt = nowMs(ctx);

  for (const edit of ctx.db.cityEdit.iter()) {
    ctx.db.cityEdit.editId.delete(edit.editId);
  }

  for (const eventRow of ctx.db.event.iter()) {
    ctx.db.event.eventId.delete(eventRow.eventId);
  }

  const stats = defaultStats(updatedAt);
  if (ctx.db.cityStats.id.find(0)) {
    ctx.db.cityStats.id.update(stats);
  } else {
    ctx.db.cityStats.insert(stats);
  }
});

export const triggerDisaster = spacetimedb.reducer(
  {
    eventId: t.string(),
    eventType: t.string(),
    intensity: t.i32(),
    affectedX: t.i32(),
    affectedZ: t.i32(),
    radius: t.i32(),
    duration: t.i32(),
    deathToll: t.i32(),
  },
  (ctx, { eventId, eventType, intensity, affectedX, affectedZ, radius, duration, deathToll }) => {
    const createdAt = nowMs(ctx);
    ctx.db.event.insert({
      eventId,
      eventType,
      triggeredBy: ctx.sender.toHexString(),
      intensity,
      affectedX,
      affectedZ,
      radius,
      duration,
      label: `${eventType} (${intensity})`,
      createdAt,
    });

    const existing = ctx.db.cityStats.id.find(0);
    const current = existing ?? defaultStats(createdAt);
    const next = {
      ...current,
      disasterActive: eventType,
      disasterIntensity: intensity,
      populationLoss: current.populationLoss + deathToll,
      lastUpdated: createdAt,
    };

    if (existing) {
      ctx.db.cityStats.id.update(next);
    } else {
      ctx.db.cityStats.insert(next);
    }

    const playerRow = ctx.db.player.identity.find(ctx.sender.toHexString());
    if (playerRow) {
      ctx.db.player.identity.update({
        ...playerRow,
        lastAction: `Triggered ${eventType} near ${affectedX} ${affectedZ}`,
        lastActionAt: createdAt,
      });
    }
  }
);

export const clearDisaster = spacetimedb.reducer(ctx => {
  const updatedAt = nowMs(ctx);
  const existing = ctx.db.cityStats.id.find(0);
  const next = {
    ...(existing ?? defaultStats(updatedAt)),
    disasterActive: '',
    disasterIntensity: 0,
    // Note: populationLoss is intentionally preserved!
    lastUpdated: updatedAt,
  };

  if (existing) {
    ctx.db.cityStats.id.update(next);
  } else {
    ctx.db.cityStats.insert(next);
  }
});

export const updateCityStats = spacetimedb.reducer(
  {
    population: t.i32(),
    happiness: t.f64(),
    economyScore: t.f64(),
    healthScore: t.f64(),
    trafficScore: t.f64(),
    greenScore: t.f64(),
  },
  (ctx, { population, happiness, economyScore, healthScore, trafficScore, greenScore }) => {
    const updatedAt = nowMs(ctx);
    const existing = ctx.db.cityStats.id.find(0);
    const next = {
      id: 0,
      population,
      happiness: clampScore(happiness),
      economyScore: clampScore(economyScore),
      healthScore: clampScore(healthScore),
      trafficScore: clampScore(trafficScore),
      greenScore: clampScore(greenScore),
      disasterActive: existing?.disasterActive ?? '',
      disasterIntensity: existing?.disasterIntensity ?? 0,
      populationLoss: existing?.populationLoss ?? 0,
      lastUpdated: updatedAt,
    };

    if (existing) {
      ctx.db.cityStats.id.update(next);
    } else {
      ctx.db.cityStats.insert(next);
    }
  }
);

export const updateWeather = spacetimedb.reducer(
  {
    tempC: t.f64(),
    weatherCode: t.i32(),
    windSpeed: t.f64(),
    precipitation: t.f64(),
  },
  (ctx, { tempC, weatherCode, windSpeed, precipitation }) => {
    const row = {
      id: 0,
      city: 'New York',
      tempC,
      weatherCode,
      windSpeed,
      precipitation,
      updatedAt: nowMs(ctx),
    };

    if (ctx.db.weatherState.id.find(0)) {
      ctx.db.weatherState.id.update(row);
    } else {
      ctx.db.weatherState.insert(row);
    }
  }
);

export const updateEconomicData = spacetimedb.reducer(
  {
    gdpGrowth: t.f64(),
    inflation: t.f64(),
    unemployment: t.f64(),
  },
  (ctx, { gdpGrowth, inflation, unemployment }) => {
    const row = {
      id: 0,
      gdpGrowth,
      inflation,
      unemployment,
      country: 'USA',
      updatedAt: nowMs(ctx),
    };

    if (ctx.db.economicData.id.find(0)) {
      ctx.db.economicData.id.update(row);
    } else {
      ctx.db.economicData.insert(row);
    }
  }
);

export const createTradeOffer = spacetimedb.reducer(
  {
    offerId: t.string(),
    toPlayer: t.string(),
    offerType: t.string(),
    offerDetails: t.string(),
  },
  (ctx, { offerId, toPlayer, offerType, offerDetails }) => {
    ctx.db.tradeOffer.insert({
      offerId,
      fromPlayer: ctx.sender.toHexString(),
      toPlayer,
      offerType,
      offerDetails,
      status: 'pending',
      createdAt: nowMs(ctx),
    });
  }
);

export const respondToTrade = spacetimedb.reducer(
  { offerId: t.string(), accept: t.bool() },
  (ctx, { offerId, accept }) => {
    const existing = ctx.db.tradeOffer.offerId.find(offerId);
    if (!existing) return;

    ctx.db.tradeOffer.offerId.update({
      ...existing,
      status: accept ? 'accepted' : 'rejected',
    });
  }
);

function getSurfaceType(ctx: any, x: number, z: number): number {
  const gridInfo = ctx.db.surfaceGrid.id.find(0);
  if (!gridInfo) return 0;
  
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  if (ix < 0 || iz < 0 || ix >= gridInfo.width || iz >= gridInfo.depth) return 0;
  
  const idx = ix * gridInfo.depth + iz;
  const char = gridInfo.gridData.charAt(idx);
  return parseInt(char, 10) || 0;
}

function isValidTarget(agentType: string, type: number): boolean {
  if (agentType === 'car') {
    return type === 3; // Only Road
  } else {
    // Pedestrian: Grass (2), Road (3), Terrain (5). Never Building (1) or Water (4).
    return type === 2 || type === 3 || type === 5;
  }
}

let lcgSeed = 0;
function myRandom(ctx: any): number {
  if (lcgSeed === 0) {
    lcgSeed = Number(ctx.timestamp) || 123456789;
  }
  lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
  return lcgSeed / 4294967296;
}

function randomSpawnTarget(ctx: any, agentType: string): { x: number; z: number } {
  const gridInfo = ctx.db.surfaceGrid.id.find(0);
  if (!gridInfo) {
    return { x: myRandom(ctx) * 200, z: myRandom(ctx) * 200 };
  }
  
  let attempts = 0;
  while (attempts < 1000) {
    const x = Math.floor(myRandom(ctx) * gridInfo.width);
    const z = Math.floor(myRandom(ctx) * gridInfo.depth);
    const t = getSurfaceType(ctx, x, z);
    if (isValidTarget(agentType, t)) {
      return { x: x + 0.5, z: z + 0.5 };
    }
    attempts++;
  }
  return { x: 100, z: 100 }; // Failsafe
}

function randomWalkTarget(ctx: any, agentType: string, cx: number, cz: number, targetX: number, targetZ: number): { x: number; z: number } {
  const gridInfo = ctx.db.surfaceGrid.id.find(0);
  if (!gridInfo) {
    return { x: cx + (myRandom(ctx) * 2 - 1) * 2, z: cz + (myRandom(ctx) * 2 - 1) * 2 };
  }
  
  const ix = Math.floor(targetX);
  const iz = Math.floor(targetZ);
  
  const dirs = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
  ];
  
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(myRandom(ctx) * (i + 1));
    const temp = dirs[i];
    dirs[i] = dirs[j];
    dirs[j] = temp;
  }
  
  let bestDir = null;
  for (const d of dirs) {
    const nx = ix + d.dx;
    const nz = iz + d.dz;
    const t = getSurfaceType(ctx, nx, nz);
    if (isValidTarget(agentType, t)) {
      if (Math.abs(nx + 0.5 - cx) < 0.1 && Math.abs(nz + 0.5 - cz) < 0.1) {
        if (!bestDir) bestDir = d;
      } else {
        bestDir = d;
        break;
      }
    }
  }
  
  if (!bestDir) {
    return randomSpawnTarget(ctx, agentType);
  }
  
  let curX = ix;
  let curZ = iz;
  
  for (let i = 0; i < 1; i++) {
    const nx = curX + bestDir.dx;
    const nz = curZ + bestDir.dz;
    const t = getSurfaceType(ctx, nx, nz);
    
    if (!isValidTarget(agentType, t)) break;
    
    curX = nx;
    curZ = nz;
    
    const ortho1 = isValidTarget(agentType, getSurfaceType(ctx, curX + bestDir.dz, curZ + bestDir.dx));
    const ortho2 = isValidTarget(agentType, getSurfaceType(ctx, curX - bestDir.dz, curZ - bestDir.dx));
    if (ortho1 || ortho2) break;
  }
  
  return { x: curX + 0.5, z: curZ + 0.5 };
}

export const tickAgents = spacetimedb.reducer(ctx => {
  const clock = ctx.db.simulationClock.id.find(0);
  if (clock?.isPaused) return;

  const eventItem = ctx.db.event.iter().next().value;
  const isDisaster = !!eventItem;


  for (const a of ctx.db.agent.iter()) {
    let nextX = a.x;
    let nextZ = a.z;
    let state = a.state;
    let targetX = a.targetX;
    let targetZ = a.targetZ;

    let moveSpeed = a.speed * (clock?.speedMultiplier ?? 1.0);

    if (isDisaster && eventItem) {
      const dx = a.x - eventItem.affectedX;
      const dz = a.z - eventItem.affectedZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < eventItem.radius * eventItem.radius) {
        state = 'fleeing';
        moveSpeed *= 2;
        const dist = Math.sqrt(distSq) || 1;
        targetX = a.x + (dx / dist) * 10;
        targetZ = a.z + (dz / dist) * 10;
      }
    } else if (state === 'fleeing') {
      state = 'moving';
      const target = randomWalkTarget(ctx, a.agentType, a.x, a.z, targetX, targetZ);
      targetX = target.x;
      targetZ = target.z;
    }

    if (state.startsWith('wait:')) {
      state = 'moving';
    }

    if (state !== 'fleeing') {
      let distanceToMove = moveSpeed;
      let steps = 0;
      let prevX = a.x;
      let prevZ = a.z;
      
      while (distanceToMove > 0.01 && steps < 10) {
        steps++;
        const dx = targetX - nextX;
        const dz = targetZ - nextZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < distanceToMove) {
          nextX = targetX;
          nextZ = targetZ;
          distanceToMove -= dist;
          
          const target = randomWalkTarget(ctx, a.agentType, prevX, prevZ, targetX, targetZ);
          
          if (Math.abs(target.x - nextX) > 50) {
            nextX = target.x;
            nextZ = target.z;
            targetX = target.x;
            targetZ = target.z;
            break; 
          }
          
          prevX = targetX;
          prevZ = targetZ;
          
          targetX = target.x;
          targetZ = target.z;
        } else {
          nextX += (dx / dist) * distanceToMove;
          nextZ += (dz / dist) * distanceToMove;
          distanceToMove = 0;
        }
      }
    } else {
      const dx = targetX - a.x;
      const dz = targetZ - a.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      nextX += (dx / dist) * moveSpeed;
      nextZ += (dz / dist) * moveSpeed;
    }

    // Wrap around boundaries just in case
    if (nextX < 0) nextX += 287;
    if (nextX > 287) nextX -= 287;
    if (nextZ < 0) nextZ += 222;
    if (nextZ > 222) nextZ -= 222;

    ctx.db.agent.agentId.update({
      ...a,
      x: nextX,
      z: nextZ,
      targetX,
      targetZ,
      state
    });
  }
});

export const spawnAgents = spacetimedb.reducer(
  { count: t.i32(), agentType: t.string() },
  (ctx, { count, agentType }) => {
    for (let i = 0; i < count; i++) {
      const pos = randomSpawnTarget(ctx, agentType);
      const target = randomWalkTarget(ctx, agentType, pos.x, pos.z, pos.x, pos.z);
      const speed = agentType === 'car' ? 3.0 : 0.3;
      const color = agentType === 'car' ? '#3b82f6' : '#f43f5e';
      
      ctx.db.agent.insert({
        agentId: `agent_${agentType}_${i}_${nowMs(ctx)}_${Math.floor(myRandom(ctx) * 10000)}`,
        agentType,
        x: pos.x,
        z: pos.z,
        targetX: target.x,
        targetZ: target.z,
        speed,
        state: 'moving',
        color,
        spawnedAt: nowMs(ctx),
      });
    }
  }
);

export const despawnAgent = spacetimedb.reducer(
  { agentId: t.string() },
  (ctx, { agentId }) => {
    ctx.db.agent.agentId.delete(agentId);
  }
);

export const updateAgentCount = spacetimedb.reducer(
  { agentType: t.string(), newCount: t.i32() },
  (ctx, { agentType, newCount }) => {
    let currentAgents = [];
    for (const a of ctx.db.agent.iter()) {
      if (a.agentType === agentType) {
        currentAgents.push(a);
      }
    }
    
    if (currentAgents.length < newCount) {
      // Spawn more
      const toSpawn = newCount - currentAgents.length;
      for (let i = 0; i < toSpawn; i++) {
        const pos = randomSpawnTarget(ctx, agentType);
        const target = randomWalkTarget(ctx, agentType, pos.x, pos.z, pos.x, pos.z);
        const speed = agentType === 'car' ? 3.0 : 0.3;
        const color = agentType === 'car' ? '#3b82f6' : '#f43f5e';
        ctx.db.agent.insert({
          agentId: `agent_${agentType}_${i}_${nowMs(ctx)}_${Math.floor(myRandom(ctx) * 10000)}`,
          agentType,
          x: pos.x,
          z: pos.z,
          targetX: target.x,
          targetZ: target.z,
          speed,
          state: 'moving',
          color,
          spawnedAt: nowMs(ctx),
        });
      }
    } else if (currentAgents.length > newCount) {
      // Despawn excess
      const toDespawn = currentAgents.length - newCount;
      for (let i = 0; i < toDespawn; i++) {
        ctx.db.agent.agentId.delete(currentAgents[i].agentId);
      }
    }
  }
);

export const advanceClock = spacetimedb.reducer((ctx) => {
  const clock = ctx.db.simulationClock.id.find(0);
  if (!clock) {
    ctx.db.simulationClock.insert({
      id: 0,
      currentTick: 0n,
      speedMultiplier: 1.0,
      isPaused: false,
      simulatedYear: 2026,
    });
    return;
  }

  if (clock.isPaused) return;

  const oldTick = Number(clock.currentTick);
  const newTick = oldTick + clock.speedMultiplier;
  
  const newYear = 2026 + Math.floor(newTick / 8760);

  const oldMonth = Math.floor(oldTick / 720);
  const newMonth = Math.floor(newTick / 720);
  
  if (newMonth > oldMonth) {
    const stats = ctx.db.cityStats.id.find(0);
    if (stats) {
      const drift = (myRandom(ctx) * 6) - 3;
      ctx.db.cityStats.id.update({
        ...stats,
        economyScore: clampScore(stats.economyScore + drift)
      });
    }
  }

  ctx.db.simulationClock.id.update({
    ...clock,
    currentTick: BigInt(Math.floor(newTick)),
    simulatedYear: newYear,
  });
});

export const tickDisasters = spacetimedb.reducer((ctx) => {
  const clock = ctx.db.simulationClock.id.find(0);
  if (clock && clock.isPaused) return;

  const currentMs = nowMs(ctx);
  for (const event of ctx.db.event.iter()) {
    if (currentMs >= event.createdAt + BigInt(event.duration * 1000)) {
      ctx.db.event.eventId.delete(event.eventId);
      
      const stats = ctx.db.cityStats.iter().next().value;
      if (stats && stats.disasterActive === event.eventType) {
        ctx.db.cityStats.id.update({
          ...stats,
          disasterActive: '',
        });
      }
    }
  }
});

export const setClockSpeed = spacetimedb.reducer({ multiplier: t.f64() }, (ctx, { multiplier }) => {
  const clock = ctx.db.simulationClock.id.find(0);
  if (clock) {
    ctx.db.simulationClock.id.update({ ...clock, speedMultiplier: multiplier });
  }
});

export const togglePause = spacetimedb.reducer((ctx) => {
  const clock = ctx.db.simulationClock.id.find(0);
  if (clock) {
    ctx.db.simulationClock.id.update({ ...clock, isPaused: !clock.isPaused });
  }
});
