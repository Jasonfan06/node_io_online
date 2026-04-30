(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const shell = document.getElementById("game-shell");
  const ctx = canvas.getContext("2d");
  const homeScreen = document.getElementById("home-screen");
  const homeStatusEl = document.getElementById("home-status");
  const modeActionsEl = document.getElementById("mode-actions");
  const multiplayerPanelEl = document.getElementById("multiplayer-panel");
  const singleplayerEl = document.getElementById("singleplayer");
  const multiplayerEl = document.getElementById("multiplayer");
  const createRoomEl = document.getElementById("create-room");
  const joinRoomEl = document.getElementById("join-room");
  const backMenuEl = document.getElementById("back-menu");
  const roomInputEl = document.getElementById("room-input");
  const roomFieldEl = document.querySelector(".room-field");
  const roomCardEl = document.getElementById("room-card");
  const roomNumberEl = document.getElementById("room-number");
  const statusEl = document.getElementById("status");
  const nodeScoreEl = document.getElementById("node-score");
  const unitScoreEl = document.getElementById("unit-score");
  const selectedEl = document.getElementById("selected-count");
  const restartEl = document.getElementById("restart");
  const homeEl = document.getElementById("home");
  const messageEl = document.getElementById("message");

  const TAU = Math.PI * 2;
  const CAPTURED_NODE_HP = 0;
  const GUARD_RADIUS = 28;
  const MAX_UNITS = 900;
  const SINGLEPLAYER_AI_ENABLED = true;
  const NETWORK_PROTOCOL = "node-field-v1";
  const SERVER_URL = resolveServerUrl();
  const ROOM_PARAM = "room";
  const SNAPSHOT_SCHEMA = 2;
  const SNAPSHOT_INTERVAL = 0.04;
  const SNAPSHOT_BUFFER_LIMIT = 64 * 1024;
  const ORDER_ACK_GRACE_MS = 1200;
  const JOIN_TIMEOUT_MS = 10000;
  const COUNTDOWN_STEP_MS = 800;
  const COUNTDOWN_STEPS = ["3", "2", "1", "Start!"];
  const ROOM_MIN = 100000;
  const ROOM_MAX = 999999;
  const AI_DECISION_INTERVAL = 0.28;
  const AI_HORIZON = 22;
  const AI_AVERAGE_SPEED = ((112 + 146) / 2) * (2 / 3);
  const AI_MIN_NODE_RESERVE = 0;
  const AI_SAFETY_MARGIN = 2;
  const AI_MAX_CANDIDATES = 22;
  const AI_RESPONSE_DELAY = 0.35;
  const AI_EXPANSION_BONUS = 16;
  const AI_MAX_ORDERS = 3;
  const AI_MAX_DEFENSE_ORDERS = 2;
  const AI_SINGLEPLAYER_STARTING_UNIT_MULTIPLIER = 1.85;
  const AI_SINGLEPLAYER_PRODUCTION_MULTIPLIER = 1.65;
  const AI_INVEST_ENABLED = 1;
  const AI_INVEST_MIN_SURPLUS = 9;
  const AI_INVEST_MAX_UNITS = 3;
  const AI_INVEST_FRONT_HP_TARGET = 9;
  const AI_INVEST_BACK_HP_TARGET = 5;
  const AI_INVEST_SCORE_BIAS = 14;
  const AI_EXPANSION_VALUE_WEIGHT = 1.05;
  const AI_EXPANSION_COST_WEIGHT = 1.9;
  const AI_EXPANSION_CONTEST_SCALE = 0.06;
  const AI_ATTACK_VALUE_WEIGHT = 3.6;
  const AI_ATTACK_COST_WEIGHT = 0.45;
  const AI_ATTACK_ADVANTAGE_GATE = 0;
  const AI_ATTACK_ADVANTAGE_WEIGHT = 3.4;
  const AI_ATTACK_NEED_PADDING = 1;
  const AI_PRESSURE_ATTACK_GATE = 0;
  const AI_ORDER_THRESHOLD = 0;
  const AI_FINISH_BIAS = 65;
  const AI_FINISH_OVERKILL = 2;
  const AI_DECISIVE_NODE_LEAD = 2;
  const AI_DECISIVE_UNIT_LEAD = 24;
  const FRIENDLY_STATION_MIN = 11;
  const FRIENDLY_STATION_MAX = 26;
  const FRIENDLY_ARRIVAL_DISTANCE = 5;
  const FRIENDLY_SLOW_RADIUS = 42;
  const FRIENDLY_MIN_SPEED_SCALE = 0.08;
  const GUARD_SLOW_RADIUS = 72;
  const GUARD_ARRIVAL_DISTANCE = 5;
  const GUARD_MIN_SPEED_SCALE = 0.18;
  const GUARD_FORMATION_MAX_SPREAD = 24;
  const GUARD_HOVER_MIN = 2;
  const GUARD_HOVER_MAX = 5;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const BASE_PRODUCTION_RATE = 0.32;
  const HP_PRODUCTION_LOG_WEIGHT = 0.24;

  const OWNER = {
    PLAYER: "player",
    AI: "ai",
    NEUTRAL: "neutral",
  };

  const OWNER_BY_CODE = [OWNER.PLAYER, OWNER.AI, OWNER.NEUTRAL];
  const UNIT_STATE_BY_CODE = ["stationed", "moving", "guarding"];

  const COLORS = {
    player: {
      fill: "#eaf4ff",
      line: "#0066cc",
      unit: "#0066cc",
      selected: "#0071e3",
      text: "#004b9b",
    },
    ai: {
      fill: "#f5f5f7",
      line: "#1d1d1f",
      unit: "#333333",
      selected: "#1d1d1f",
      text: "#1d1d1f",
    },
    neutral: {
      fill: "#ffffff",
      line: "#d2d2d7",
      unit: "#7a7a7a",
      selected: "#7a7a7a",
      text: "#7a7a7a",
    },
  };

  const state = {
    width: 0,
    height: 0,
    worldWidth: 0,
    worldHeight: 0,
    dpr: 1,
    lastTime: performance.now(),
    nodes: [],
    units: [],
    selected: new Set(),
    nextNodeId: 1,
    nextUnitId: 1,
    phase: "menu",
    winner: null,
    rng: Math.random,
    ai: {
      elapsed: 0,
      lastOrder: "opening",
    },
    countdown: {
      timer: null,
      token: 0,
    },
    match: {
      mode: "menu",
      localOwner: OWNER.PLAYER,
      isHost: true,
      connected: false,
      roomId: null,
      conn: null,
      closing: false,
      joinTimer: null,
      snapshotElapsed: 0,
      snapshotSequence: 0,
      lastAppliedSnapshotSequence: 0,
      orderSequence: 0,
      pendingOrderAck: null,
      pendingOrderSince: 0,
      pendingSnapshot: null,
      clientId:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
    },
    mouse: {
      id: null,
      down: false,
      dragging: false,
      x: 0,
      y: 0,
      startX: 0,
      startY: 0,
      hoverNode: null,
    },
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numberOr(value, fallback = 0) {
    if (value === null || value === undefined) {
      return fallback;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function nullableNumber(value) {
    if (value === null || value === undefined) {
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function packNumber(value) {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.round(value * 100) / 100;
  }

  function packNullableNumber(value) {
    return value === null || value === undefined ? null : packNumber(value);
  }

  function encodeOwner(owner) {
    const index = OWNER_BY_CODE.indexOf(owner);
    return index === -1 ? 2 : index;
  }

  function decodeOwner(owner) {
    if (typeof owner === "string") {
      return OWNER_BY_CODE.includes(owner) ? owner : OWNER.NEUTRAL;
    }
    return OWNER_BY_CODE[numberOr(owner, 2)] || OWNER.NEUTRAL;
  }

  function encodeUnitState(unitState) {
    const index = UNIT_STATE_BY_CODE.indexOf(unitState);
    return index === -1 ? 0 : index;
  }

  function decodeUnitState(unitState) {
    if (typeof unitState === "string") {
      return UNIT_STATE_BY_CODE.includes(unitState) ? unitState : "stationed";
    }
    return UNIT_STATE_BY_CODE[numberOr(unitState, 0)] || "stationed";
  }

  function hashSeed(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function makeRng(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function setRandomSeed(seed) {
    state.rng = makeRng(hashSeed(seed));
  }

  function rand(min, max) {
    return state.rng() * (max - min) + min;
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function getNode(id) {
    return state.nodes.find((node) => node.id === id);
  }

  function nodeRadius(node) {
    if (node.owner === OWNER.NEUTRAL) {
      return clamp(18 + node.captureRequired * 0.55, 20, 32);
    }
    return clamp(18 + Math.sqrt(Math.max(1, node.hp)) * 3.1 + node.hp * 0.08, 22, 58);
  }

  function productionRateFromHp(hp) {
    return BASE_PRODUCTION_RATE + Math.log1p(Math.max(0, hp)) * HP_PRODUCTION_LOG_WEIGHT;
  }

  function maxStationedForHp(hp) {
    return Math.round(28 + Math.max(0, hp) * 1.6);
  }

  function movementSpeed() {
    return rand(112, 146) * (2 / 3);
  }

  function stationBandPadding() {
    return rand(FRIENDLY_STATION_MIN, FRIENDLY_STATION_MAX);
  }

  function randomDirection() {
    return state.rng() > 0.5 ? 1 : -1;
  }

  function randomOrbitSpeed(min, max) {
    return rand(min, max) * randomDirection();
  }

  function nodeStationPoint(node, angle, padding) {
    const radius = node.radius + padding;
    return {
      x: node.x + Math.cos(angle) * radius,
      y: node.y + Math.sin(angle) * radius,
    };
  }

  function guardFormationOffset(index, count) {
    if (count <= 1) {
      return { x: 0, y: 0 };
    }

    const step = index + 1;
    const radius = Math.min(
      GUARD_FORMATION_MAX_SPREAD,
      Math.sqrt(step / count) * GUARD_FORMATION_MAX_SPREAD,
    );
    const angle = step * GOLDEN_ANGLE;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  function resetMovementTargets(unit) {
    unit.nodeApproachAngle = null;
    unit.nodeApproachPadding = null;
  }

  function controlledNodeCount(owner) {
    return state.nodes.filter((node) => node.owner === owner).length;
  }

  function unitCount(owner) {
    return state.units.filter((unit) => unit.owner === owner).length;
  }

  function unitCountByState(owner, unitState) {
    return state.units.filter(
      (unit) => unit.owner === owner && unit.state === unitState,
    ).length;
  }

  function localOwner() {
    return state.match.localOwner;
  }

  function enemyOwner() {
    return otherOwner(localOwner());
  }

  function shouldFlipBoard() {
    return state.match.mode === "multi" && localOwner() === OWNER.AI;
  }

  function worldWidth() {
    return Math.max(1, state.worldWidth || state.width);
  }

  function worldHeight() {
    return Math.max(1, state.worldHeight || state.height);
  }

  function viewTransform() {
    const scale = Math.min(state.width / worldWidth(), state.height / worldHeight());
    return {
      scale,
      offsetX: (state.width - worldWidth() * scale) / 2,
      offsetY: (state.height - worldHeight() * scale) / 2,
    };
  }

  function toViewPoint(x, y) {
    const { scale, offsetX, offsetY } = viewTransform();
    const vx = shouldFlipBoard() ? worldWidth() - x : x;
    const vy = shouldFlipBoard() ? worldHeight() - y : y;
    return {
      x: offsetX + vx * scale,
      y: offsetY + vy * scale,
    };
  }

  function toViewRadius(radius) {
    return radius * viewTransform().scale;
  }

  function toWorldPoint(x, y) {
    const { scale, offsetX, offsetY } = viewTransform();
    const vx = clamp((x - offsetX) / scale, 0, worldWidth());
    const vy = clamp((y - offsetY) / scale, 0, worldHeight());
    if (!shouldFlipBoard()) {
      return { x: vx, y: vy };
    }
    return {
      x: worldWidth() - vx,
      y: worldHeight() - vy,
    };
  }

  function colorsForOwner(owner) {
    if (owner === OWNER.NEUTRAL) {
      return COLORS.neutral;
    }
    return owner === localOwner() ? COLORS.player : COLORS.ai;
  }

  function isMultiplayerClient() {
    return state.match.mode === "multi" && !state.match.isHost;
  }

  function isAiEnabled() {
    return state.match.mode === "single" && SINGLEPLAYER_AI_ENABLED;
  }

  function stationedUnitsAt(nodeId, owner) {
    return state.units.filter(
      (unit) =>
        unit.owner === owner &&
        unit.state === "stationed" &&
        unit.nodeId === nodeId,
    );
  }

  function isSelectableUnit(unit, owner = localOwner()) {
    return (
      unit.owner === owner &&
      (unit.state === "stationed" ||
        unit.state === "moving" ||
        unit.state === "guarding")
    );
  }

  function removeUnit(unit) {
    const id = typeof unit === "number" ? unit : unit.id;
    const index = state.units.findIndex((candidate) => candidate.id === id);
    if (index !== -1) {
      state.units.splice(index, 1);
    }
    state.selected.delete(id);
  }

  function syncNodeRadius(node) {
    node.radius = nodeRadius(node);
  }

  function resize() {
    const oldWidth = state.width;
    const oldHeight = state.height;
    state.width = Math.max(320, window.innerWidth);
    state.height = Math.max(420, window.innerHeight);
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    if (!isMultiplayerClient()) {
      state.worldWidth = state.width;
      state.worldHeight = state.height;
    }

    if (oldWidth > 0 && oldHeight > 0 && state.nodes.length && !isMultiplayerClient()) {
      const sx = state.width / oldWidth;
      const sy = state.height / oldHeight;
      state.nodes.forEach((node) => {
        node.x *= sx;
        node.y *= sy;
      });
      state.units.forEach((unit) => {
        unit.x *= sx;
        unit.y *= sy;
      });
    }
  }

  function createNode(owner, x, y, options = {}) {
    const hp = owner === OWNER.NEUTRAL ? 0 : (options.hp ?? randInt(8, 16));
    const captureRequired =
      owner === OWNER.NEUTRAL
        ? (options.captureRequired ?? randInt(0, 80))
        : 0;
    const node = {
      id: state.nextNodeId++,
      owner,
      x,
      y,
      hp,
      captureRequired,
      captureRemaining: captureRequired,
      radius: 24,
      production: 0,
      flash: 0,
      seed: rand(0, TAU),
    };
    syncNodeRadius(node);
    state.nodes.push(node);
    return node;
  }

  function findNodeSpot(region, radius) {
    const topSafe = state.height < 620 ? 106 : 116;
    const xMin = state.width * region.x0;
    const xMax = state.width * region.x1;
    const yMin = Math.max(topSafe, state.height * region.y0);
    const yMax = state.height * region.y1;

    for (let attempt = 0; attempt < 180; attempt += 1) {
      const x = rand(xMin, xMax);
      const y = rand(yMin, yMax);
      const clear = state.nodes.every(
        (node) => distance(x, y, node.x, node.y) > radius + node.radius + 76,
      );
      if (clear) {
        return { x, y };
      }
    }

    for (let attempt = 0; attempt < 260; attempt += 1) {
      const x = rand(64, state.width - 64);
      const y = rand(topSafe, state.height - 64);
      const clear = state.nodes.every(
        (node) => distance(x, y, node.x, node.y) > radius + node.radius + 50,
      );
      if (clear) {
        return { x, y };
      }
    }

    return {
      x: rand(70, state.width - 70),
      y: rand(topSafe, state.height - 70),
    };
  }

  function placeNode(owner, region, options = {}) {
    const estimatedRadius =
      owner === OWNER.NEUTRAL
        ? clamp(18 + (options.captureRequired ?? 12) * 0.55, 20, 32)
        : clamp(18 + Math.sqrt(options.hp ?? 12) * 3.1 + (options.hp ?? 12) * 0.08, 22, 58);
    const spot = findNodeSpot(region, estimatedRadius);
    return createNode(owner, spot.x, spot.y, options);
  }

  function addUnit(owner, node, options = {}) {
    if (state.units.length >= MAX_UNITS) {
      return null;
    }

    const angle = options.angle ?? rand(0, TAU);
    const orbitRadius = options.orbitRadius ?? node.radius + rand(11, 26);
    const unit = {
      id: state.nextUnitId++,
      owner,
      homeNodeId: node.id,
      state: "stationed",
      nodeId: node.id,
      targetId: null,
      targetX: null,
      targetY: null,
      guardX: null,
      guardY: null,
      nodeApproachAngle: null,
      nodeApproachPadding: null,
      x: node.x + Math.cos(angle) * orbitRadius,
      y: node.y + Math.sin(angle) * orbitRadius,
      angle,
      orbitBlend: 1,
      orbitRadius,
      orbitSpeed: randomOrbitSpeed(0.18, 0.38),
      speed: movementSpeed(),
      selected: false,
      ordered: false,
      trail: [],
    };
    state.units.push(unit);
    return unit;
  }

  function addStationedUnits(node, owner, count) {
    for (let i = 0; i < count; i += 1) {
      addUnit(owner, node);
    }
  }

  function receivesSingleplayerAiAdvantage(owner) {
    return state.match.mode === "single" && owner === OWNER.AI;
  }

  function startingUnitCount(owner, count) {
    return receivesSingleplayerAiAdvantage(owner)
      ? Math.ceil(count * AI_SINGLEPLAYER_STARTING_UNIT_MULTIPLIER)
      : count;
  }

  function newGame(options = {}) {
    clearCountdown();
    const seed = options.seed ?? `single-${Date.now()}-${Math.random()}`;
    setRandomSeed(seed);
    state.nodes = [];
    state.units = [];
    state.selected.clear();
    state.nextNodeId = 1;
    state.nextUnitId = 1;
    state.worldWidth = state.width;
    state.worldHeight = state.height;
    state.phase = options.phase ?? "playing";
    state.winner = null;
    state.match.snapshotElapsed = 0;
    state.match.pendingSnapshot = null;
    state.match.pendingOrderAck = null;
    state.match.pendingOrderSince = 0;
    state.ai.elapsed = 0;
    state.ai.lastOrder = state.match.mode === "multi" ? "multiplayer" : "opening";
    messageEl.classList.remove("countdown-message", "countdown-pop");
    messageEl.hidden = true;

    const totalNodes = clamp(
      Math.round((state.width * state.height) / 125000) + 8,
      10,
      15,
    );

    const playerHome = placeNode(
      OWNER.PLAYER,
      { x0: 0.08, x1: 0.27, y0: 0.45, y1: 0.82 },
      { hp: 16 },
    );
    const aiHome = placeNode(
      OWNER.AI,
      { x0: 0.73, x1: 0.92, y0: 0.22, y1: 0.6 },
      { hp: 16 },
    );
    const playerOutpost = placeNode(
      OWNER.PLAYER,
      { x0: 0.18, x1: 0.38, y0: 0.24, y1: 0.68 },
      { hp: 10 },
    );
    const aiOutpost = placeNode(
      OWNER.AI,
      { x0: 0.62, x1: 0.84, y0: 0.43, y1: 0.86 },
      { hp: 10 },
    );

    addStationedUnits(playerHome, OWNER.PLAYER, 22);
    addStationedUnits(playerOutpost, OWNER.PLAYER, 13);
    addStationedUnits(aiHome, OWNER.AI, startingUnitCount(OWNER.AI, 22));
    addStationedUnits(aiOutpost, OWNER.AI, startingUnitCount(OWNER.AI, 13));

    for (let i = state.nodes.length; i < totalNodes; i += 1) {
      placeNode(
        OWNER.NEUTRAL,
        { x0: 0.14, x1: 0.86, y0: 0.22, y1: 0.9 },
        { captureRequired: randInt(0, 80) },
      );
    }

    updateHud();
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * state.width;
    const y = ((event.clientY - rect.top) / rect.height) * state.height;
    return toWorldPoint(x, y);
  }

  function dragCircleFromCenter(startX, startY, endX, endY) {
    return {
      x: startX,
      y: startY,
      radius: distance(startX, startY, endX, endY),
    };
  }

  function hitNode(x, y) {
    let hit = null;
    let hitDistance = Infinity;
    state.nodes.forEach((node) => {
      const d = distance(x, y, node.x, node.y);
      if (d <= node.radius + 14 && d < hitDistance) {
        hit = node;
        hitDistance = d;
      }
    });
    return hit;
  }

  function selectUnitsInCircle(cx, cy, radius) {
    state.selected.clear();
    state.units.forEach((unit) => {
      const isSelectable =
        isSelectableUnit(unit) && distance(unit.x, unit.y, cx, cy) <= radius;
      unit.selected = isSelectable;
      if (isSelectable) {
        state.selected.add(unit.id);
      }
    });
    updateHud();
  }

  function clearSelection() {
    state.units.forEach((unit) => {
      unit.selected = false;
    });
    state.selected.clear();
    updateHud();
  }

  function selectLocalNode(node) {
    clearSelection();
    stationedUnitsAt(node.id, localOwner()).forEach((unit) => {
      unit.selected = true;
      state.selected.add(unit.id);
    });
    updateHud();
  }

  function launchUnit(unit, target) {
    const isHomeTarget = unit.homeNodeId === target.id;
    const approachAngle =
      !isHomeTarget && distance(unit.x, unit.y, target.x, target.y) > 0
        ? Math.atan2(unit.y - target.y, unit.x - target.x)
        : rand(0, TAU);

    unit.state = "moving";
    unit.nodeId = null;
    unit.targetId = target.id;
    unit.targetX = null;
    unit.targetY = null;
    unit.guardX = null;
    unit.guardY = null;
    if (isHomeTarget) {
      resetMovementTargets(unit);
    } else {
      unit.nodeApproachAngle = approachAngle + rand(-0.18, 0.18);
      unit.nodeApproachPadding = stationBandPadding();
    }
    unit.selected = false;
    unit.ordered = true;
    unit.speed = movementSpeed();
    unit.trail = [{ x: unit.x, y: unit.y }];
    state.selected.delete(unit.id);
    return true;
  }

  function launchUnitToPoint(unit, x, y, index = 0, count = 1) {
    const offset = guardFormationOffset(index, count);

    unit.state = "moving";
    unit.nodeId = null;
    unit.targetId = null;
    unit.targetX = x + offset.x;
    unit.targetY = y + offset.y;
    unit.guardX = null;
    unit.guardY = null;
    resetMovementTargets(unit);
    unit.selected = false;
    unit.ordered = true;
    unit.speed = movementSpeed();
    unit.trail = [{ x: unit.x, y: unit.y }];
    state.selected.delete(unit.id);
    return true;
  }

  function selectedLocalUnits() {
    return state.units.filter(
      (unit) =>
        state.selected.has(unit.id) &&
        isSelectableUnit(unit, localOwner()),
    );
  }

  function executeUnitOrderToNode(owner, unitIds, target) {
    const unitIdSet = new Set(unitIds);
    const selectedUnits = state.units.filter(
      (unit) => unitIdSet.has(unit.id) && isSelectableUnit(unit, owner),
    );

    let sent = 0;
    selectedUnits.forEach((unit) => {
      if (launchUnit(unit, target)) {
        sent += 1;
      }
    });

    return sent;
  }

  function executeUnitOrderToPoint(owner, unitIds, x, y) {
    const unitIdSet = new Set(unitIds);
    const selectedUnits = state.units.filter(
      (unit) => unitIdSet.has(unit.id) && isSelectableUnit(unit, owner),
    );

    let sent = 0;
    selectedUnits.forEach((unit, index) => {
      if (launchUnitToPoint(unit, x, y, index, selectedUnits.length)) {
        sent += 1;
      }
    });

    return sent;
  }

  function nextOrderId() {
    state.match.orderSequence += 1;
    return `${state.match.clientId}:${state.match.orderSequence}`;
  }

  function markPendingOrder(orderId) {
    state.match.pendingOrderAck = orderId;
    state.match.pendingOrderSince = performance.now();
  }

  function dispatchSelected(target) {
    const selectedUnits = selectedLocalUnits();
    const unitIds = selectedUnits.map((unit) => unit.id);
    if (unitIds.length === 0) {
      return;
    }

    if (isMultiplayerClient()) {
      const order = {
        kind: "node",
        owner: localOwner(),
        unitIds,
        targetId: target.id,
        orderId: nextOrderId(),
      };
      if (sendNetworkMessage({
        type: "order",
        order,
      })) {
        markPendingOrder(order.orderId);
        executeUnitOrderToNode(localOwner(), unitIds, target);
      }
    } else {
      executeUnitOrderToNode(localOwner(), unitIds, target);
      sendSnapshot(true);
    }

    clearSelection();
  }

  function dispatchSelectedToPoint(x, y) {
    const selectedUnits = selectedLocalUnits();
    const unitIds = selectedUnits.map((unit) => unit.id);
    if (unitIds.length === 0) {
      return;
    }

    if (isMultiplayerClient()) {
      const order = {
        kind: "point",
        owner: localOwner(),
        unitIds,
        xRatio: clamp(x / worldWidth(), 0, 1),
        yRatio: clamp(y / worldHeight(), 0, 1),
        orderId: nextOrderId(),
      };
      if (sendNetworkMessage({
        type: "order",
        order,
      })) {
        markPendingOrder(order.orderId);
        executeUnitOrderToPoint(localOwner(), unitIds, x, y);
      }
    } else {
      executeUnitOrderToPoint(localOwner(), unitIds, x, y);
      sendSnapshot(true);
    }

    clearSelection();
  }

  function addHp(node, amount) {
    node.hp += amount;
    syncNodeRadius(node);
    node.flash = Math.max(node.flash, 0.55);
  }

  function stationUnit(unit, node, options = {}) {
    const currentAngle = Math.atan2(unit.y - node.y, unit.x - node.x);
    const currentRadius = distance(unit.x, unit.y, node.x, node.y);
    const orbitRadius = options.preserveOrbit
      ? currentRadius
      : node.radius + rand(11, 26);

    unit.state = "stationed";
    unit.nodeId = node.id;
    unit.homeNodeId = node.id;
    unit.targetId = null;
    unit.targetX = null;
    unit.targetY = null;
    unit.guardX = null;
    unit.guardY = null;
    resetMovementTargets(unit);
    unit.ordered = false;
    unit.angle = currentAngle + (options.preserveOrbit ? 0 : rand(-0.22, 0.22));
    unit.orbitBlend = options.preserveOrbit ? 0 : 1;
    unit.orbitRadius = orbitRadius;
    unit.orbitSpeed = randomOrbitSpeed(0.18, 0.38);
    unit.selected = false;
    unit.trail = [];
  }

  function guardUnit(unit, x, y) {
    unit.state = "guarding";
    unit.nodeId = null;
    unit.homeNodeId = null;
    unit.targetId = null;
    unit.targetX = null;
    unit.targetY = null;
    unit.guardX = x;
    unit.guardY = y;
    resetMovementTargets(unit);
    unit.ordered = false;
    unit.angle = Math.atan2(unit.y - y, unit.x - x) + rand(-0.28, 0.28);
    unit.orbitRadius = rand(GUARD_HOVER_MIN, GUARD_HOVER_MAX);
    unit.orbitSpeed = randomOrbitSpeed(0.12, 0.24);
    unit.selected = false;
    unit.trail = [];
  }

  function captureNode(node, owner) {
    node.owner = owner;
    node.hp = CAPTURED_NODE_HP;
    node.captureRemaining = 0;
    node.production = 0;
    node.flash = 1;
    syncNodeRadius(node);
  }

  function resolveFriendlyArrival(unit, node) {
    if (unit.ordered && unit.homeNodeId === node.id) {
      addHp(node, 1);
      removeUnit(unit);
      return;
    }
    stationUnit(unit, node, { preserveOrbit: true });
  }

  function resolveNeutralArrival(unit, node) {
    if (node.captureRemaining > 0) {
      node.captureRemaining -= 1;
      node.flash = Math.max(node.flash, 0.45);
      removeUnit(unit);
      if (node.captureRemaining <= 0) {
        captureNode(node, unit.owner);
      }
      return;
    }

    captureNode(node, unit.owner);
    stationUnit(unit, node);
  }

  function resolveEnemyArrival(unit, node) {
    const defenders = stationedUnitsAt(node.id, node.owner);
    if (defenders.length > 0) {
      removeUnit(defenders[0]);
      removeUnit(unit);
      node.flash = Math.max(node.flash, 0.6);
      return;
    }

    if (node.hp > 0) {
      node.hp -= 1;
      node.flash = Math.max(node.flash, 0.5);
      removeUnit(unit);
      if (node.hp <= 0) {
        captureNode(node, unit.owner);
      } else {
        syncNodeRadius(node);
      }
      return;
    }

    captureNode(node, unit.owner);
    stationUnit(unit, node);
  }

  function resolveArrival(unit, node) {
    if (!node) {
      removeUnit(unit);
      return;
    }

    if (node.owner === unit.owner) {
      resolveFriendlyArrival(unit, node);
      return;
    }

    if (node.owner === OWNER.NEUTRAL) {
      resolveNeutralArrival(unit, node);
      return;
    }

    resolveEnemyArrival(unit, node);
  }

  function updateStationedUnitVisual(unit, dt) {
    const node = getNode(unit.nodeId);
    if (!node || node.owner !== unit.owner) {
      return false;
    }

    const orbitBlend = unit.orbitBlend ?? 1;
    unit.angle += unit.orbitSpeed * dt * orbitBlend;
    unit.orbitRadius +=
      (node.radius + 15 - unit.orbitRadius) * dt * 0.2 * orbitBlend;
    unit.orbitBlend = clamp(orbitBlend + dt * 2.4, 0, 1);
    const wobble = Math.sin(performance.now() * 0.0014 + unit.id) * 1.4 * orbitBlend;
    unit.x = node.x + Math.cos(unit.angle) * (unit.orbitRadius + wobble);
    unit.y = node.y + Math.sin(unit.angle) * (unit.orbitRadius + wobble);
    return true;
  }

  function updateGuardingUnitVisual(unit, dt) {
    if (unit.guardX === null || unit.guardY === null) {
      return false;
    }

    unit.angle += unit.orbitSpeed * dt;
    const wobble = Math.sin(performance.now() * 0.0013 + unit.id) * 0.45;
    const hoverRadius = Math.max(0.5, unit.orbitRadius + wobble);
    unit.x = unit.guardX + Math.cos(unit.angle) * hoverRadius;
    unit.y = unit.guardY + Math.sin(unit.angle) * hoverRadius;
    return true;
  }

  function updateNodes(dt) {
    state.nodes.forEach((node) => {
      node.flash = Math.max(0, node.flash - dt * 2.2);
      syncNodeRadius(node);
      if (node.owner === OWNER.NEUTRAL) {
        return;
      }

      const stationedCount = stationedUnitsAt(node.id, node.owner).length;
      if (stationedCount >= maxStationedForHp(node.hp) || state.units.length >= MAX_UNITS) {
        return;
      }

      node.production += productionRateFor(node.owner, node.hp) * dt;
      while (
        node.production >= 1 &&
        stationedUnitsAt(node.id, node.owner).length < maxStationedForHp(node.hp) &&
        state.units.length < MAX_UNITS
      ) {
        addUnit(node.owner, node);
        node.production -= 1;
      }
    });
  }

  function updateUnits(dt) {
    const unitsSnapshot = [...state.units];
    unitsSnapshot.forEach((unit) => {
      if (!state.units.includes(unit)) {
        return;
      }

      if (unit.state === "stationed") {
        if (!updateStationedUnitVisual(unit, dt)) {
          removeUnit(unit);
        }
        return;
      }

      if (unit.state === "guarding") {
        if (!updateGuardingUnitVisual(unit, dt)) {
          removeUnit(unit);
        }
        return;
      }

      if (unit.state !== "moving") {
        return;
      }

      const target = unit.targetId === null ? null : getNode(unit.targetId);
      let targetX = unit.targetX;
      let targetY = unit.targetY;
      let arrivalDistance = GUARD_ARRIVAL_DISTANCE;
      let speedScale = 1;
      let slowRadius = null;
      let minSpeedScale = 1;

      if (target) {
        if (target.owner === unit.owner) {
          if (unit.ordered && unit.homeNodeId === target.id) {
            resetMovementTargets(unit);
            targetX = target.x;
            targetY = target.y;
            arrivalDistance = FRIENDLY_ARRIVAL_DISTANCE;
          } else {
            const approachAngle =
              unit.nodeApproachAngle ??
              (distance(unit.x, unit.y, target.x, target.y) > 0
                ? Math.atan2(unit.y - target.y, unit.x - target.x)
                : rand(0, TAU));
            const approachPadding = unit.nodeApproachPadding ?? stationBandPadding();
            const stationTarget = nodeStationPoint(target, approachAngle, approachPadding);
            unit.nodeApproachAngle = approachAngle;
            unit.nodeApproachPadding = approachPadding;
            targetX = stationTarget.x;
            targetY = stationTarget.y;
            arrivalDistance = FRIENDLY_ARRIVAL_DISTANCE;
            slowRadius = FRIENDLY_SLOW_RADIUS;
            minSpeedScale = FRIENDLY_MIN_SPEED_SCALE;
          }
        } else {
          targetX = target.x;
          targetY = target.y;
          arrivalDistance = Math.max(7, target.radius * 0.52);
        }
      }

      if (targetX === null || targetY === null) {
        removeUnit(unit);
        return;
      }

      const dx = targetX - unit.x;
      const dy = targetY - unit.y;
      const d = Math.hypot(dx, dy);
      if (!target) {
        slowRadius = GUARD_SLOW_RADIUS;
        minSpeedScale = GUARD_MIN_SPEED_SCALE;
      }
      if (slowRadius !== null) {
        speedScale = clamp(d / slowRadius, minSpeedScale, 1);
      }

      unit.trail.push({ x: unit.x, y: unit.y });
      if (unit.trail.length > 7) {
        unit.trail.shift();
      }

      if (d <= arrivalDistance) {
        if (target) {
          resolveArrival(unit, target);
        } else {
          guardUnit(unit, targetX, targetY);
        }
        return;
      }

      const step = Math.min(d, unit.speed * speedScale * dt);
      unit.x += (dx / d) * step;
      unit.y += (dy / d) * step;
    });
  }

  function updateClientVisuals(dt) {
    state.nodes.forEach((node) => {
      node.flash = Math.max(0, node.flash - dt * 2.2);
    });

    state.units.forEach((unit) => {
      if (unit.state === "stationed") {
        updateStationedUnitVisual(unit, dt);
        return;
      }

      if (unit.state === "guarding") {
        updateGuardingUnitVisual(unit, dt);
        return;
      }

      if (unit.state !== "moving") {
        return;
      }

      const target = unit.targetId === null ? null : getNode(unit.targetId);
      let targetX = unit.targetX;
      let targetY = unit.targetY;
      let speedScale = 1;
      let slowRadius = null;
      let minSpeedScale = 1;

      if (target) {
        if (target.owner === unit.owner) {
          if (unit.ordered && unit.homeNodeId === target.id) {
            targetX = target.x;
            targetY = target.y;
          } else {
            const approachAngle =
              unit.nodeApproachAngle ??
              (distance(unit.x, unit.y, target.x, target.y) > 0
                ? Math.atan2(unit.y - target.y, unit.x - target.x)
                : 0);
            const approachPadding = unit.nodeApproachPadding ?? FRIENDLY_STATION_MIN;
            const stationTarget = nodeStationPoint(target, approachAngle, approachPadding);
            unit.nodeApproachAngle = approachAngle;
            unit.nodeApproachPadding = approachPadding;
            targetX = stationTarget.x;
            targetY = stationTarget.y;
            slowRadius = FRIENDLY_SLOW_RADIUS;
            minSpeedScale = FRIENDLY_MIN_SPEED_SCALE;
          }
        } else {
          targetX = target.x;
          targetY = target.y;
        }
      }

      if (targetX === null || targetY === null) {
        return;
      }

      const dx = targetX - unit.x;
      const dy = targetY - unit.y;
      const d = Math.hypot(dx, dy);
      if (d <= 0.001) {
        return;
      }

      if (!target) {
        slowRadius = GUARD_SLOW_RADIUS;
        minSpeedScale = GUARD_MIN_SPEED_SCALE;
      }
      if (slowRadius !== null) {
        speedScale = clamp(d / slowRadius, minSpeedScale, 1);
      }

      unit.trail.push({ x: unit.x, y: unit.y });
      if (unit.trail.length > 7) {
        unit.trail.shift();
      }

      const step = Math.min(d, unit.speed * speedScale * dt);
      unit.x += (dx / d) * step;
      unit.y += (dy / d) * step;
    });
  }

  function resolveGuardInterceptions() {
    const movingUnits = state.units.filter((unit) => unit.state === "moving");
    movingUnits.forEach((movingUnit) => {
      if (!state.units.includes(movingUnit)) {
        return;
      }

      const guard = state.units.find(
        (unit) =>
          unit.state === "guarding" &&
          unit.owner !== movingUnit.owner &&
          distance(unit.x, unit.y, movingUnit.x, movingUnit.y) <= GUARD_RADIUS,
      );

      if (!guard) {
        return;
      }

      removeUnit(guard);
      removeUnit(movingUnit);
    });
  }

  function otherOwner(owner) {
    return owner === OWNER.AI ? OWNER.PLAYER : OWNER.AI;
  }

  function ownerCounts(player = 0, ai = 0) {
    return {
      [OWNER.PLAYER]: player,
      [OWNER.AI]: ai,
    };
  }

  function productionRateFor(owner, hp) {
    if (owner === OWNER.NEUTRAL) {
      return 0;
    }
    const multiplier = receivesSingleplayerAiAdvantage(owner)
      ? AI_SINGLEPLAYER_PRODUCTION_MULTIPLIER
      : 1;
    return productionRateFromHp(hp) * multiplier;
  }

  function travelTimeBetween(a, b) {
    return distance(a.x, a.y, b.x, b.y) / AI_AVERAGE_SPEED;
  }

  function travelTimeFromPoint(x, y, target) {
    return distance(x, y, target.x, target.y) / AI_AVERAGE_SPEED;
  }

  function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0.0001) {
      return distance(px, py, ax, ay);
    }

    const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
    return distance(px, py, ax + dx * t, ay + dy * t);
  }

  function snapshotState() {
    const nodes = state.nodes.map((node) => ({
      id: node.id,
      owner: node.owner,
      x: node.x,
      y: node.y,
      hp: node.hp,
      captureRequired: node.captureRequired,
      captureRemaining: node.captureRemaining,
      production: node.production,
      radius: node.radius,
      stationed: ownerCounts(),
    }));
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const fleets = [];
    const guards = [];

    state.units.forEach((unit) => {
      if (unit.state === "stationed" && nodeMap.has(unit.nodeId)) {
        nodeMap.get(unit.nodeId).stationed[unit.owner] += 1;
        return;
      }

      if (unit.state === "guarding") {
        guards.push({
          owner: unit.owner,
          x: unit.guardX ?? unit.x,
          y: unit.guardY ?? unit.y,
          count: 1,
          readyAt: 0,
        });
        return;
      }

      if (unit.state === "moving" && unit.targetId !== null && nodeMap.has(unit.targetId)) {
        const target = nodeMap.get(unit.targetId);
        const unitSpeed = Math.max(1, unit.speed || AI_AVERAGE_SPEED);
        fleets.push({
          owner: unit.owner,
          sourceId: unit.homeNodeId,
          targetId: unit.targetId,
          count: 1,
          eta: travelTimeFromPoint(unit.x, unit.y, target) * (AI_AVERAGE_SPEED / unitSpeed),
          invest: unit.ordered && unit.homeNodeId === unit.targetId,
          sourceX: unit.x,
          sourceY: unit.y,
          targetX: target.x,
          targetY: target.y,
          exposure: 0,
        });
      }
    });

    return {
      width: worldWidth(),
      height: worldHeight(),
      nodes,
      nodeMap,
      fleets,
      guards,
    };
  }

  function nodeByIdFromSnapshot(snapshot, id) {
    return snapshot.nodeMap.get(id);
  }

  function stationedOn(node, owner) {
    return node.stationed[owner] || 0;
  }

  function knownInboundTo(snapshot, node, owner, horizon = AI_HORIZON) {
    return snapshot.fleets.reduce((sum, fleet) => {
      if (fleet.owner === owner && fleet.targetId === node.id && fleet.eta <= horizon) {
        return sum + fleet.count;
      }
      return sum;
    }, 0);
  }

  function potentialThreatTo(snapshot, node, owner, horizon = AI_HORIZON) {
    const enemy = otherOwner(owner);
    return snapshot.nodes.reduce((sum, source) => {
      if (source.owner !== enemy) {
        return sum;
      }

      const eta = travelTimeBetween(source, node);
      if (eta > horizon) {
        return sum;
      }

      const mobile = Math.max(0, stationedOn(source, enemy) - 3);
      const urgency = 1 - eta / horizon;
      return sum + mobile * urgency * 0.42;
    }, 0);
  }

  function reserveForNode(snapshot, node, owner = OWNER.AI) {
    const stationed = stationedOn(node, owner);
    if (stationed <= 0 || node.owner !== owner) {
      return 0;
    }

    const knownThreat = knownInboundTo(
      snapshot,
      node,
      otherOwner(owner),
      AI_HORIZON * 0.75,
    );

    const knownSupport = knownInboundTo(
      snapshot,
      node,
      owner,
      AI_HORIZON * 0.75,
    );

    const uncoveredThreat = Math.max(0, knownThreat - knownSupport - node.hp);
    const baseReserve = Math.min(AI_MIN_NODE_RESERVE, stationed);
    const reserve = Math.ceil(baseReserve + uncoveredThreat);

    return Math.min(stationed, reserve);
  }

  function availableFromNode(snapshot, node, owner, reserved = new Map()) {
    const alreadyReserved = reserved.get(node.id) || 0;
    return Math.max(0, stationedOn(node, owner) - reserveForNode(snapshot, node, owner) - alreadyReserved);
  }

  function nodeStrategicValue(snapshot, node, owner = OWNER.AI) {
    const centerX = snapshot.width / 2;
    const centerY = snapshot.height / 2;
    const boardRadius = Math.max(1, Math.hypot(snapshot.width, snapshot.height) / 2);
    const centrality = 1 - clamp(distance(node.x, node.y, centerX, centerY) / boardRadius, 0, 1);
    const closestEnemy = snapshot.nodes
      .filter((candidate) => candidate.owner === otherOwner(owner))
      .reduce((best, candidate) => Math.min(best, travelTimeBetween(node, candidate)), AI_HORIZON);
    const frontValue = 1 - clamp(closestEnemy / AI_HORIZON, 0, 1);
    const futureProduction =
      node.owner === OWNER.NEUTRAL
        ? productionRateFor(owner, CAPTURED_NODE_HP)
        : productionRateFor(node.owner, node.hp);

    return 9 + futureProduction * 85 + centrality * 5 + frontValue * 6;
  }

  function snapshotTotalUnits(snapshot, owner) {
    const stationedTotal = snapshot.nodes.reduce(
      (sum, node) => sum + stationedOn(node, owner),
      0,
    );
    const fleetTotal = snapshot.fleets.reduce(
      (sum, fleet) => (fleet.owner === owner ? sum + fleet.count : sum),
      0,
    );
    const guardTotal = snapshot.guards.reduce(
      (sum, guard) => (guard.owner === owner ? sum + guard.count : sum),
      0,
    );

    return stationedTotal + fleetTotal + guardTotal;
  }

  function createSim(snapshot) {
    const nodes = snapshot.nodes.map((node) => ({
      id: node.id,
      owner: node.owner,
      x: node.x,
      y: node.y,
      hp: node.hp,
      captureRequired: node.captureRequired,
      captureRemaining: node.captureRemaining,
      production: node.production,
      radius: node.radius,
    }));
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const stationed = new Map();

    snapshot.nodes.forEach((node) => {
      stationed.set(node.id, ownerCounts(stationedOn(node, OWNER.PLAYER), stationedOn(node, OWNER.AI)));
    });

    return {
      width: snapshot.width,
      height: snapshot.height,
      nodes,
      nodeMap,
      stationed,
      fleets: snapshot.fleets.map((fleet) => ({ ...fleet })),
      guards: snapshot.guards.map((guard) => ({ ...guard })),
      time: 0,
    };
  }

  function simStationed(sim, nodeId, owner) {
    return (sim.stationed.get(nodeId)?.[owner]) || 0;
  }

  function addSimStationed(sim, nodeId, owner, amount) {
    const counts = sim.stationed.get(nodeId);
    if (!counts || amount <= 0) {
      return;
    }
    counts[owner] += amount;
  }

  function produceSim(sim, dt) {
    if (dt <= 0) {
      return;
    }

    sim.nodes.forEach((node) => {
      if (node.owner === OWNER.NEUTRAL) {
        return;
      }

      const counts = sim.stationed.get(node.id);
      const cap = maxStationedForHp(node.hp);
      if (!counts || counts[node.owner] >= cap) {
        return;
      }

      node.production += productionRateFor(node.owner, node.hp) * dt;
      while (node.production >= 1 && counts[node.owner] < cap) {
        counts[node.owner] += 1;
        node.production -= 1;
      }
    });
  }

  function captureNodeSim(sim, node, owner, stationedCount = 0) {
    node.owner = owner;
    node.hp = CAPTURED_NODE_HP;
    node.captureRemaining = 0;
    node.production = 0;

    const counts = sim.stationed.get(node.id);
    counts[OWNER.PLAYER] = 0;
    counts[OWNER.AI] = 0;
    if (owner !== OWNER.NEUTRAL) {
      counts[owner] = Math.max(0, stationedCount);
    }
  }

  function resolveSimArrival(sim, fleet) {
    const node = sim.nodeMap.get(fleet.targetId);
    let count = Math.floor(fleet.count);
    if (!node || count <= 0) {
      return;
    }

    if (node.owner === fleet.owner) {
      if (fleet.invest) {
        node.hp += count;
      } else {
        addSimStationed(sim, node.id, fleet.owner, count);
      }
      return;
    }

    if (node.owner === OWNER.NEUTRAL) {
      const needed = Math.max(0, node.captureRemaining);
      if (count < needed) {
        node.captureRemaining -= count;
        return;
      }

      count -= needed;
      captureNodeSim(sim, node, fleet.owner, count);
      return;
    }

    const defender = node.owner;
    const counts = sim.stationed.get(node.id);
    const traded = Math.min(count, counts[defender]);
    counts[defender] -= traded;
    count -= traded;
    if (count <= 0) {
      return;
    }

    if (node.hp > 0) {
      const damage = Math.min(count, node.hp);
      node.hp -= damage;
      count -= damage;
      if (node.hp <= 0) {
        captureNodeSim(sim, node, fleet.owner, count);
      }
      return;
    }

    captureNodeSim(sim, node, fleet.owner, count);
  }

  function fleetGuardExposure(sim, fleet) {
    if (
      fleet.sourceX === null ||
      fleet.sourceY === null ||
      fleet.targetX === null ||
      fleet.targetY === null
    ) {
      return 0;
    }

    return sim.guards.reduce((sum, guard) => {
      const readyAt = guard.readyAt ?? 0;
      if (guard.owner === fleet.owner || readyAt > fleet.eta) {
        return sum;
      }

      const d = distanceToSegment(
        guard.x,
        guard.y,
        fleet.sourceX,
        fleet.sourceY,
        fleet.targetX,
        fleet.targetY,
      );
      return d <= GUARD_RADIUS ? sum + guard.count : sum;
    }, 0);
  }

  function applyOrderToSim(sim, order, owner, delay = 0) {
    if (!order || !order.legs) {
      return;
    }

    order.legs.forEach((leg) => {
      const source = sim.nodeMap.get(leg.sourceId);
      if (!source || source.owner !== owner) {
        return;
      }

      const counts = sim.stationed.get(source.id);
      const count = Math.min(Math.floor(leg.count), counts[owner]);
      if (count <= 0) {
        return;
      }
      counts[owner] -= count;

      if (leg.kind === "point") {
        const eta = delay + distance(source.x, source.y, leg.x, leg.y) / AI_AVERAGE_SPEED;
        sim.guards.push({
          owner,
          x: leg.x,
          y: leg.y,
          count,
          readyAt: eta,
        });
        return;
      }

      const target = sim.nodeMap.get(leg.targetId);
      if (!target) {
        return;
      }

      const selfTarget = source.id === target.id;
      const eta = delay + (selfTarget ? 0.35 : travelTimeBetween(source, target));
      const fleet = {
        owner,
        sourceId: source.id,
        targetId: target.id,
        count,
        eta,
        invest: Boolean(leg.invest),
        sourceX: source.x,
        sourceY: source.y,
        targetX: target.x,
        targetY: target.y,
        exposure: 0,
      };
      fleet.exposure = fleetGuardExposure(sim, fleet);
      if (!fleet.invest && fleet.exposure > 0) {
        fleet.count = Math.max(0, fleet.count - Math.min(fleet.count, fleet.exposure));
      }
      if (fleet.count > 0) {
        sim.fleets.push(fleet);
      }
    });
  }

  function simulateFuture(snapshot, aiOrder, opponentPolicy = "none", horizon = AI_HORIZON) {
    const sim = createSim(snapshot);
    applyOrderToSim(sim, aiOrder, OWNER.AI);
    applyOrderToSim(
      sim,
      buildOpponentResponse(snapshot, aiOrder, opponentPolicy),
      OWNER.PLAYER,
      AI_RESPONSE_DELAY,
    );

    const arrivals = sim.fleets
      .filter((fleet) => fleet.eta <= horizon)
      .sort((a, b) => a.eta - b.eta);
    const pending = sim.fleets
      .filter((fleet) => fleet.eta > horizon)
      .map((fleet) => ({ ...fleet, eta: fleet.eta - horizon }));

    arrivals.forEach((fleet) => {
      const eventTime = clamp(fleet.eta, sim.time, horizon);
      produceSim(sim, eventTime - sim.time);
      sim.time = eventTime;
      resolveSimArrival(sim, fleet);
    });

    produceSim(sim, horizon - sim.time);
    sim.time = horizon;
    sim.fleets = pending;
    return sim;
  }

  function buildNodeTransferOrder(snapshot, owner, type, target, required, options = {}) {
    const needed = Math.max(1, Math.ceil(required));
    const reserved = new Map();
    const legs = [];
    let remaining = needed;
    const sources = snapshot.nodes
      .filter((node) => node.owner === owner && (options.includeTarget || node.id !== target.id))
      .sort((a, b) => {
        const travelA = travelTimeBetween(a, target);
        const travelB = travelTimeBetween(b, target);
        const surplusA = availableFromNode(snapshot, a, owner);
        const surplusB = availableFromNode(snapshot, b, owner);
        return travelA - surplusA * 0.08 - (travelB - surplusB * 0.08);
      });

    sources.forEach((source) => {
      if (remaining <= 0) {
        return;
      }

      const available = availableFromNode(snapshot, source, owner, reserved);
      const count = Math.min(available, remaining);
      if (count <= 0) {
        return;
      }

      reserved.set(source.id, (reserved.get(source.id) || 0) + count);
      legs.push({
        kind: "node",
        sourceId: source.id,
        targetId: target.id,
        count,
        invest: Boolean(options.invest),
      });
      remaining -= count;
    });

    if (legs.length === 0 || (remaining > 0 && !options.allowPartial)) {
      return null;
    }

    return {
      type,
      targetId: target.id,
      required: needed,
      committed: needed - remaining,
      scoreBias: options.scoreBias || 0,
      legs,
    };
  }

  function buildFixedSourceOrder(snapshot, owner, type, source, target, count, options = {}) {
    const available = availableFromNode(snapshot, source, owner);
    const committed = Math.min(Math.floor(count), available);
    if (committed <= 0) {
      return null;
    }

    return {
      type,
      targetId: target.id,
      required: committed,
      committed,
      scoreBias: options.scoreBias || 0,
      legs: [
        {
          kind: "node",
          sourceId: source.id,
          targetId: target.id,
          count: committed,
          invest: Boolean(options.invest),
        },
      ],
    };
  }

  function buildPointOrder(snapshot, owner, type, x, y, count, options = {}) {
    const targetPoint = { x, y };
    const source = snapshot.nodes
      .filter((node) => node.owner === owner && availableFromNode(snapshot, node, owner) > 0)
      .sort((a, b) => travelTimeBetween(a, targetPoint) - travelTimeBetween(b, targetPoint))[0];
    if (!source) {
      return null;
    }

    const committed = Math.min(Math.floor(count), availableFromNode(snapshot, source, owner));
    if (committed <= 0) {
      return null;
    }

    return {
      type,
      targetId: null,
      required: committed,
      committed,
      scoreBias: options.scoreBias || 0,
      legs: [
        {
          kind: "point",
          sourceId: source.id,
          x,
          y,
          count: committed,
        },
      ],
    };
  }

  function defenseNeed(snapshot, node) {
    if (node.owner !== OWNER.AI) {
      return 0;
    }

    const events = snapshot.fleets
      .filter((fleet) => fleet.targetId === node.id && fleet.eta <= AI_HORIZON * 0.7)
      .sort((a, b) => a.eta - b.eta);
    if (!events.some((fleet) => fleet.owner === OWNER.PLAYER)) {
      return 0;
    }

    let time = 0;
    let hp = node.hp;
    let stationed = stationedOn(node, OWNER.AI);
    let production = node.production;
    let worstMargin = stationed + hp;

    events.forEach((fleet) => {
      const dt = Math.max(0, fleet.eta - time);
      const cap = maxStationedForHp(hp);
      production += productionRateFor(OWNER.AI, hp) * dt;
      while (production >= 1 && stationed < cap) {
        stationed += 1;
        production -= 1;
      }
      time = fleet.eta;

      if (fleet.owner === OWNER.AI) {
        stationed += fleet.count;
      } else {
        let attackers = fleet.count;
        const traded = Math.min(stationed, attackers);
        stationed -= traded;
        attackers -= traded;
        const damage = Math.min(hp, attackers);
        hp -= damage;
        attackers -= damage;
        if (hp <= 0 && (damage > 0 || attackers > 0)) {
          worstMargin = Math.min(worstMargin, -Math.max(1, attackers));
          return;
        }
      }

      worstMargin = Math.min(worstMargin, stationed + hp);
    });

    return Math.max(0, AI_SAFETY_MARGIN - worstMargin);
  }

  function generateDefenseCandidates(snapshot) {
    return snapshot.nodes
      .filter((node) => node.owner === OWNER.AI)
      .map((node) => {
        const need = defenseNeed(snapshot, node);
        if (need <= 0) {
          return null;
        }
        return buildNodeTransferOrder(snapshot, OWNER.AI, "defend", node, need, {
          allowPartial: true,
          scoreBias: 70 + need * 8,
        });
      })
      .filter(Boolean);
  }

  function generateExpansionCandidates(snapshot) {
    return snapshot.nodes
      .filter((node) => node.owner === OWNER.NEUTRAL)
      .map((node) => {
        const contestRisk =
          potentialThreatTo(snapshot, node, OWNER.AI, AI_HORIZON) *
          AI_EXPANSION_CONTEST_SCALE;
        const required = node.captureRemaining + 1 + Math.ceil(contestRisk);
        const order = buildNodeTransferOrder(snapshot, OWNER.AI, "capture", node, required, {
          scoreBias:
            AI_EXPANSION_BONUS +
            nodeStrategicValue(snapshot, node) * AI_EXPANSION_VALUE_WEIGHT -
            required * AI_EXPANSION_COST_WEIGHT,
        });
        if (!order) {
          return null;
        }
        const closestAi = snapshot.nodes
          .filter((candidate) => candidate.owner === OWNER.AI)
          .reduce((best, candidate) => Math.min(best, travelTimeBetween(candidate, node)), AI_HORIZON);
        order.scoreBias += Math.max(0, 12 - closestAi);
        return order;
      })
      .filter(Boolean)
      .sort((a, b) => b.scoreBias - a.scoreBias)
      .slice(0, 7);
  }

  function attackNeed(snapshot, target) {
    const sourceEta = snapshot.nodes
      .filter((node) => node.owner === OWNER.AI && availableFromNode(snapshot, node, OWNER.AI) > 0)
      .reduce((best, source) => Math.min(best, travelTimeBetween(source, target)), AI_HORIZON);
    const projectedProduction = productionRateFor(OWNER.PLAYER, target.hp) * Math.min(sourceEta, AI_HORIZON);
    const projectedDefenders =
      stationedOn(target, OWNER.PLAYER) +
      target.hp +
      Math.floor(projectedProduction) +
      knownInboundTo(snapshot, target, OWNER.PLAYER, sourceEta + AI_RESPONSE_DELAY);

    return projectedDefenders + AI_SAFETY_MARGIN + AI_ATTACK_NEED_PADDING;
  }

  function generateAttackCandidates(snapshot) {
    const unitAdvantage = snapshotTotalUnits(snapshot, OWNER.AI) - snapshotTotalUnits(snapshot, OWNER.PLAYER);
    const nodeLead =
      snapshot.nodes.filter((node) => node.owner === OWNER.AI).length -
      snapshot.nodes.filter((node) => node.owner === OWNER.PLAYER).length;
    return snapshot.nodes
      .filter((node) => node.owner === OWNER.PLAYER)
      .map((node) => {
        const required = attackNeed(snapshot, node);
        const decisiveBias =
          nodeLead >= AI_DECISIVE_NODE_LEAD || unitAdvantage >= AI_DECISIVE_UNIT_LEAD
            ? AI_FINISH_BIAS
            : 0;
        const order = buildNodeTransferOrder(
          snapshot,
          OWNER.AI,
          "attack",
          node,
          required + (decisiveBias > 0 ? AI_FINISH_OVERKILL : 0),
          {
            scoreBias:
              nodeStrategicValue(snapshot, node) * AI_ATTACK_VALUE_WEIGHT -
              required * AI_ATTACK_COST_WEIGHT +
              Math.max(0, unitAdvantage - AI_ATTACK_ADVANTAGE_GATE) *
                AI_ATTACK_ADVANTAGE_WEIGHT +
              decisiveBias,
          },
        );
        return order;
      })
      .filter(Boolean)
      .sort((a, b) => b.scoreBias - a.scoreBias)
      .slice(0, 6);
  }

  function generateSupplyCandidates(snapshot) {
    const playerNodes = snapshot.nodes.filter((node) => node.owner === OWNER.PLAYER);
    if (!playerNodes.length) {
      return [];
    }

    return snapshot.nodes
      .filter((source) => source.owner === OWNER.AI && availableFromNode(snapshot, source, OWNER.AI) >= 7)
      .map((source) => {
        const nearestEnemy = playerNodes
          .map((enemy) => ({ enemy, eta: travelTimeBetween(source, enemy) }))
          .sort((a, b) => a.eta - b.eta)[0]?.enemy;
        if (!nearestEnemy) {
          return null;
        }

        const target = snapshot.nodes
          .filter((node) => node.owner === OWNER.AI && node.id !== source.id)
          .filter((node) => travelTimeBetween(node, nearestEnemy) + 0.8 < travelTimeBetween(source, nearestEnemy))
          .sort((a, b) => {
            const aStrength = stationedOn(a, OWNER.AI) + a.hp;
            const bStrength = stationedOn(b, OWNER.AI) + b.hp;
            return travelTimeBetween(a, nearestEnemy) + aStrength * 0.04 -
              (travelTimeBetween(b, nearestEnemy) + bStrength * 0.04);
          })[0];
        if (!target) {
          return null;
        }

        const count = Math.min(12, Math.floor(availableFromNode(snapshot, source, OWNER.AI) * 0.45));
        return buildFixedSourceOrder(snapshot, OWNER.AI, "reinforce", source, target, count, {
          scoreBias: 8 + count,
        });
      })
      .filter(Boolean)
      .slice(0, 5);
  }

  function generateInvestCandidates(snapshot) {
    if (!AI_INVEST_ENABLED) {
      return [];
    }

    const enemyNodes = snapshot.nodes.filter((node) => node.owner === OWNER.PLAYER);
    if (!enemyNodes.length) {
      return [];
    }

    const neutralCount = snapshot.nodes.filter((node) => node.owner === OWNER.NEUTRAL).length;
    const aiNodeCount = snapshot.nodes.filter((node) => node.owner === OWNER.AI).length;

    return snapshot.nodes
      .filter((node) => node.owner === OWNER.AI)
      .map((node) => {
        const available = availableFromNode(snapshot, node, OWNER.AI);
        if (available < AI_INVEST_MIN_SURPLUS) {
          return null;
        }

        const closestEnemy = enemyNodes.reduce(
          (best, enemy) => Math.min(best, travelTimeBetween(node, enemy)),
          AI_HORIZON,
        );
        const frontline = closestEnemy <= AI_HORIZON * 0.55;
        if (!frontline && neutralCount > 0 && aiNodeCount < 6) {
          return null;
        }

        const pressure = potentialThreatTo(snapshot, node, OWNER.AI, AI_HORIZON * 0.65);
        const targetHp =
          (frontline ? AI_INVEST_FRONT_HP_TARGET : AI_INVEST_BACK_HP_TARGET) +
          Math.ceil(pressure * 0.1);
        const needed = Math.max(0, targetHp - node.hp);
        const count = Math.min(AI_INVEST_MAX_UNITS, available, needed);
        if (count <= 0) {
          return null;
        }

        return buildFixedSourceOrder(snapshot, OWNER.AI, "invest", node, node, count, {
          invest: true,
          scoreBias:
            AI_INVEST_SCORE_BIAS +
            count * 4 +
            (frontline ? 9 : 0) +
            Math.max(0, pressure) * 0.35,
        });
      })
      .filter(Boolean)
      .slice(0, 4);
  }

  function generateGuardCandidates(snapshot) {
    const playerNodes = snapshot.nodes.filter((node) => node.owner === OWNER.PLAYER);
    const aiNodeCount = snapshot.nodes.filter((node) => node.owner === OWNER.AI).length;
    const neutralCount = snapshot.nodes.filter((node) => node.owner === OWNER.NEUTRAL).length;
    const aiGuardCount = snapshot.guards.filter((guard) => guard.owner === OWNER.AI).length;
    if (
      !playerNodes.length ||
      (aiNodeCount < 5 && neutralCount > 0) ||
      aiGuardCount >= Math.max(4, aiNodeCount * 2)
    ) {
      return [];
    }

    return snapshot.nodes
      .filter((node) => node.owner === OWNER.AI)
      .map((front) => {
        const nearestEnemy = playerNodes
          .map((enemy) => ({ enemy, eta: travelTimeBetween(front, enemy) }))
          .sort((a, b) => a.eta - b.eta)[0];
        if (!nearestEnemy || nearestEnemy.eta > AI_HORIZON * 0.65) {
          return null;
        }

        const x = front.x * 0.68 + nearestEnemy.enemy.x * 0.32;
        const y = front.y * 0.68 + nearestEnemy.enemy.y * 0.32;
        const existingGuards = snapshot.guards.filter(
          (guard) => guard.owner === OWNER.AI && distance(guard.x, guard.y, x, y) < GUARD_RADIUS * 1.8,
        ).length;
        if (existingGuards >= 2) {
          return null;
        }

        const vulnerability =
          potentialThreatTo(snapshot, front, OWNER.AI, AI_HORIZON * 0.55) -
          (stationedOn(front, OWNER.AI) + front.hp) * 0.12;
        const count = clamp(Math.ceil(1 + vulnerability * 0.1), 1, 2);
        return buildPointOrder(snapshot, OWNER.AI, "guard", x, y, count, {
          scoreBias: 2 + Math.max(0, vulnerability) * 0.6,
        });
      })
      .filter(Boolean)
      .slice(0, 4);
  }

  function generateProactiveCandidates(snapshot) {
    return [
      ...generateExpansionCandidates(snapshot),
      ...generateAttackCandidates(snapshot),
      ...generateSupplyCandidates(snapshot),
      ...generateInvestCandidates(snapshot),
      ...generateGuardCandidates(snapshot),
    ]
      .sort((a, b) => b.scoreBias - a.scoreBias)
      .slice(0, AI_MAX_CANDIDATES);
  }

  function buildOpponentResponse(snapshot, aiOrder, policy) {
    if (!policy || policy === "none") {
      return null;
    }

    if (policy === "defend" && aiOrder?.targetId !== null && aiOrder?.targetId !== undefined) {
      const target = nodeByIdFromSnapshot(snapshot, aiOrder.targetId);
      if (!target) {
        return null;
      }

      if (target.owner === OWNER.PLAYER) {
        return buildNodeTransferOrder(snapshot, OWNER.PLAYER, "player-defend", target, aiOrder.committed * 0.75 + 2, {
          allowPartial: true,
          scoreBias: 0,
        });
      }

      if (target.owner === OWNER.NEUTRAL) {
        return buildNodeTransferOrder(snapshot, OWNER.PLAYER, "player-contest", target, target.captureRemaining + 2, {
          allowPartial: true,
          scoreBias: 0,
        });
      }
    }

    if (policy === "counter") {
      const target = snapshot.nodes
        .filter((node) => node.owner === OWNER.AI)
        .sort((a, b) => {
          const strengthA = stationedOn(a, OWNER.AI) + a.hp;
          const strengthB = stationedOn(b, OWNER.AI) + b.hp;
          return strengthA - strengthB;
        })[0];
      if (!target) {
        return null;
      }
      return buildNodeTransferOrder(snapshot, OWNER.PLAYER, "player-counter", target, stationedOn(target, OWNER.AI) + target.hp + 2, {
        allowPartial: true,
        scoreBias: 0,
      });
    }

    if (policy === "expand") {
      const target = snapshot.nodes
        .filter((node) => node.owner === OWNER.NEUTRAL)
        .sort((a, b) => {
          const valueA = nodeStrategicValue(snapshot, a, OWNER.PLAYER) - a.captureRemaining;
          const valueB = nodeStrategicValue(snapshot, b, OWNER.PLAYER) - b.captureRemaining;
          return valueB - valueA;
        })[0];
      if (!target) {
        return null;
      }
      return buildNodeTransferOrder(snapshot, OWNER.PLAYER, "player-expand", target, target.captureRemaining + 2, {
        allowPartial: true,
        scoreBias: 0,
      });
    }

    return null;
  }

  function simTotalUnits(sim, owner) {
    const stationedTotal = sim.nodes.reduce(
      (sum, node) => sum + simStationed(sim, node.id, owner),
      0,
    );
    const fleetTotal = sim.fleets.reduce(
      (sum, fleet) => (fleet.owner === owner ? sum + fleet.count * 0.72 : sum),
      0,
    );
    const guardTotal = sim.guards.reduce((sum, guard) => {
      if (guard.owner !== owner || (guard.readyAt ?? 0) > AI_HORIZON) {
        return sum;
      }
      return sum + guard.count * 0.78;
    }, 0);

    return stationedTotal + fleetTotal + guardTotal;
  }

  function simProduction(sim, owner) {
    return sim.nodes.reduce((sum, node) => {
      if (node.owner !== owner) {
        return sum;
      }
      return sum + productionRateFor(owner, node.hp);
    }, 0);
  }

  function simHp(sim, owner) {
    return sim.nodes.reduce((sum, node) => (node.owner === owner ? sum + node.hp : sum), 0);
  }

  function simInfluenceAt(sim, target, owner) {
    const nodeInfluence = sim.nodes.reduce((sum, source) => {
      if (source.owner !== owner) {
        return sum;
      }
      const mobile = simStationed(sim, source.id, owner) + source.hp * 0.55;
      return sum + mobile / (1 + travelTimeBetween(source, target) * 0.45);
    }, 0);
    const fleetInfluence = sim.fleets.reduce((sum, fleet) => {
      if (fleet.owner !== owner || fleet.targetId !== target.id) {
        return sum;
      }
      return sum + fleet.count / (1 + fleet.eta * 0.35);
    }, 0);
    const guardInfluence = sim.guards.reduce((sum, guard) => {
      if (guard.owner !== owner || (guard.readyAt ?? 0) > AI_HORIZON) {
        return sum;
      }
      const d = distance(guard.x, guard.y, target.x, target.y);
      return d < GUARD_RADIUS * 3 ? sum + guard.count * 0.55 : sum;
    }, 0);

    return nodeInfluence + fleetInfluence + guardInfluence;
  }

  function scoreFuture(sim) {
    const aiNodes = sim.nodes.filter((node) => node.owner === OWNER.AI);
    const playerNodes = sim.nodes.filter((node) => node.owner === OWNER.PLAYER);
    if (playerNodes.length === 0) {
      return 100000;
    }
    if (aiNodes.length === 0) {
      return -100000;
    }

    let nodeValue = 0;
    let influence = 0;
    let risk = 0;
    sim.nodes.forEach((node) => {
      const value = nodeStrategicValue(sim, node);
      if (node.owner === OWNER.AI) {
        nodeValue += value;
      } else if (node.owner === OWNER.PLAYER) {
        nodeValue -= value;
      } else {
        nodeValue -= node.captureRemaining * 0.25;
      }

      const aiInfluence = simInfluenceAt(sim, node, OWNER.AI);
      const playerInfluence = simInfluenceAt(sim, node, OWNER.PLAYER);
      influence += (aiInfluence - playerInfluence) * (node.owner === OWNER.AI ? 0.18 : 0.1);

      if (node.owner === OWNER.AI) {
        const margin = simStationed(sim, node.id, OWNER.AI) + node.hp - playerInfluence * 0.45;
        if (margin < AI_SAFETY_MARGIN) {
          risk += (AI_SAFETY_MARGIN - margin) * 12;
        }
      }
    });

    const production = (simProduction(sim, OWNER.AI) - simProduction(sim, OWNER.PLAYER)) * 260;
    const military =
      (simTotalUnits(sim, OWNER.AI) - simTotalUnits(sim, OWNER.PLAYER)) * 3.2 +
      (simHp(sim, OWNER.AI) - simHp(sim, OWNER.PLAYER)) * 1.15;
    const travelExposure = sim.fleets.reduce((sum, fleet) => {
      return fleet.owner === OWNER.AI ? sum + (fleet.exposure || 0) * 8 : sum;
    }, 0);

    return production + military + nodeValue * 5.5 + influence - risk - travelExposure;
  }

  function evaluateOrderRobustly(snapshot, order) {
    const policies = ["none", "defend", "counter", "expand"];
    const scores = policies.map((policy) => scoreFuture(simulateFuture(snapshot, order, policy)));
    const worst = Math.min(...scores);
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    return worst + average * 0.12 + (order?.scoreBias || 0);
  }

  function buildFallbackOrder(snapshot) {
    const aiNodes = snapshot.nodes.filter((node) => node.owner === OWNER.AI);
    const enemyTargets = snapshot.nodes
      .filter((node) => node.owner === OWNER.PLAYER)
      .sort((a, b) => stationedOn(a, OWNER.PLAYER) + a.hp - (stationedOn(b, OWNER.PLAYER) + b.hp));
    const neutralTargets = snapshot.nodes
      .filter((node) => node.owner === OWNER.NEUTRAL)
      .sort((a, b) => a.captureRemaining - b.captureRemaining);

    for (const source of aiNodes) {
      const available = availableFromNode(snapshot, source, OWNER.AI);
      if (available <= 4) {
        continue;
      }

      const weakEnemy = enemyTargets.find(
        (target) => stationedOn(target, OWNER.PLAYER) + target.hp + 2 < available,
      );
      if (weakEnemy) {
        return buildFixedSourceOrder(
          snapshot,
          OWNER.AI,
          "fallback-attack",
          source,
          weakEnemy,
          stationedOn(weakEnemy, OWNER.PLAYER) + weakEnemy.hp + 3,
          { scoreBias: 3 },
        );
      }

      const easyNeutral = neutralTargets.find((target) => target.captureRemaining + 1 < available);
      if (easyNeutral) {
        return buildFixedSourceOrder(
          snapshot,
          OWNER.AI,
          "fallback-capture",
          source,
          easyNeutral,
          easyNeutral.captureRemaining + 1,
          { scoreBias: 2 },
        );
      }
    }

    return null;
  }

  function canReserveOrder(snapshot, order, reserved) {
    if (!order?.legs?.length) {
      return false;
    }

    return order.legs.every((leg) => {
      const source = nodeByIdFromSnapshot(snapshot, leg.sourceId);
      if (!source || source.owner !== OWNER.AI) {
        return false;
      }
      return availableFromNode(snapshot, source, OWNER.AI, reserved) >= leg.count;
    });
  }

  function reserveOrder(order, reserved) {
    order.legs.forEach((leg) => {
      reserved.set(leg.sourceId, (reserved.get(leg.sourceId) || 0) + leg.count);
    });
  }

  function selectRankedOrders(snapshot, ranked, limit, baseline) {
    const selected = [];
    const reserved = new Map();
    for (const entry of ranked) {
      if (selected.length >= limit) {
        break;
      }
      if (
        entry.score <= baseline + AI_ORDER_THRESHOLD &&
        !entry.order.type.includes("defend")
      ) {
        continue;
      }
      if (!canReserveOrder(snapshot, entry.order, reserved)) {
        continue;
      }
      selected.push(entry.order);
      reserveOrder(entry.order, reserved);
    }
    return selected;
  }

  function chooseAiOrders(snapshot) {
    const baseline = evaluateOrderRobustly(snapshot, null);
    const defenseCandidates = generateDefenseCandidates(snapshot);
    const rankedDefense = defenseCandidates
      .map((order) => ({
        order,
        score: evaluateOrderRobustly(snapshot, order),
      }))
      .sort((a, b) => b.score - a.score);
    if (rankedDefense.length > 0) {
      return selectRankedOrders(
        snapshot,
        rankedDefense,
        AI_MAX_DEFENSE_ORDERS,
        Number.NEGATIVE_INFINITY,
      );
    }

    let candidates = generateProactiveCandidates(snapshot);
    const unitAdvantage =
      snapshotTotalUnits(snapshot, OWNER.AI) - snapshotTotalUnits(snapshot, OWNER.PLAYER);
    if (unitAdvantage > AI_PRESSURE_ATTACK_GATE) {
      const attacks = generateAttackCandidates(snapshot);
      if (attacks.length > 0) {
        candidates = [...attacks, ...candidates].slice(0, AI_MAX_CANDIDATES);
      }
    }

    if (!candidates.length) {
      const fallback = buildFallbackOrder(snapshot);
      return fallback ? [fallback] : [];
    }

    const ranked = candidates
      .map((order) => ({
        order,
        score: evaluateOrderRobustly(snapshot, order),
      }))
      .sort((a, b) => b.score - a.score);
    const selected = selectRankedOrders(snapshot, ranked, AI_MAX_ORDERS, baseline);
    if (selected.length > 0) {
      return selected;
    }

    const fallback = buildFallbackOrder(snapshot);
    return fallback ? [fallback] : [];
  }

  function executeAiOrders(orders) {
    let issued = 0;
    orders.forEach((order) => {
      order.legs.forEach((leg) => {
        const source = getNode(leg.sourceId);
        if (!source || source.owner !== OWNER.AI) {
          return;
        }

        const units = stationedUnitsAt(source.id, OWNER.AI).slice(0, leg.count);
        if (leg.kind === "point") {
          units.forEach((unit, index) => {
            if (launchUnitToPoint(unit, leg.x, leg.y, index, units.length)) {
              issued += 1;
            }
          });
          return;
        }

        const target = getNode(leg.targetId);
        if (!target) {
          return;
        }

        units.forEach((unit) => {
          if (launchUnit(unit, target)) {
            issued += 1;
          }
        });
      });

      if (issued > 0) {
        state.ai.lastOrder = order.type;
      }
    });
  }

  function updateAi(dt) {
    if (!isAiEnabled()) {
      return;
    }

    state.ai.elapsed += dt;
    if (state.ai.elapsed < AI_DECISION_INTERVAL) {
      return;
    }
    state.ai.elapsed = 0;

    const snapshot = snapshotState();
    const orders = chooseAiOrders(snapshot);
    if (orders.length > 0) {
      executeAiOrders(orders);
    }
  }

  function updateResultMessage() {
    if (state.phase !== "ended" || !state.winner) {
      return;
    }

    clearCountdown();
    messageEl.textContent = state.winner === localOwner() ? "Victory" : "Defeat";
    messageEl.hidden = false;
  }

  function finishMatch(winner) {
    state.phase = "ended";
    state.winner = winner;
    updateResultMessage();
    clearSelection();
    sendSnapshot(true);
  }

  function checkWinLoss() {
    if (state.phase !== "playing") {
      return;
    }

    const playerNodes = controlledNodeCount(OWNER.PLAYER);
    const aiNodes = controlledNodeCount(OWNER.AI);
    if (aiNodes === 0) {
      finishMatch(OWNER.PLAYER);
    } else if (playerNodes === 0) {
      finishMatch(OWNER.AI);
    }
  }

  function clearCountdown() {
    if (state.countdown.timer !== null) {
      window.clearTimeout(state.countdown.timer);
      state.countdown.timer = null;
    }
    state.countdown.token += 1;
    messageEl.classList.remove("countdown-message", "countdown-pop");
  }

  function showCountdownStep(text) {
    messageEl.textContent = text;
    messageEl.hidden = false;
    messageEl.classList.add("countdown-message");
    messageEl.classList.remove("countdown-pop");
    messageEl.offsetWidth;
    messageEl.classList.add("countdown-pop");
  }

  function startCountdown(onComplete = null) {
    clearCountdown();
    const token = state.countdown.token;
    state.phase = "countdown";
    clearSelection();

    let index = 0;
    const nextStep = () => {
      if (state.countdown.token !== token) {
        return;
      }

      if (index >= COUNTDOWN_STEPS.length) {
        state.countdown.timer = null;
        messageEl.classList.remove("countdown-message", "countdown-pop");
        messageEl.hidden = true;
        state.phase = "playing";
        state.lastTime = performance.now();
        if (typeof onComplete === "function") {
          onComplete();
        }
        updateHud();
        return;
      }

      showCountdownStep(COUNTDOWN_STEPS[index]);
      index += 1;
      state.countdown.timer = window.setTimeout(nextStep, COUNTDOWN_STEP_MS);
    };

    nextStep();
    updateHud();
  }

  function setHomeStatus(message, tone = "normal") {
    homeStatusEl.textContent = message;
    homeStatusEl.dataset.tone = tone;
    homeStatusEl.hidden = message.length === 0;
  }

  function showHomeScreen(visible) {
    const wasHidden = homeScreen.hidden;
    homeScreen.hidden = !visible;
    shell.dataset.screen = visible ? "home" : "game";
    homeScreen.classList.remove("home-entering");
    if (visible && wasHidden) {
      homeScreen.offsetWidth;
      homeScreen.classList.add("home-entering");
    }
  }

  function showMainMenu() {
    shell.dataset.menu = "main";
    modeActionsEl.hidden = false;
    multiplayerPanelEl.hidden = true;
    roomCardEl.hidden = true;
    setJoinControlsVisible(true);
    setHomeStatus("");
    showHomeScreen(true);
  }

  function showMultiplayerMenu(message = "", tone = "normal") {
    shell.dataset.menu = "multi";
    modeActionsEl.hidden = true;
    multiplayerPanelEl.hidden = false;
    setJoinControlsVisible(true);
    setHomeStatus(message, tone);
    showHomeScreen(true);
  }

  function setJoinControlsVisible(visible) {
    roomFieldEl.hidden = !visible;
    joinRoomEl.hidden = !visible;
  }

  function showHostWaitingRoom(roomId) {
    showMultiplayerMenu(`Room ${roomId}: waiting`);
    setJoinControlsVisible(false);
    setRoomCard(roomId);
  }

  function setRoomCard(roomId) {
    if (!roomId) {
      roomCardEl.hidden = true;
      return;
    }
    roomNumberEl.textContent = roomId;
    roomCardEl.hidden = false;
  }

  function inviteUrl(roomId) {
    const url = new URL(window.location.href);
    url.searchParams.set(ROOM_PARAM, roomId);
    url.hash = "";
    return url;
  }

  function setRoomUrl(roomId) {
    window.history.replaceState(null, "", inviteUrl(roomId));
  }

  function clearRoomUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete(ROOM_PARAM);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  function normalizeRoomId(value) {
    const match = String(value || "").match(/\b\d{6}\b/);
    return match ? match[0] : null;
  }

  function extractRoomId(value) {
    const text = String(value || "").trim();
    if (!text) {
      return null;
    }

    try {
      const url = new URL(text, window.location.href);
      return normalizeRoomId(url.searchParams.get(ROOM_PARAM)) || normalizeRoomId(url.href);
    } catch {
      return normalizeRoomId(text);
    }
  }

  function generateRoomId() {
    return String(Math.floor(Math.random() * (ROOM_MAX - ROOM_MIN + 1)) + ROOM_MIN);
  }

  function resolveServerUrl() {
    const configured =
      window.NODE_FIELD_SERVER_URL ||
      document.querySelector('meta[name="node-field-server"]')?.content;
    if (configured) {
      return configured;
    }

    if (window.location.protocol === "file:") {
      return "ws://localhost:3000";
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }

  function isSocketOpen(socket) {
    return socket && socket.readyState === WebSocket.OPEN;
  }

  function clearJoinTimer() {
    if (state.match.joinTimer !== null) {
      window.clearTimeout(state.match.joinTimer);
      state.match.joinTimer = null;
    }
  }

  function scheduleJoinTimeout(roomId) {
    clearJoinTimer();
    state.match.joinTimer = window.setTimeout(() => {
      if (
        state.match.mode === "multi" &&
        !state.match.isHost &&
        !state.match.connected &&
        state.match.roomId === roomId
      ) {
        reportRoomNotFound();
      }
    }, JOIN_TIMEOUT_MS);
  }

  function setMatchDefaults() {
    clearJoinTimer();
    state.match.connected = false;
    state.match.roomId = null;
    state.match.conn = null;
    state.match.closing = false;
    state.match.snapshotElapsed = 0;
    state.match.snapshotSequence = 0;
    state.match.lastAppliedSnapshotSequence = 0;
    state.match.orderSequence = 0;
    state.match.pendingOrderAck = null;
    state.match.pendingOrderSince = 0;
    state.match.pendingSnapshot = null;
  }

  function closeNetwork() {
    clearJoinTimer();
    state.match.closing = true;
    const socket = state.match.conn;

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        if (
          socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN
        ) {
          socket.close(1000, "client closed");
        }
      } catch {
        // Socket may already be closed.
      }
    }

    state.match.connected = false;
    state.match.conn = null;
    state.match.closing = false;
    state.match.snapshotElapsed = 0;
    state.match.snapshotSequence = 0;
    state.match.lastAppliedSnapshotSequence = 0;
    state.match.orderSequence = 0;
    state.match.pendingOrderAck = null;
    state.match.pendingOrderSince = 0;
    state.match.pendingSnapshot = null;
  }

  function sendNetworkMessage(message) {
    const socket = state.match.conn;
    if (!isSocketOpen(socket)) {
      return false;
    }

    socket.send(JSON.stringify({
      protocol: NETWORK_PROTOCOL,
      ...message,
    }));
    return true;
  }

  function shouldSkipSnapshot(force) {
    const socket = state.match.conn;
    return (
      !force &&
      socket &&
      Number.isFinite(socket.bufferedAmount) &&
      socket.bufferedAmount > SNAPSHOT_BUFFER_LIMIT
    );
  }

  function sameNullableNumber(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) {
      return (a === null || a === undefined) && (b === null || b === undefined);
    }
    return Math.abs(Number(a) - Number(b)) < 0.001;
  }

  function movementTargetForSnapshotUnit(unit, nodeMap) {
    if (unit.targetId !== null && unit.targetId !== undefined) {
      const node = nodeMap.get(unit.targetId);
      return node ? { x: node.x, y: node.y } : null;
    }

    if (Number.isFinite(unit.targetX) && Number.isFinite(unit.targetY)) {
      return { x: unit.targetX, y: unit.targetY };
    }

    return null;
  }

  function shouldPreservePredictedPosition(previous, next, nodeMap) {
    if (
      !previous ||
      previous.state !== "moving" ||
      next.state !== "moving" ||
      previous.owner !== next.owner ||
      previous.targetId !== next.targetId ||
      !sameNullableNumber(previous.targetX, next.targetX) ||
      !sameNullableNumber(previous.targetY, next.targetY)
    ) {
      return false;
    }

    const target = movementTargetForSnapshotUnit(next, nodeMap);
    if (!target) {
      return false;
    }

    const previousDistance = distance(previous.x, previous.y, target.x, target.y);
    const snapshotDistance = distance(next.x, next.y, target.x, target.y);
    return previousDistance + 2 < snapshotDistance && previousDistance > 0.5;
  }

  function nextSnapshotSequence() {
    state.match.snapshotSequence += 1;
    return state.match.snapshotSequence;
  }

  function snapshotSequence(snapshot) {
    const sequence = Number(snapshot?.sequence);
    return Number.isFinite(sequence) ? sequence : null;
  }

  function serializeState(options = {}) {
    const snapshot = {
      schema: SNAPSHOT_SCHEMA,
      sequence: options.sequence ?? null,
      width: worldWidth(),
      height: worldHeight(),
      phase: state.phase,
      winner: state.winner,
      nextNodeId: state.nextNodeId,
      nextUnitId: state.nextUnitId,
      ai: {
        lastOrder: state.ai.lastOrder,
      },
      nodes: state.nodes.map((node) => [
        node.id,
        encodeOwner(node.owner),
        packNumber(node.x),
        packNumber(node.y),
        node.hp,
        node.captureRequired,
        node.captureRemaining,
        packNumber(node.radius),
        packNumber(node.production),
        packNumber(node.flash),
        packNumber(node.seed),
      ]),
      units: state.units.map((unit) => [
        unit.id,
        encodeOwner(unit.owner),
        unit.homeNodeId ?? null,
        encodeUnitState(unit.state),
        unit.nodeId ?? null,
        unit.targetId ?? null,
        packNullableNumber(unit.targetX),
        packNullableNumber(unit.targetY),
        packNullableNumber(unit.guardX),
        packNullableNumber(unit.guardY),
        packNullableNumber(unit.nodeApproachAngle),
        packNullableNumber(unit.nodeApproachPadding),
        packNumber(unit.x),
        packNumber(unit.y),
        packNumber(unit.angle),
        packNumber(unit.orbitBlend),
        packNumber(unit.orbitRadius),
        packNumber(unit.orbitSpeed),
        packNumber(unit.speed),
        unit.ordered ? 1 : 0,
      ]),
    };

    if (options.ackOrderId) {
      snapshot.ackOrderId = options.ackOrderId;
    }

    return snapshot;
  }

  function normalizeSnapshotNode(node) {
    if (Array.isArray(node)) {
      return {
        id: numberOr(node[0]),
        owner: decodeOwner(node[1]),
        x: numberOr(node[2]),
        y: numberOr(node[3]),
        hp: numberOr(node[4]),
        captureRequired: numberOr(node[5]),
        captureRemaining: numberOr(node[6]),
        radius: numberOr(node[7], 24),
        production: numberOr(node[8]),
        flash: numberOr(node[9]),
        seed: numberOr(node[10]),
      };
    }

    const source = node || {};
    return {
      id: numberOr(source.id),
      owner: decodeOwner(source.owner),
      x: numberOr(source.x),
      y: numberOr(source.y),
      hp: numberOr(source.hp),
      captureRequired: numberOr(source.captureRequired),
      captureRemaining: numberOr(source.captureRemaining),
      radius: numberOr(source.radius, 24),
      production: numberOr(source.production),
      flash: numberOr(source.flash),
      seed: numberOr(source.seed),
    };
  }

  function normalizeSnapshotTrail(trail) {
    if (!Array.isArray(trail)) {
      return [];
    }
    return trail.map((point) => ({
      x: numberOr(point?.x),
      y: numberOr(point?.y),
    }));
  }

  function normalizeSnapshotUnit(unit) {
    if (Array.isArray(unit)) {
      return {
        id: numberOr(unit[0]),
        owner: decodeOwner(unit[1]),
        homeNodeId: nullableNumber(unit[2]),
        state: decodeUnitState(unit[3]),
        nodeId: nullableNumber(unit[4]),
        targetId: nullableNumber(unit[5]),
        targetX: nullableNumber(unit[6]),
        targetY: nullableNumber(unit[7]),
        guardX: nullableNumber(unit[8]),
        guardY: nullableNumber(unit[9]),
        nodeApproachAngle: nullableNumber(unit[10]),
        nodeApproachPadding: nullableNumber(unit[11]),
        x: numberOr(unit[12]),
        y: numberOr(unit[13]),
        angle: numberOr(unit[14]),
        orbitBlend: numberOr(unit[15], 1),
        orbitRadius: numberOr(unit[16], 20),
        orbitSpeed: numberOr(unit[17], 0.25),
        speed: numberOr(unit[18], AI_AVERAGE_SPEED),
        selected: false,
        ordered: Boolean(unit[19]),
        trail: [],
      };
    }

    const source = unit || {};
    return {
      id: numberOr(source.id),
      owner: decodeOwner(source.owner),
      homeNodeId: nullableNumber(source.homeNodeId),
      state: decodeUnitState(source.state),
      nodeId: nullableNumber(source.nodeId),
      targetId: nullableNumber(source.targetId),
      targetX: nullableNumber(source.targetX),
      targetY: nullableNumber(source.targetY),
      guardX: nullableNumber(source.guardX),
      guardY: nullableNumber(source.guardY),
      nodeApproachAngle: nullableNumber(source.nodeApproachAngle),
      nodeApproachPadding: nullableNumber(source.nodeApproachPadding),
      x: numberOr(source.x),
      y: numberOr(source.y),
      angle: numberOr(source.angle),
      orbitBlend: numberOr(source.orbitBlend, 1),
      orbitRadius: numberOr(source.orbitRadius, 20),
      orbitSpeed: numberOr(source.orbitSpeed, 0.25),
      speed: numberOr(source.speed, AI_AVERAGE_SPEED),
      selected: false,
      ordered: Boolean(source.ordered),
      trail: normalizeSnapshotTrail(source.trail),
    };
  }

  function applySnapshot(snapshot, options = {}) {
    if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.units)) {
      return;
    }

    const sequence = snapshotSequence(snapshot);
    if (sequence !== null) {
      state.match.lastAppliedSnapshotSequence = Math.max(
        state.match.lastAppliedSnapshotSequence,
        sequence,
      );
    }
    if (snapshot.ackOrderId && snapshot.ackOrderId === state.match.pendingOrderAck) {
      state.match.pendingOrderAck = null;
      state.match.pendingOrderSince = 0;
    }

    if (
      snapshot.phase !== "countdown" &&
      (state.countdown.timer !== null ||
        messageEl.classList.contains("countdown-message"))
    ) {
      clearCountdown();
    }

    state.worldWidth = Math.max(1, snapshot.width || state.width);
    state.worldHeight = Math.max(1, snapshot.height || state.height);
    state.phase = snapshot.phase;
    state.winner = snapshot.winner || null;
    state.nextNodeId = snapshot.nextNodeId || 1;
    state.nextUnitId = snapshot.nextUnitId || 1;
    state.ai.lastOrder = snapshot.ai?.lastOrder || "multiplayer";

    const previousUnits = new Map(state.units.map((unit) => [unit.id, unit]));
    const nextNodes = snapshot.nodes.map(normalizeSnapshotNode);
    const nextNodeMap = new Map(nextNodes.map((node) => [node.id, node]));
    state.nodes = nextNodes;

    state.units = snapshot.units.map((unit) => {
      const next = normalizeSnapshotUnit(unit);
      const previous = previousUnits.get(next.id);
      if (shouldPreservePredictedPosition(previous, next, nextNodeMap)) {
        next.x = previous.x;
        next.y = previous.y;
        next.trail = previous.trail.map((point) => ({ x: point.x, y: point.y }));
      }
      return next;
    });

    state.selected.forEach((id) => {
      const unit = state.units.find((candidate) => candidate.id === id);
      if (!unit || !isSelectableUnit(unit, localOwner())) {
        state.selected.delete(id);
      }
    });
    state.units.forEach((unit) => {
      unit.selected = state.selected.has(unit.id) && isSelectableUnit(unit, localOwner());
    });

    if (state.phase === "ended") {
      updateResultMessage();
    } else if (
      state.phase !== "countdown" ||
      !messageEl.classList.contains("countdown-message")
    ) {
      messageEl.hidden = true;
    }
    if (options.updateHud !== false) {
      updateHud();
    }
  }

  function sendSnapshot(force = false, options = {}) {
    if (
      state.match.mode !== "multi" ||
      !state.match.isHost ||
      !state.match.connected ||
      !state.match.conn
    ) {
      return;
    }

    if (!force && state.match.snapshotElapsed < SNAPSHOT_INTERVAL) {
      return;
    }

    if (shouldSkipSnapshot(force)) {
      return;
    }

    sendNetworkMessage({
      type: "snapshot",
      priority: force,
      snapshot: serializeState({
        sequence: nextSnapshotSequence(),
        ackOrderId: options.ackOrderId,
      }),
    });
    state.match.snapshotElapsed = 0;
  }

  function updateNetwork(dt) {
    if (
      state.match.mode !== "multi" ||
      !state.match.isHost ||
      !state.match.connected ||
      (state.phase !== "playing" && state.phase !== "ended")
    ) {
      return;
    }

    state.match.snapshotElapsed += dt;
    if (state.match.snapshotElapsed >= SNAPSHOT_INTERVAL) {
      sendSnapshot(false);
    }
  }

  function ensureSocketSupport() {
    if (typeof WebSocket === "function") {
      return true;
    }

    showMultiplayerMenu("This browser does not support WebSocket multiplayer", "error");
    return false;
  }

  function openRoomSocket(onOpen) {
    const socket = new WebSocket(SERVER_URL);
    state.match.conn = socket;

    socket.onopen = () => {
      if (state.match.closing) {
        return;
      }
      onOpen();
      updateHud();
    };

    socket.onmessage = (event) => {
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      handleNetworkMessage(message);
    };

    socket.onerror = () => {
      if (!state.match.closing) {
        reportNetworkError("Server connection failed");
      }
    };

    socket.onclose = () => {
      if (state.match.closing || state.match.mode !== "multi") {
        return;
      }

      const wasConnected = state.match.connected;
      clearJoinTimer();
      state.match.connected = false;
      state.match.conn = null;

      if (!state.match.isHost && !wasConnected) {
        reportRoomNotFound();
        return;
      }

      if (state.phase === "playing" || state.phase === "countdown") {
        clearCountdown();
        state.phase = "waiting";
      }

      if (state.match.isHost) {
        showHostWaitingRoom(state.match.roomId);
      } else {
        showMultiplayerMenu("Connection closed", "error");
      }
      updateHud();
    };
  }

  function startSingleplayer() {
    closeNetwork();
    clearRoomUrl();
    setMatchDefaults();
    state.match.mode = "single";
    state.match.localOwner = OWNER.PLAYER;
    state.match.isHost = true;
    showHomeScreen(false);
    newGame({ phase: "countdown" });
    startCountdown();
  }

  function startHostRoom(roomId = generateRoomId()) {
    if (!ensureSocketSupport()) {
      return;
    }

    closeNetwork();
    setMatchDefaults();
    state.match.mode = "multi";
    state.match.localOwner = OWNER.PLAYER;
    state.match.isHost = true;
    state.match.roomId = roomId;
    setRoomUrl(roomId);
    newGame({ seed: `room-${roomId}`, phase: "waiting" });
    showHostWaitingRoom(roomId);
    setHomeStatus(`Room ${roomId}: connecting to server`);

    openRoomSocket(() => {
      sendNetworkMessage({
        type: "createRoom",
        roomId,
      });
    });
  }

  function startGuestRoom(roomId) {
    if (!ensureSocketSupport()) {
      return;
    }

    closeNetwork();
    setMatchDefaults();
    state.match.mode = "multi";
    state.match.localOwner = OWNER.AI;
    state.match.isHost = false;
    state.match.roomId = roomId;
    state.phase = "waiting";
    state.winner = null;
    state.selected.clear();
    messageEl.hidden = true;
    setRoomUrl(roomId);
    setRoomCard(roomId);
    showMultiplayerMenu(`Joining room ${roomId}`);
    scheduleJoinTimeout(roomId);

    openRoomSocket(() => {
      sendNetworkMessage({
        type: "joinRoom",
        roomId,
      });
    });
  }

  function sendInitSnapshot() {
    sendNetworkMessage({
      type: "init",
      roomId: state.match.roomId,
      snapshot: serializeState({ sequence: nextSnapshotSequence() }),
    });
  }

  function startHostCountdown() {
    showHomeScreen(false);
    startCountdown(() => {
      sendSnapshot(true);
    });
    sendInitSnapshot();
  }

  function shouldDeferSnapshotForOrderAck(snapshot) {
    if (!state.match.pendingOrderAck) {
      return false;
    }

    if (snapshot?.ackOrderId === state.match.pendingOrderAck) {
      state.match.pendingOrderAck = null;
      state.match.pendingOrderSince = 0;
      return false;
    }

    if (
      state.match.pendingOrderSince > 0 &&
      performance.now() - state.match.pendingOrderSince > ORDER_ACK_GRACE_MS
    ) {
      state.match.pendingOrderAck = null;
      state.match.pendingOrderSince = 0;
      return false;
    }

    return true;
  }

  function queueSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.units)) {
      return;
    }

    if (shouldDeferSnapshotForOrderAck(snapshot)) {
      return;
    }

    const sequence = snapshotSequence(snapshot);
    if (
      sequence !== null &&
      sequence <= state.match.lastAppliedSnapshotSequence
    ) {
      return;
    }

    const pendingSequence = snapshotSequence(state.match.pendingSnapshot);
    if (
      sequence !== null &&
      pendingSequence !== null &&
      sequence <= pendingSequence
    ) {
      return;
    }

    state.match.pendingSnapshot = snapshot;
  }

  function applyPendingSnapshot() {
    if (!state.match.pendingSnapshot) {
      return;
    }

    const snapshot = state.match.pendingSnapshot;
    state.match.pendingSnapshot = null;
    applySnapshot(snapshot, { updateHud: false });
  }

  function handleNetworkMessage(message) {
    if (!message || message.protocol !== NETWORK_PROTOCOL) {
      return;
    }

    if (message.type === "roomCreated" && state.match.isHost) {
      state.match.roomId = message.roomId || state.match.roomId;
      setRoomUrl(state.match.roomId);
      showHostWaitingRoom(state.match.roomId);
      updateHud();
      return;
    }

    if (message.type === "roomUnavailable" && state.match.isHost) {
      reportNetworkError("Room unavailable");
      return;
    }

    if (message.type === "joinedRoom" && !state.match.isHost) {
      clearJoinTimer();
      state.match.connected = true;
      state.match.roomId = message.roomId || state.match.roomId;
      setRoomCard(state.match.roomId);
      setHomeStatus(`Joined room ${state.match.roomId}`);
      updateHud();
      return;
    }

    if (message.type === "guestJoined" && state.match.isHost) {
      state.match.connected = true;
      clearJoinTimer();
      messageEl.hidden = true;
      startHostCountdown();
      updateHud();
      return;
    }

    if (message.type === "joinFailed" && !state.match.isHost) {
      if (message.reason === "full") {
        reportNetworkError("Room is full");
      } else {
        reportRoomNotFound();
      }
      return;
    }

    if (message.type === "init" && !state.match.isHost) {
      const wasCounting =
        state.phase === "countdown" &&
        !messageEl.hidden &&
        messageEl.classList.contains("countdown-message");
      state.match.roomId = message.roomId || state.match.roomId;
      state.match.pendingSnapshot = null;
      state.match.pendingOrderAck = null;
      state.match.pendingOrderSince = 0;
      applySnapshot(message.snapshot);
      state.match.connected = true;
      showHomeScreen(false);
      if (state.phase === "countdown" && !wasCounting) {
        startCountdown();
      }
      return;
    }

    if (message.type === "snapshot" && !state.match.isHost) {
      queueSnapshot(message.snapshot);
      return;
    }

    if (message.type === "order" && state.match.isHost) {
      handleRemoteOrder(message.order);
      return;
    }

    if (message.type === "opponentLeft") {
      state.match.connected = false;
      if (state.phase === "playing" || state.phase === "countdown") {
        clearCountdown();
        state.phase = "waiting";
      }
      if (state.match.isHost) {
        showHostWaitingRoom(state.match.roomId);
      } else {
        showMultiplayerMenu("Host disconnected", "error");
      }
      updateHud();
      return;
    }

    if (message.type === "serverError") {
      reportNetworkError(message.message || "Server error");
    }
  }

  function handleRemoteOrder(order) {
    if (!order || order.owner !== OWNER.AI || state.phase !== "playing") {
      return;
    }

    const unitIds = Array.isArray(order.unitIds)
      ? order.unitIds.map((id) => Number(id)).filter(Number.isFinite).slice(0, MAX_UNITS)
      : [];
    if (unitIds.length === 0) {
      return;
    }

    const ackOrderId = typeof order.orderId === "string" ? order.orderId : null;
    let sent = 0;
    if (order.kind === "node") {
      const target = getNode(Number(order.targetId));
      if (target) {
        sent = executeUnitOrderToNode(OWNER.AI, unitIds, target);
      }
    } else if (order.kind === "point") {
      const x = clamp(Number(order.xRatio) || 0, 0, 1) * worldWidth();
      const y = clamp(Number(order.yRatio) || 0, 0, 1) * worldHeight();
      sent = executeUnitOrderToPoint(OWNER.AI, unitIds, x, y);
    }

    if (sent > 0) {
      state.ai.lastOrder = "guest order";
    }
    sendSnapshot(true, { ackOrderId });
  }

  function reportRoomNotFound() {
    const roomId = state.match.roomId;
    clearJoinTimer();
    closeNetwork();
    state.match.connected = false;
    state.match.mode = "menu";
    state.match.localOwner = OWNER.PLAYER;
    state.match.isHost = true;
    state.match.roomId = roomId;
    state.phase = "menu";
    showMultiplayerMenu("Room not found", "error");
    setRoomCard(null);
    roomInputEl.value = roomId || roomInputEl.value;
    updateHud();
  }

  function reportNetworkError(message) {
    clearJoinTimer();
    state.match.connected = false;
    if (state.match.mode === "multi") {
      showMultiplayerMenu(message, "error");
      setRoomCard(state.match.roomId);
      updateHud();
    }
  }

  function returnToMenu() {
    closeNetwork();
    clearRoomUrl();
    setMatchDefaults();
    state.match.mode = "menu";
    state.match.localOwner = OWNER.PLAYER;
    state.match.isHost = true;
    newGame({ phase: "menu" });
    showMainMenu();
    updateHud();
  }

  function joinRoomFromInput() {
    const roomId = extractRoomId(roomInputEl.value);
    if (!roomId) {
      showMultiplayerMenu("Enter a room code", "error");
      roomInputEl.focus();
      return;
    }
    startGuestRoom(roomId);
  }

  function bootFromLocation() {
    const roomId = extractRoomId(window.location.href);
    if (roomId) {
      roomInputEl.value = roomId;
      setRoomCard(roomId);
      startGuestRoom(roomId);
      return;
    }

    showMainMenu();
    updateHud();
  }

  function updateHud() {
    const playerNodes = controlledNodeCount(OWNER.PLAYER);
    const aiNodes = controlledNodeCount(OWNER.AI);
    const playerUnits = unitCount(OWNER.PLAYER);
    const aiUnits = unitCount(OWNER.AI);
    const nodeCounts = ownerCounts(playerNodes, aiNodes);
    const unitCounts = ownerCounts(playerUnits, aiUnits);
    const movingPlayerCount = unitCountByState(OWNER.PLAYER, "moving");
    const movingAiCount = unitCountByState(OWNER.AI, "moving");
    const guardingPlayerCount = unitCountByState(OWNER.PLAYER, "guarding");
    const guardingAiCount = unitCountByState(OWNER.AI, "guarding");
    const ownOwner = localOwner();
    const foeOwner = enemyOwner();

    nodeScoreEl.textContent = `${nodeCounts[ownOwner]} - ${nodeCounts[foeOwner]}`;
    unitScoreEl.textContent = `${unitCounts[ownOwner]} - ${unitCounts[foeOwner]}`;
    selectedEl.textContent = String(state.selected.size);
    shell.dataset.phase = state.phase;
    shell.dataset.mode = state.match.mode;
    shell.dataset.localOwner = localOwner();
    shell.dataset.room = state.match.roomId || "";
    shell.dataset.connected = String(state.match.connected);
    shell.dataset.aiEnabled = String(isAiEnabled());
    shell.dataset.playerNodes = String(playerNodes);
    shell.dataset.aiNodes = String(aiNodes);
    shell.dataset.playerUnits = String(playerUnits);
    shell.dataset.aiUnits = String(aiUnits);
    shell.dataset.selected = String(state.selected.size);
    shell.dataset.movingPlayer = String(movingPlayerCount);
    shell.dataset.movingAi = String(movingAiCount);
    shell.dataset.guardingPlayer = String(guardingPlayerCount);
    shell.dataset.guardingAi = String(guardingAiCount);
    shell.dataset.aiOrder = state.ai.lastOrder;
    shell.dataset.nodes = JSON.stringify(
      state.nodes.map((node) => ({
        id: node.id,
        owner: node.owner,
        x: Math.round(node.x),
        y: Math.round(node.y),
        radius: Math.round(node.radius),
        hp: node.hp,
        captureRemaining: node.captureRemaining,
        stationed:
          node.owner === OWNER.NEUTRAL
            ? 0
            : stationedUnitsAt(node.id, node.owner).length,
      })),
    );

    if (state.match.mode === "multi") {
      restartEl.textContent = state.match.isHost ? "New Round" : "Joined";
      restartEl.disabled = !state.match.isHost;
    } else {
      restartEl.textContent = "New Map";
      restartEl.disabled = false;
    }
    homeEl.hidden =
      state.match.mode !== "single" &&
      !(state.match.mode === "multi" && state.phase === "ended" && state.winner);

    if (state.phase === "countdown") {
      statusEl.textContent = "Starting...";
    } else if (state.phase === "ended" && state.winner) {
      statusEl.textContent =
        state.winner === localOwner() ? "Opponent eliminated" : "Board lost";
    } else if (state.match.mode === "multi") {
      const roomLabel = state.match.roomId ? `Room ${state.match.roomId}` : "Room";
      const roleLabel = state.match.isHost ? "Host" : "Guest";
      statusEl.textContent = state.match.connected
        ? `${roomLabel}: ${roleLabel}`
        : `${roomLabel}: waiting`;
    } else if (state.match.mode === "menu") {
      statusEl.textContent = "Board ready";
    } else if (!isAiEnabled()) {
      statusEl.textContent = "AI paused";
    } else {
      statusEl.textContent = `AI: ${state.ai.lastOrder}`;
    }
  }

  function update(dt) {
    if (isMultiplayerClient()) {
      applyPendingSnapshot();
      if (state.phase === "playing") {
        updateClientVisuals(dt);
      } else if (state.phase === "ended") {
        updateClientVisuals(dt * 0.25);
      }
    } else if (state.phase === "playing") {
      updateNodes(dt);
      updateUnits(dt);
      resolveGuardInterceptions();
      updateAi(dt);
      checkWinLoss();
    } else if (state.phase !== "menu") {
      updateUnits(dt * 0.25);
    }
    updateNetwork(dt);
    updateHud();
  }

  function drawBackground() {
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = "#f5f5f7";
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawNode(node) {
    const colors = colorsForOwner(node.owner);
    const point = toViewPoint(node.x, node.y);

    ctx.save();
    if (node.flash > 0) {
      ctx.globalAlpha = 0.18 * node.flash;
      ctx.fillStyle = colors.line;
      ctx.beginPath();
      ctx.arc(point.x, point.y, toViewRadius(node.radius + 9), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = colors.fill;
    ctx.beginPath();
    ctx.arc(point.x, point.y, toViewRadius(node.radius), 0, TAU);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.line;
    ctx.beginPath();
    ctx.arc(point.x, point.y, toViewRadius(node.radius), 0, TAU);
    ctx.stroke();

    ctx.restore();
  }

  function drawNodeLabel(node) {
    const colors = colorsForOwner(node.owner);
    const point = toViewPoint(node.x, node.y);
    const text =
      node.owner === OWNER.NEUTRAL
        ? String(Math.max(0, node.captureRemaining))
        : String(Math.max(0, node.hp));

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.text;
    ctx.font = '600 16px "SF Pro Text", system-ui, -apple-system, sans-serif';
    ctx.fillText(text, point.x, point.y);
    ctx.restore();
  }

  function drawUnit(unit) {
    const colors = colorsForOwner(unit.owner);
    const point = toViewPoint(unit.x, unit.y);
    ctx.save();

    if (unit.state === "moving" && unit.trail.length > 1) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = unit.owner === localOwner()
        ? "rgba(0, 102, 204, 0.36)"
        : "rgba(29, 29, 31, 0.24)";
      const trailStart = toViewPoint(unit.trail[0].x, unit.trail[0].y);
      ctx.beginPath();
      ctx.moveTo(trailStart.x, trailStart.y);
      for (let i = 1; i < unit.trail.length; i += 1) {
        const trailPoint = toViewPoint(unit.trail[i].x, unit.trail[i].y);
        ctx.lineTo(trailPoint.x, trailPoint.y);
      }
      ctx.stroke();
    }

    ctx.fillStyle = colors.unit;
    ctx.beginPath();
    ctx.arc(point.x, point.y, unit.selected ? 4.6 : 3.3, 0, TAU);
    ctx.fill();

    if (unit.selected) {
      ctx.strokeStyle = "#0071e3";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawHoverAndSelection() {
    if (state.mouse.hoverNode && state.phase === "playing") {
      const node = state.mouse.hoverNode;
      const point = toViewPoint(node.x, node.y);
      ctx.save();
      ctx.strokeStyle = "#0071e3";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, toViewRadius(node.radius + 12), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (state.selected.size > 0 && state.mouse.hoverNode && !state.mouse.down) {
      const selectedUnits = state.units.filter((unit) => state.selected.has(unit.id));
      if (selectedUnits.length) {
        const cx =
          selectedUnits.reduce((sum, unit) => sum + unit.x, 0) / selectedUnits.length;
        const cy =
          selectedUnits.reduce((sum, unit) => sum + unit.y, 0) / selectedUnits.length;
        const from = toViewPoint(cx, cy);
        const to = toViewPoint(state.mouse.hoverNode.x, state.mouse.hoverNode.y);
        ctx.save();
        ctx.strokeStyle = "rgba(0, 102, 204, 0.42)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (state.mouse.down && state.mouse.dragging) {
      const circle = dragCircleFromCenter(
        state.mouse.startX,
        state.mouse.startY,
        state.mouse.x,
        state.mouse.y,
      );
      const point = toViewPoint(circle.x, circle.y);
      ctx.save();
      ctx.fillStyle = "rgba(0, 102, 204, 0.08)";
      ctx.strokeStyle = "#0071e3";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(point.x, point.y, toViewRadius(circle.radius), 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function render() {
    drawBackground();

    state.nodes.forEach(drawNode);
    state.units.forEach(drawUnit);
    state.nodes.forEach(drawNodeLabel);
    drawHoverAndSelection();
  }

  function frame(now) {
    const dt = clamp((now - state.lastTime) / 1000, 0, 0.05);
    state.lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (state.phase !== "playing") {
      return;
    }
    const point = pointerPosition(event);
    state.mouse.id = event.pointerId;
    state.mouse.down = true;
    state.mouse.dragging = false;
    state.mouse.x = point.x;
    state.mouse.y = point.y;
    state.mouse.startX = point.x;
    state.mouse.startY = point.y;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    const point = pointerPosition(event);
    state.mouse.x = point.x;
    state.mouse.y = point.y;
    state.mouse.hoverNode = hitNode(point.x, point.y);

    if (!state.mouse.down || state.mouse.id !== event.pointerId) {
      return;
    }

    const dragDistance = distance(
      state.mouse.startX,
      state.mouse.startY,
      state.mouse.x,
      state.mouse.y,
    );
    if (dragDistance > 5 && !state.mouse.dragging) {
      state.mouse.dragging = true;
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!state.mouse.down || state.mouse.id !== event.pointerId) {
      return;
    }

    const point = pointerPosition(event);
    const dragDistance = distance(
      state.mouse.startX,
      state.mouse.startY,
      point.x,
      point.y,
    );

    if (state.mouse.dragging && dragDistance > 10) {
      const circle = dragCircleFromCenter(
        state.mouse.startX,
        state.mouse.startY,
        point.x,
        point.y,
      );
      selectUnitsInCircle(circle.x, circle.y, circle.radius);
    } else {
      const node = hitNode(point.x, point.y);
      if (node && state.selected.size > 0) {
        dispatchSelected(node);
      } else if (!node && state.selected.size > 0) {
        dispatchSelectedToPoint(point.x, point.y);
      } else if (node && node.owner === localOwner()) {
        selectLocalNode(node);
      } else {
        clearSelection();
      }
    }

    state.mouse.down = false;
    state.mouse.dragging = false;
    state.mouse.id = null;
    state.mouse.hoverNode = hitNode(point.x, point.y);
  });

  canvas.addEventListener("pointercancel", () => {
    state.mouse.down = false;
    state.mouse.dragging = false;
    state.mouse.id = null;
  });

  singleplayerEl.addEventListener("click", startSingleplayer);

  multiplayerEl.addEventListener("click", () => {
    showMultiplayerMenu("");
    roomInputEl.focus();
  });

  createRoomEl.addEventListener("click", () => {
    startHostRoom();
  });

  joinRoomEl.addEventListener("click", joinRoomFromInput);

  backMenuEl.addEventListener("click", returnToMenu);

  roomInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      joinRoomFromInput();
    }
  });

  homeEl.addEventListener("click", returnToMenu);

  restartEl.addEventListener("click", () => {
    if (state.match.mode === "multi") {
      if (state.match.isHost) {
        newGame({
          seed: `room-${state.match.roomId}-${Date.now()}`,
          phase: state.match.connected ? "countdown" : "waiting",
        });
        if (state.match.connected) {
          startHostCountdown();
        } else {
          showHostWaitingRoom(state.match.roomId);
        }
      }
      return;
    }

    startSingleplayer();
  });

  window.addEventListener("resize", resize);

  resize();
  newGame({ phase: "menu" });
  bootFromLocation();
  requestAnimationFrame(frame);
})();
