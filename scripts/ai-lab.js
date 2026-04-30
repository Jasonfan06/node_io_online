#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const GAME_PATH = path.join(ROOT_DIR, "public", "game.js");

const DEFAULT_MATCH = {
  width: 1280,
  height: 760,
  dt: 0.1,
  maxSeconds: 210,
};

const TRAINABLE_CONSTANTS = {
  AI_DECISION_INTERVAL: { min: 0.1, max: 0.32, step: 0.02 },
  AI_HORIZON: { min: 18, max: 30, step: 2 },
  AI_MIN_NODE_RESERVE: { min: 0, max: 4, step: 1 },
  AI_SAFETY_MARGIN: { min: 1, max: 6, step: 1 },
  AI_RESPONSE_DELAY: { min: 0.12, max: 0.5, step: 0.04 },
  AI_EXPANSION_BONUS: { min: 8, max: 34, step: 2 },
  AI_EXPANSION_VALUE_WEIGHT: { min: 0.7, max: 1.7, step: 0.1 },
  AI_EXPANSION_COST_WEIGHT: { min: 0.9, max: 2.4, step: 0.1 },
  AI_ATTACK_VALUE_WEIGHT: { min: 2.6, max: 5.4, step: 0.2 },
  AI_ATTACK_COST_WEIGHT: { min: 0.15, max: 0.8, step: 0.05 },
  AI_ATTACK_ADVANTAGE_WEIGHT: { min: 2, max: 5.6, step: 0.2 },
  AI_ATTACK_NEED_PADDING: { min: 0, max: 4, step: 1 },
  AI_FINISH_BIAS: { min: 40, max: 130, step: 5 },
  AI_FINISH_OVERKILL: { min: 1, max: 6, step: 1 },
  AI_DECISIVE_UNIT_LEAD: { min: 10, max: 34, step: 2 },
  AI_MAX_ORDERS: { min: 2, max: 5, step: 1 },
  AI_MAX_DEFENSE_ORDERS: { min: 1, max: 4, step: 1 },
  AI_INVEST_ENABLED: { min: 0, max: 1, step: 1 },
  AI_INVEST_MIN_SURPLUS: { min: 4, max: 16, step: 1 },
  AI_INVEST_MAX_UNITS: { min: 1, max: 8, step: 1 },
  AI_INVEST_FRONT_HP_TARGET: { min: 4, max: 18, step: 1 },
  AI_INVEST_BACK_HP_TARGET: { min: 0, max: 12, step: 1 },
  AI_INVEST_SCORE_BIAS: { min: -20, max: 50, step: 2 },
};

const OPPONENTS = ["passive", "weak", "greedy", "raider", "turtle"];

function parseArgs(argv) {
  const args = {
    command: argv[2] || "eval",
    games: 80,
    generations: 14,
    population: 18,
    opponents: ["weak", "greedy", "raider", "turtle"],
    refs: [],
    apply: false,
    seed: "node-field-ai-lab",
    verbose: false,
  };

  for (const raw of argv.slice(3)) {
    if (!raw.startsWith("--")) {
      continue;
    }
    const [key, value = "true"] = raw.slice(2).split("=");
    if (key === "games") {
      args.games = Math.max(1, Number(value) || args.games);
    } else if (key === "generations") {
      args.generations = Math.max(1, Number(value) || args.generations);
    } else if (key === "population") {
      args.population = Math.max(2, Number(value) || args.population);
    } else if (key === "opponents") {
      args.opponents = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    } else if (key === "refs") {
      args.refs = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    } else if (key === "apply") {
      args.apply = value !== "false";
    } else if (key === "seed") {
      args.seed = value;
    } else if (key === "verbose") {
      args.verbose = value !== "false";
    }
  }

  args.opponents = args.opponents.filter((opponent) => OPPONENTS.includes(opponent));
  if (args.opponents.length === 0) {
    args.opponents = ["weak"];
  }
  return args;
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
  let value = hashSeed(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function constantValue(source, name) {
  const match = source.match(new RegExp(`const ${name} = ([^;]+);`));
  if (!match) {
    throw new Error(`Could not find ${name} in public/game.js`);
  }
  const value = Function(`"use strict"; return (${match[1]});`)();
  if (!Number.isFinite(value)) {
    throw new Error(`${name} is not numeric`);
  }
  return value;
}

function hasConstant(source, name) {
  return new RegExp(`const ${name} = [^;]+;`).test(source);
}

function optionalConstantValue(source, name, fallback) {
  return hasConstant(source, name) ? constantValue(source, name) : fallback;
}

function readLiveConfig(source) {
  return Object.fromEntries(
    Object.keys(TRAINABLE_CONSTANTS)
      .filter((name) => hasConstant(source, name))
      .map((name) => [name, constantValue(source, name)]),
  );
}

function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value.toFixed(4)).toString();
}

function patchConstants(source, config) {
  let patched = source;
  for (const [name, value] of Object.entries(config)) {
    if (!Object.hasOwn(TRAINABLE_CONSTANTS, name)) {
      continue;
    }
    const re = new RegExp(`const ${name} = [^;]+;`);
    if (!re.test(patched)) {
      throw new Error(`Could not patch ${name}`);
    }
    patched = patched.replace(re, `const ${name} = ${formatNumber(value)};`);
  }
  return patched;
}

function instrumentGame(source) {
  const marker = [
    "  resize();",
    "  newGame({ phase: \"menu\" });",
    "  bootFromLocation();",
    "  requestAnimationFrame(frame);",
    "})();",
  ].join("\n");
  const replacement = [
    "  resize();",
    "  newGame({ phase: \"menu\" });",
    "  globalThis.__nodeFieldAiLab = {",
    "    state,",
    "    OWNER,",
    "    newGame,",
    "    update,",
    "    executeUnitOrderToNode,",
    "    executeUnitOrderToPoint,",
    "    snapshotState,",
    "    chooseAiOrders,",
    "    stationedUnitsAt,",
    "    unitCount,",
    "    controlledNodeCount,",
    "    worldWidth: typeof worldWidth === \"function\" ? worldWidth : () => state.width,",
    "    worldHeight: typeof worldHeight === \"function\" ? worldHeight : () => state.height,",
    "  };",
    "})();",
  ].join("\n");

  if (!source.includes(marker)) {
    throw new Error("Could not instrument public/game.js; boot marker changed.");
  }
  return source.replace(marker, replacement);
}

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle: (name, force) => {
      if (force === undefined ? !values.has(name) : force) {
        values.add(name);
        return true;
      }
      values.delete(name);
      return false;
    },
  };
}

function createElement(id) {
  return {
    id,
    hidden: false,
    disabled: false,
    textContent: "",
    value: "",
    dataset: {},
    style: {},
    classList: createClassList(),
    focus() {},
    addEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: DEFAULT_MATCH.width, height: DEFAULT_MATCH.height };
    },
  };
}

function createCanvas() {
  const canvas = createElement("game");
  canvas.getContext = () => {
    const context = {
      beginPath() {},
      arc() {},
      clearRect() {},
      fill() {},
      fillRect() {},
      fillText() {},
      lineTo() {},
      moveTo() {},
      restore() {},
      save() {},
      setLineDash() {},
      setTransform() {},
      stroke() {},
    };
    return new Proxy(context, {
      get(target, property) {
        if (property in target) {
          return target[property];
        }
        return undefined;
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    });
  };
  return canvas;
}

function createDocument() {
  const elements = new Map();
  const ids = [
    "game",
    "game-shell",
    "home-screen",
    "home-status",
    "mode-actions",
    "multiplayer-panel",
    "singleplayer",
    "multiplayer",
    "create-room",
    "join-room",
    "back-menu",
    "room-input",
    "room-card",
    "room-number",
    "status",
    "node-score",
    "unit-score",
    "selected-count",
    "restart",
    "home",
    "message",
  ];
  ids.forEach((id) => elements.set(id, id === "game" ? createCanvas() : createElement(id)));
  const roomField = createElement("room-field");

  return {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElement(id));
      }
      return elements.get(id);
    },
    querySelector(selector) {
      if (selector === ".room-field") {
        return roomField;
      }
      return null;
    },
  };
}

function createGame(source, config, seed) {
  const rng = makeRng(seed);
  const math = Object.create(Math);
  math.random = rng;
  const context = {
    console,
    crypto: {
      randomUUID: () => `ai-lab-${Math.floor(rng() * 1e12).toString(36)}`,
    },
    document: createDocument(),
    Math: math,
    URL,
    WebSocket: function WebSocket() {},
    __now: 0,
  };
  context.performance = {
    now: () => context.__now,
  };
  context.window = {
    NODE_FIELD_SERVER_URL: "",
    devicePixelRatio: 1,
    innerWidth: DEFAULT_MATCH.width,
    innerHeight: DEFAULT_MATCH.height,
    location: {
      protocol: "http:",
      host: "localhost:3000",
      href: "http://localhost:3000/",
      search: "",
      hash: "",
    },
    history: {
      replaceState() {},
    },
    addEventListener() {},
    clearTimeout() {},
    setTimeout() {
      return 0;
    },
  };
  context.requestAnimationFrame = () => 0;
  context.cancelAnimationFrame = () => {};
  context.setTimeout = context.window.setTimeout;
  context.clearTimeout = context.window.clearTimeout;

  vm.createContext(context);
  vm.runInContext(instrumentGame(patchConstants(source, config)), context, {
    filename: GAME_PATH,
  });
  return { api: context.__nodeFieldAiLab, context };
}

function cloneForAdvisor(value, ownerMap) {
  return JSON.parse(JSON.stringify(value), (key, nestedValue) => {
    if (key === "owner" && Object.hasOwn(ownerMap, nestedValue)) {
      return ownerMap[nestedValue];
    }
    return nestedValue;
  });
}

function copyStateForAdvisor(gameApi, advisorApi, ownerMap) {
  advisorApi.state.nodes = cloneForAdvisor(gameApi.state.nodes, ownerMap);
  advisorApi.state.units = cloneForAdvisor(gameApi.state.units, ownerMap);
  advisorApi.state.selected.clear();
  advisorApi.state.nextNodeId = gameApi.state.nextNodeId;
  advisorApi.state.nextUnitId = gameApi.state.nextUnitId;
  advisorApi.state.width = gameApi.state.width;
  advisorApi.state.height = gameApi.state.height;
  advisorApi.state.worldWidth = gameApi.state.worldWidth;
  advisorApi.state.worldHeight = gameApi.state.worldHeight;
  advisorApi.state.phase = gameApi.state.phase;
  advisorApi.state.winner = gameApi.state.winner
    ? ownerMap[gameApi.state.winner]
    : null;
  advisorApi.state.match.mode = "single";
  advisorApi.state.match.localOwner = advisorApi.OWNER.PLAYER;
  advisorApi.state.match.isHost = true;
}

function syncStateForAdvisor(gameApi, advisorApi) {
  copyStateForAdvisor(gameApi, advisorApi, {
    [gameApi.OWNER.PLAYER]: advisorApi.OWNER.PLAYER,
    [gameApi.OWNER.AI]: advisorApi.OWNER.AI,
    [gameApi.OWNER.NEUTRAL]: advisorApi.OWNER.NEUTRAL,
  });
}

function mirrorStateForAdvisor(gameApi, advisorApi) {
  copyStateForAdvisor(gameApi, advisorApi, {
    [gameApi.OWNER.PLAYER]: advisorApi.OWNER.AI,
    [gameApi.OWNER.AI]: advisorApi.OWNER.PLAYER,
    [gameApi.OWNER.NEUTRAL]: advisorApi.OWNER.NEUTRAL,
  });
}

function executeAdvisorOrdersAsOwner(gameApi, orders, owner) {
  let issued = 0;
  for (const order of orders || []) {
    for (const leg of order.legs || []) {
      const source = gameApi.state.nodes.find((node) => node.id === leg.sourceId);
      if (!source || source.owner !== owner) {
        continue;
      }

      const unitIds = stationedIds(gameApi, source, owner)
        .slice(0, Math.max(0, Math.floor(leg.count)));
      if (unitIds.length === 0) {
        continue;
      }

      if (leg.kind === "point") {
        issued += gameApi.executeUnitOrderToPoint(
          owner,
          unitIds,
          leg.x,
          leg.y,
        );
        continue;
      }

      const target = gameApi.state.nodes.find((node) => node.id === leg.targetId);
      if (target) {
        issued += gameApi.executeUnitOrderToNode(owner, unitIds, target);
      }
    }
  }
  return issued;
}

function executeAdvisorOrdersAsPlayer(gameApi, orders) {
  return executeAdvisorOrdersAsOwner(gameApi, orders, gameApi.OWNER.PLAYER);
}

function gitLines(args) {
  return execFileSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function defaultRefs() {
  return gitLines(["log", "--format=%h", "-n", "5"]);
}

function sourceForRef(ref) {
  return execFileSync("git", ["show", `${ref}:public/game.js`], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function labelForRef(ref) {
  try {
    const [label] = gitLines(["log", "-1", "--format=%h %s", ref]);
    return label || ref;
  } catch {
    return ref;
  }
}

function playerNodes(api) {
  return api.state.nodes.filter((node) => node.owner === api.OWNER.PLAYER);
}

function aiNodes(api) {
  return api.state.nodes.filter((node) => node.owner === api.OWNER.AI);
}

function neutralNodes(api) {
  return api.state.nodes.filter((node) => node.owner === api.OWNER.NEUTRAL);
}

function stationedIds(api, node, owner) {
  return api.stationedUnitsAt(node.id, owner).map((unit) => unit.id);
}

function nodeStrength(api, node, owner = node.owner) {
  const stationed = owner === api.OWNER.NEUTRAL ? 0 : api.stationedUnitsAt(node.id, owner).length;
  return stationed + (node.owner === api.OWNER.NEUTRAL ? node.captureRemaining : node.hp);
}

function incomingTo(api, target, owner) {
  return api.state.units.reduce((sum, unit) => {
    if (unit.owner === owner && unit.state === "moving" && unit.targetId === target.id) {
      return sum + 1;
    }
    return sum;
  }, 0);
}

function sendFromNode(api, source, target, count) {
  const unitIds = stationedIds(api, source, api.OWNER.PLAYER).slice(0, Math.max(0, Math.floor(count)));
  if (unitIds.length > 0) {
    api.executeUnitOrderToNode(api.OWNER.PLAYER, unitIds, target);
  }
  return unitIds.length;
}

function nearestOwnedNode(api, target, owner) {
  const sources = api.state.nodes
    .filter((node) => node.owner === owner && node.id !== target.id)
    .sort((a, b) => distance(a, target) - distance(b, target));
  return sources[0] || null;
}

function strongestPlayerSources(api) {
  return playerNodes(api)
    .map((node) => ({
      node,
      available: Math.max(0, api.stationedUnitsAt(node.id, api.OWNER.PLAYER).length - 2),
    }))
    .filter((entry) => entry.available > 0)
    .sort((a, b) => b.available - a.available);
}

function chooseWeakTarget(api, source, mode) {
  const neutrals = neutralNodes(api)
    .map((node) => ({
      node,
      cost: node.captureRemaining + 1,
      score: node.captureRemaining * 2 + distance(source, node) * 0.035,
    }))
    .sort((a, b) => a.score - b.score);

  const enemies = aiNodes(api)
    .map((node) => ({
      node,
      cost: nodeStrength(api, node, api.OWNER.AI) + (mode === "raider" ? 1 : 2),
      score: nodeStrength(api, node, api.OWNER.AI) * 2.3 + distance(source, node) * 0.025,
    }))
    .sort((a, b) => a.score - b.score);

  if (mode === "raider") {
    const exposed = enemies.find((entry) => entry.cost <= 18) || enemies[0];
    if (exposed) {
      return exposed;
    }
  }

  if (mode === "greedy") {
    return neutrals[0] || enemies[0] || null;
  }

  if (mode === "turtle") {
    return enemies.find((entry) => entry.cost <= 10) || neutrals[0] || null;
  }

  return neutrals.find((entry) => entry.cost <= 18) || enemies[0] || neutrals[0] || null;
}

function runWeakOpponentTurn(api, mode) {
  if (mode === "passive") {
    return;
  }

  if (mode === "turtle") {
    const threatened = playerNodes(api)
      .map((node) => ({
        node,
        threat: incomingTo(api, node, api.OWNER.AI) - incomingTo(api, node, api.OWNER.PLAYER),
      }))
      .filter((entry) => entry.threat > nodeStrength(api, entry.node, api.OWNER.PLAYER) * 0.55)
      .sort((a, b) => b.threat - a.threat)[0];
    if (threatened) {
      const source = nearestOwnedNode(api, threatened.node, api.OWNER.PLAYER);
      if (source) {
        const available = Math.max(0, api.stationedUnitsAt(source.id, api.OWNER.PLAYER).length - 4);
        sendFromNode(api, source, threatened.node, Math.min(available, threatened.threat + 3));
      }
      return;
    }
  }

  const sources = strongestPlayerSources(api);
  const orderLimit = mode === "greedy" ? 2 : 1;
  let issued = 0;
  for (const { node: source, available } of sources) {
    if (issued >= orderLimit) {
      break;
    }
    const target = chooseWeakTarget(api, source, mode);
    if (!target) {
      continue;
    }

    const commitmentRatio = mode === "raider" ? 0.75 : mode === "greedy" ? 1 : 0.85;
    const count = Math.min(available, Math.ceil(target.cost * commitmentRatio));
    if (count >= Math.max(1, target.cost * 0.45) && sendFromNode(api, source, target.node, count) > 0) {
      issued += 1;
    }
  }
}

function runMatch(source, config, seed, opponent, options = {}) {
  const { api, context } = createGame(source, config, seed);
  const settings = { ...DEFAULT_MATCH, ...options };
  api.state.match.mode = "single";
  api.state.match.localOwner = api.OWNER.PLAYER;
  api.state.match.isHost = true;
  api.state.match.connected = false;
  api.newGame({ seed, phase: "playing" });

  const opponentInterval = {
    passive: Infinity,
    weak: 0.9,
    greedy: 0.62,
    raider: 0.7,
    turtle: 0.78,
  }[opponent] || 0.9;
  let opponentElapsed = opponentInterval;
  let elapsed = 0;

  while (elapsed < settings.maxSeconds && api.state.phase === "playing") {
    opponentElapsed += settings.dt;
    if (opponentElapsed >= opponentInterval) {
      opponentElapsed = 0;
      runWeakOpponentTurn(api, opponent);
    }

    context.__now += settings.dt * 1000;
    api.update(settings.dt);
    elapsed += settings.dt;
  }

  const winner = api.state.winner;
  const score =
    api.controlledNodeCount(api.OWNER.AI) -
      api.controlledNodeCount(api.OWNER.PLAYER) +
    (api.unitCount(api.OWNER.AI) - api.unitCount(api.OWNER.PLAYER)) * 0.03;

  return {
    winner,
    aiWon: winner === api.OWNER.AI,
    playerWon: winner === api.OWNER.PLAYER,
    score,
    elapsed,
  };
}

function runVersusMatch(currentSource, currentConfig, previousSource, seed, options = {}) {
  const game = createGame(currentSource, currentConfig, seed);
  const previous = createGame(previousSource, {}, `${seed}-previous`);
  const settings = { ...DEFAULT_MATCH, ...options };
  const opponentInterval = optionalConstantValue(
    previousSource,
    "AI_DECISION_INTERVAL",
    0.28,
  );
  let opponentElapsed = opponentInterval;
  let elapsed = 0;

  game.api.state.match.mode = "single";
  game.api.state.match.localOwner = game.api.OWNER.PLAYER;
  game.api.state.match.isHost = true;
  game.api.state.match.connected = false;
  game.api.newGame({ seed, phase: "playing" });

  while (elapsed < settings.maxSeconds && game.api.state.phase === "playing") {
    opponentElapsed += settings.dt;
    if (opponentElapsed >= opponentInterval) {
      opponentElapsed = 0;
      mirrorStateForAdvisor(game.api, previous.api);
      const orders = previous.api.chooseAiOrders(previous.api.snapshotState());
      executeAdvisorOrdersAsPlayer(game.api, orders);
    }

    game.context.__now += settings.dt * 1000;
    previous.context.__now += settings.dt * 1000;
    game.api.update(settings.dt);
    elapsed += settings.dt;
  }

  return {
    winner: game.api.state.winner,
    aiWon: game.api.state.winner === game.api.OWNER.AI,
    playerWon: game.api.state.winner === game.api.OWNER.PLAYER,
    score:
      game.api.controlledNodeCount(game.api.OWNER.AI) -
        game.api.controlledNodeCount(game.api.OWNER.PLAYER) +
      (game.api.unitCount(game.api.OWNER.AI) -
        game.api.unitCount(game.api.OWNER.PLAYER)) *
        0.03,
    elapsed,
  };
}

function schedule(args) {
  const items = [];
  for (let i = 0; i < args.games; i += 1) {
    const opponent = args.opponents[i % args.opponents.length];
    items.push({
      seed: `${args.seed}-${opponent}-${i}`,
      opponent,
    });
  }
  return items;
}

function evaluateConfig(source, config, args) {
  const items = schedule(args);
  const matches = items.map((item) => runMatch(source, config, item.seed, item.opponent));
  const wins = matches.filter((match) => match.aiWon).length;
  const losses = matches.filter((match) => match.playerWon).length;
  const draws = matches.length - wins - losses;
  const winRate = wins / matches.length;
  const averageScore = matches.reduce((sum, match) => sum + match.score, 0) / matches.length;
  const averageSeconds = matches.reduce((sum, match) => sum + match.elapsed, 0) / matches.length;
  const byOpponent = Object.fromEntries(
    args.opponents.map((opponent) => {
      const subset = matches.filter((_, index) => items[index].opponent === opponent);
      const subsetWins = subset.filter((match) => match.aiWon).length;
      return [
        opponent,
        {
          games: subset.length,
          wins: subsetWins,
          winRate: subset.length ? subsetWins / subset.length : 0,
        },
      ];
    }),
  );

  return {
    games: matches.length,
    wins,
    losses,
    draws,
    winRate,
    averageScore,
    averageSeconds,
    byOpponent,
  };
}

function summarizeMatches(matches) {
  const wins = matches.filter((match) => match.aiWon).length;
  const losses = matches.filter((match) => match.playerWon).length;
  const draws = matches.length - wins - losses;
  return {
    games: matches.length,
    wins,
    losses,
    draws,
    winRate: wins / matches.length,
    averageScore: matches.reduce((sum, match) => sum + match.score, 0) / matches.length,
    averageSeconds:
      matches.reduce((sum, match) => sum + match.elapsed, 0) / matches.length,
  };
}

function evaluateVersusRefs(source, config, args) {
  const refs = args.refs.length > 0 ? args.refs : defaultRefs();
  const refsWithSources = refs.map((ref) => ({
    ref,
    label: labelForRef(ref),
    source: sourceForRef(ref),
  }));
  const perRefGames = Math.max(1, Math.floor(args.games / refsWithSources.length));
  const remainder = args.games % refsWithSources.length;
  const summaries = [];
  const allMatches = [];

  refsWithSources.forEach((entry, refIndex) => {
    const gamesForRef = perRefGames + (refIndex < remainder ? 1 : 0);
    const matches = [];
    for (let i = 0; i < gamesForRef; i += 1) {
      const seed = `${args.seed}-versus-${entry.ref}-${i}`;
      const match = runVersusMatch(source, config, entry.source, seed);
      matches.push(match);
      allMatches.push(match);
    }
    summaries.push({
      ref: entry.ref,
      label: entry.label,
      ...summarizeMatches(matches),
    });
  });

  return {
    ...summarizeMatches(allMatches),
    refs: summaries,
  };
}

function runInvestmentSelfMatch(source, config, seed, enabledSide, options = {}) {
  const baseConfig = { ...config };
  const enabledConfig = { ...baseConfig, AI_INVEST_ENABLED: 1 };
  const disabledConfig = { ...baseConfig, AI_INVEST_ENABLED: 0 };
  const gameConfig = enabledSide === "ai" ? enabledConfig : disabledConfig;
  const aiAdvisorConfig = gameConfig;
  const playerAdvisorConfig = enabledSide === "ai" ? disabledConfig : enabledConfig;
  const game = createGame(source, gameConfig, seed);
  const aiAdvisor = createGame(source, aiAdvisorConfig, `${seed}-ai-advisor`);
  const playerAdvisor = createGame(source, playerAdvisorConfig, `${seed}-player-advisor`);
  const settings = { ...DEFAULT_MATCH, ...options };
  const opponentInterval = optionalConstantValue(source, "AI_DECISION_INTERVAL", 0.28);
  let opponentElapsed = opponentInterval;
  let elapsed = 0;

  game.api.state.match.mode = "single";
  game.api.state.match.localOwner = game.api.OWNER.PLAYER;
  game.api.state.match.isHost = true;
  game.api.state.match.connected = false;
  game.api.newGame({ seed, phase: "playing" });
  game.api.state.match.mode = "lab";

  while (elapsed < settings.maxSeconds && game.api.state.phase === "playing") {
    opponentElapsed += settings.dt;
    if (opponentElapsed >= opponentInterval) {
      opponentElapsed = 0;
      syncStateForAdvisor(game.api, aiAdvisor.api);
      mirrorStateForAdvisor(game.api, playerAdvisor.api);
      const aiOrders = aiAdvisor.api.chooseAiOrders(aiAdvisor.api.snapshotState());
      const playerOrders = playerAdvisor.api.chooseAiOrders(playerAdvisor.api.snapshotState());
      executeAdvisorOrdersAsOwner(game.api, aiOrders, game.api.OWNER.AI);
      executeAdvisorOrdersAsOwner(game.api, playerOrders, game.api.OWNER.PLAYER);
    }

    game.context.__now += settings.dt * 1000;
    aiAdvisor.context.__now += settings.dt * 1000;
    playerAdvisor.context.__now += settings.dt * 1000;
    game.api.update(settings.dt);
    elapsed += settings.dt;
  }

  const winner = game.api.state.winner;
  const enabledWon =
    (enabledSide === "ai" && winner === game.api.OWNER.AI) ||
    (enabledSide === "player" && winner === game.api.OWNER.PLAYER);
  const disabledWon =
    (enabledSide === "ai" && winner === game.api.OWNER.PLAYER) ||
    (enabledSide === "player" && winner === game.api.OWNER.AI);
  const boardScore =
    game.api.controlledNodeCount(game.api.OWNER.AI) -
      game.api.controlledNodeCount(game.api.OWNER.PLAYER) +
    (game.api.unitCount(game.api.OWNER.AI) -
      game.api.unitCount(game.api.OWNER.PLAYER)) *
      0.03;

  return {
    winner,
    enabledWon,
    disabledWon,
    draw: !enabledWon && !disabledWon,
    enabledSide,
    enabledScore: enabledSide === "ai" ? boardScore : -boardScore,
    elapsed,
  };
}

function summarizeSelfMatches(matches) {
  const enabledWins = matches.filter((match) => match.enabledWon).length;
  const disabledWins = matches.filter((match) => match.disabledWon).length;
  const draws = matches.length - enabledWins - disabledWins;
  return {
    games: matches.length,
    enabledWins,
    disabledWins,
    draws,
    enabledWinRate: enabledWins / matches.length,
    averageEnabledScore:
      matches.reduce((sum, match) => sum + match.enabledScore, 0) / matches.length,
    averageSeconds:
      matches.reduce((sum, match) => sum + match.elapsed, 0) / matches.length,
  };
}

function evaluateInvestmentSelfPlay(source, config, args) {
  const matches = [];
  const bySide = {
    ai: [],
    player: [],
  };

  for (let i = 0; i < args.games; i += 1) {
    const seed = `${args.seed}-self-${i}`;
    for (const enabledSide of ["ai", "player"]) {
      const match = runInvestmentSelfMatch(source, config, seed, enabledSide);
      matches.push(match);
      bySide[enabledSide].push(match);
    }
  }

  return {
    fields: args.games,
    ...summarizeSelfMatches(matches),
    bySide: {
      ai: summarizeSelfMatches(bySide.ai),
      player: summarizeSelfMatches(bySide.player),
    },
  };
}

function evaluateOpeningState(source, config, args) {
  const game = createGame(source, config, `${args.seed}-opening`);
  game.api.state.match.mode = "single";
  game.api.state.match.localOwner = game.api.OWNER.PLAYER;
  game.api.state.match.isHost = true;
  game.api.state.match.connected = false;
  game.api.newGame({ seed: `${args.seed}-opening`, phase: "playing" });
  return {
    playerNodes: game.api.controlledNodeCount(game.api.OWNER.PLAYER),
    aiNodes: game.api.controlledNodeCount(game.api.OWNER.AI),
    playerUnits: game.api.unitCount(game.api.OWNER.PLAYER),
    aiUnits: game.api.unitCount(game.api.OWNER.AI),
  };
}

function printResult(label, result) {
  console.log(
    `${label}: ${(result.winRate * 100).toFixed(1)}% wins ` +
      `(${result.wins}/${result.games}, losses ${result.losses}, draws ${result.draws}), ` +
      `score ${result.averageScore.toFixed(2)}, avg ${result.averageSeconds.toFixed(1)}s`,
  );
  for (const [opponent, stats] of Object.entries(result.byOpponent)) {
    console.log(
      `  ${opponent.padEnd(7)} ${(stats.winRate * 100).toFixed(1)}% ` +
        `(${stats.wins}/${stats.games})`,
    );
  }
}

function printSelfPlayResult(label, result) {
  console.log(
    `${label}: investment enabled ${(result.enabledWinRate * 100).toFixed(1)}% wins ` +
      `(${result.enabledWins}/${result.games}, disabled wins ${result.disabledWins}, draws ${result.draws}), ` +
      `${result.fields} paired fields, score ${result.averageEnabledScore.toFixed(2)}, ` +
      `avg ${result.averageSeconds.toFixed(1)}s`,
  );
  console.log(
    `  enabled as AI/right: ${(result.bySide.ai.enabledWinRate * 100).toFixed(1)}% ` +
      `(${result.bySide.ai.enabledWins}/${result.bySide.ai.games}), ` +
      `score ${result.bySide.ai.averageEnabledScore.toFixed(2)}`,
  );
  console.log(
    `  enabled as player/left: ${(result.bySide.player.enabledWinRate * 100).toFixed(1)}% ` +
      `(${result.bySide.player.enabledWins}/${result.bySide.player.games}), ` +
      `score ${result.bySide.player.averageEnabledScore.toFixed(2)}`,
  );
}

function printVersusResult(label, result) {
  console.log(
    `${label}: ${(result.winRate * 100).toFixed(1)}% wins ` +
      `(${result.wins}/${result.games}, losses ${result.losses}, draws ${result.draws}), ` +
      `score ${result.averageScore.toFixed(2)}, avg ${result.averageSeconds.toFixed(1)}s`,
  );
  for (const entry of result.refs) {
    console.log(
      `  ${entry.label}: ${(entry.winRate * 100).toFixed(1)}% ` +
        `(${entry.wins}/${entry.games}, losses ${entry.losses}, draws ${entry.draws})`,
    );
  }
}

function printComparison(label, disabled, enabled) {
  const winDelta = (enabled.winRate - disabled.winRate) * 100;
  const scoreDelta = enabled.averageScore - disabled.averageScore;
  const timeDelta = enabled.averageSeconds - disabled.averageSeconds;
  console.log(label);
  printVersusResult("investment disabled", disabled);
  printVersusResult("investment enabled ", enabled);
  console.log(
    `delta enabled-disabled: ${winDelta.toFixed(1)} win-rate points, ` +
      `${scoreDelta.toFixed(2)} score, ${timeDelta.toFixed(1)}s avg time`,
  );
}

function mutateConfig(base, rng, scale = 1) {
  const next = { ...base };
  for (const [name, range] of Object.entries(TRAINABLE_CONSTANTS)) {
    if (rng() > 0.5) {
      continue;
    }
    const direction = rng() > 0.5 ? 1 : -1;
    const steps = 1 + Math.floor(rng() * Math.max(1, Math.round(3 * scale)));
    const raw = next[name] + direction * range.step * steps;
    const stepped = Math.round(raw / range.step) * range.step;
    next[name] = clamp(Number(stepped.toFixed(4)), range.min, range.max);
  }
  return next;
}

function configFitness(result) {
  return result.winRate * 100000 + result.averageScore * 20 - result.averageSeconds * 0.4;
}

function printConfig(config) {
  for (const name of Object.keys(TRAINABLE_CONSTANTS)) {
    console.log(`  ${name}=${formatNumber(config[name])}`);
  }
}

function applyConfig(source, config) {
  fs.writeFileSync(GAME_PATH, patchConstants(source, config));
}

function main() {
  const args = parseArgs(process.argv);
  const source = fs.readFileSync(GAME_PATH, "utf8");
  const liveConfig = readLiveConfig(source);

  if (args.command === "eval") {
    const result = evaluateConfig(source, liveConfig, args);
    printResult("live", result);
    if (result.winRate < 0.95) {
      console.log("Target not met: benchmark win rate is below 95% for this opponent set.");
      process.exitCode = 1;
    }
    return;
  }

  if (args.command === "versus") {
    const result = evaluateVersusRefs(source, liveConfig, args);
    printVersusResult("current vs previous AI", result);
    if (result.winRate < 0.95) {
      console.log("Target not met: current AI is below 95% against previous iterations.");
      process.exitCode = 1;
    }
    return;
  }

  if (args.command === "invest") {
    const disabledConfig = { ...liveConfig, AI_INVEST_ENABLED: 0 };
    const enabledConfig = { ...liveConfig, AI_INVEST_ENABLED: 1 };
    const disabled = evaluateVersusRefs(source, disabledConfig, args);
    const enabled = evaluateVersusRefs(source, enabledConfig, args);
    printComparison("HP investment A/B vs previous AI", disabled, enabled);
    if (enabled.winRate < 0.95) {
      console.log("Target not met: investment-enabled AI is below 95% against previous iterations.");
      process.exitCode = 1;
    }
    return;
  }

  if (args.command === "self") {
    const result = evaluateInvestmentSelfPlay(source, liveConfig, args);
    printSelfPlayResult("investment enabled vs disabled self-play", result);
    return;
  }

  if (args.command === "opening") {
    const opening = evaluateOpeningState(source, liveConfig, args);
    console.log(
      `opening: nodes ${opening.playerNodes}-${opening.aiNodes}, ` +
        `units ${opening.playerUnits}-${opening.aiUnits}`,
    );
    if (opening.playerUnits !== opening.aiUnits) {
      console.log("Opening unit counts are not equal.");
      process.exitCode = 1;
    }
    return;
  }

  if (args.command !== "train") {
    console.error("Usage: node scripts/ai-lab.js [eval|train|versus|invest|self|opening] [--games=N] [--opponents=weak,greedy] [--refs=HEAD,42aafc8] [--apply]");
    process.exitCode = 2;
    return;
  }

  const rng = makeRng(args.seed);
  let bestConfig = liveConfig;
  let bestResult = evaluateConfig(source, bestConfig, args);
  let bestFitness = configFitness(bestResult);
  printResult("baseline", bestResult);

  for (let generation = 1; generation <= args.generations; generation += 1) {
    const candidates = [{ config: bestConfig, result: bestResult, fitness: bestFitness }];
    const scale = Math.max(0.35, 1 - generation / (args.generations + 3));

    while (candidates.length < args.population) {
      const candidateConfig = mutateConfig(bestConfig, rng, scale);
      const result = evaluateConfig(source, candidateConfig, args);
      candidates.push({
        config: candidateConfig,
        result,
        fitness: configFitness(result),
      });
    }

    candidates.sort((a, b) => b.fitness - a.fitness);
    const leader = candidates[0];
    if (leader.fitness > bestFitness) {
      bestConfig = leader.config;
      bestResult = leader.result;
      bestFitness = leader.fitness;
    }
    printResult(`generation ${String(generation).padStart(2, "0")}`, bestResult);
  }

  console.log("Best constants:");
  printConfig(bestConfig);
  if (args.apply) {
    applyConfig(source, bestConfig);
    console.log("Applied best constants to public/game.js");
  } else {
    console.log("Run with --apply to write these constants into public/game.js.");
  }

  if (bestResult.winRate < 0.95) {
    console.log("Target not met: increase --games, --generations, or tune opponent mix.");
    process.exitCode = 1;
  }
}

main();
