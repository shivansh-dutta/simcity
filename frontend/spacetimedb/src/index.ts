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

const spacetimedb = schema({
  cityEdit,
  player,
  cityStats,
  weatherState,
  economicData,
  tradeOffer,
  event,
});

export default spacetimedb;

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
    };

    if (existing) {
      ctx.db.player.identity.update(row);
    } else {
      ctx.db.player.insert(row);
    }
  }
);

export const moveCursor = spacetimedb.reducer(
  { x: t.i32(), z: t.i32() },
  (ctx, { x, z }) => {
    const identity = ctx.sender.toHexString();
    const existing = ctx.db.player.identity.find(identity);
    if (!existing) return;

    ctx.db.player.identity.update({
      ...existing,
      cursorX: x,
      cursorZ: z,
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
      createdAt: nowMs(ctx),
    });
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
      placedBy: ctx.sender.toHexString(),
      color,
      createdAt: nowMs(ctx),
    });
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
      placedBy: ctx.sender.toHexString(),
      color,
      createdAt: nowMs(ctx),
    });
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
  },
  (ctx, { eventId, eventType, intensity, affectedX, affectedZ, radius, duration }) => {
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
    let population = current.population;
    let happiness = current.happiness;
    let economyScore = current.economyScore;
    let healthScore = current.healthScore;
    let trafficScore = current.trafficScore;
    let greenScore = current.greenScore;

    if (eventType === 'earthquake') {
      healthScore -= 40;
      trafficScore -= 30;
      economyScore -= 20;
    } else if (eventType === 'hurricane') {
      healthScore -= 30;
      greenScore -= 40;
      trafficScore -= 50;
    } else if (eventType === 'flood') {
      trafficScore -= 60;
      economyScore -= 30;
      population -= 100000;
    } else if (eventType === 'fire') {
      healthScore -= 20;
      economyScore -= 40;
    } else if (eventType === 'heatwave') {
      healthScore -= 20;
      happiness -= 15;
      greenScore -= 10;
    } else if (eventType === 'economic_crash') {
      economyScore -= 50;
      population -= 200000;
    }

    const next = {
      ...current,
      population: Math.max(0, population),
      happiness: clampScore(happiness),
      economyScore: clampScore(economyScore),
      healthScore: clampScore(healthScore),
      trafficScore: clampScore(trafficScore),
      greenScore: clampScore(greenScore),
      disasterActive: eventType,
      disasterIntensity: intensity,
      lastUpdated: createdAt,
    };

    if (existing) {
      ctx.db.cityStats.id.update(next);
    } else {
      ctx.db.cityStats.insert(next);
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
