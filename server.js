import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const NETWORK_PROTOCOL = "node-field-v1";
const ROOM_RE = /^\d{6}$/;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

const rooms = new Map();
const clients = new Map();

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ protocol: NETWORK_PROTOCOL, ...message }));
  }
}

function safeRoomId(value) {
  const roomId = String(value || "").trim();
  return ROOM_RE.test(roomId) ? roomId : null;
}

function detachFromRoom(ws, notify = true) {
  const client = clients.get(ws);
  if (!client?.roomId) {
    clients.delete(ws);
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    clients.delete(ws);
    return;
  }

  if (room.host === ws) {
    if (notify && room.guest) {
      send(room.guest, { type: "opponentLeft" });
      const guestClient = clients.get(room.guest);
      if (guestClient) {
        guestClient.roomId = null;
        guestClient.role = null;
      }
    }
    rooms.delete(room.id);
  } else if (room.guest === ws) {
    room.guest = null;
    if (notify && room.host) {
      send(room.host, { type: "opponentLeft" });
    }
  }

  clients.delete(ws);
}

function createRoom(ws, message) {
  const requestedRoomId = safeRoomId(message.roomId);
  if (!requestedRoomId) {
    send(ws, { type: "serverError", message: "Invalid room code" });
    return;
  }

  if (rooms.has(requestedRoomId)) {
    send(ws, { type: "roomUnavailable", roomId: requestedRoomId });
    return;
  }

  detachFromRoom(ws, false);

  const room = {
    id: requestedRoomId,
    host: ws,
    guest: null,
    createdAt: Date.now(),
  };
  rooms.set(room.id, room);
  clients.set(ws, { roomId: room.id, role: "host", clientId: message.clientId || null });

  send(ws, { type: "roomCreated", roomId: room.id });
}

function joinRoom(ws, message) {
  const roomId = safeRoomId(message.roomId);
  const room = roomId ? rooms.get(roomId) : null;

  if (!room || room.host.readyState !== WebSocket.OPEN) {
    send(ws, { type: "joinFailed", reason: "missing", roomId });
    return;
  }

  if (room.guest && room.guest.readyState === WebSocket.OPEN) {
    send(ws, { type: "joinFailed", reason: "full", roomId });
    return;
  }

  detachFromRoom(ws, false);

  room.guest = ws;
  clients.set(ws, { roomId: room.id, role: "guest", clientId: message.clientId || null });

  send(ws, { type: "joinedRoom", roomId: room.id });
  send(room.host, { type: "guestJoined", roomId: room.id });
}

function relayFromHost(ws, message) {
  const client = clients.get(ws);
  if (client?.role !== "host") {
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room?.guest) {
    return;
  }

  send(room.guest, message);
}

function relayFromGuest(ws, message) {
  const client = clients.get(ws);
  if (client?.role !== "guest") {
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room?.host) {
    return;
  }

  send(room.host, message);
}

function handleMessage(ws, raw) {
  let message = null;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    send(ws, { type: "serverError", message: "Invalid JSON" });
    return;
  }

  if (!message || message.protocol !== NETWORK_PROTOCOL) {
    send(ws, { type: "serverError", message: "Protocol mismatch" });
    return;
  }

  switch (message.type) {
    case "createRoom":
      createRoom(ws, message);
      break;
    case "joinRoom":
      joinRoom(ws, message);
      break;
    case "init":
    case "snapshot":
      relayFromHost(ws, message);
      break;
    case "order":
      relayFromGuest(ws, message);
      break;
    default:
      send(ws, { type: "serverError", message: `Unknown message type: ${message.type}` });
      break;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const rawPath = new URL(req.url || "/", `http://${req.headers.host}`).pathname;
    const normalized = rawPath === "/" ? "/index.html" : decodeURIComponent(rawPath);
    const filePath = path.normalize(path.join(PUBLIC_DIR, normalized));

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  clients.set(ws, { roomId: null, role: null, clientId: null });

  ws.on("message", (raw) => handleMessage(ws, raw));
  ws.on("close", () => detachFromRoom(ws, true));
  ws.on("error", () => detachFromRoom(ws, true));
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    const hostOpen = room.host?.readyState === WebSocket.OPEN;
    const guestOpen = room.guest?.readyState === WebSocket.OPEN;
    const ageMs = now - room.createdAt;

    if (!hostOpen || (!guestOpen && ageMs > 60 * 60 * 1000)) {
      rooms.delete(roomId);
    }
  }
}, 60_000).unref();

server.listen(PORT, () => {
  console.log(`Node Field online server listening on http://localhost:${PORT}`);
});
