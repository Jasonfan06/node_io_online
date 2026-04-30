import { WebSocketServer, WebSocket } from "ws";

const ROOM_RE = /^\d{6}$/;
const EMPTY_ROOM_TTL_MS = 60 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 60_000;

function safeRoomId(value) {
  const roomId = String(value || "").trim();
  return ROOM_RE.test(roomId) ? roomId : null;
}

export function createRoomSocketServer(server, { protocol }) {
  const rooms = new Map();
  const clients = new Map();
  const wss = new WebSocketServer({ server });

  function send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ protocol, ...message }));
    }
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

  function relayToRoomPeer(ws, message, fromRole, targetRole) {
    const client = clients.get(ws);
    if (client?.role !== fromRole) {
      return;
    }

    const room = rooms.get(client.roomId);
    const peer = room?.[targetRole];
    if (peer) {
      send(peer, message);
    }
  }

  function handleMessage(ws, raw) {
    let message = null;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "serverError", message: "Invalid JSON" });
      return;
    }

    if (!message || message.protocol !== protocol) {
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
        relayToRoomPeer(ws, message, "host", "guest");
        break;
      case "order":
        relayToRoomPeer(ws, message, "guest", "host");
        break;
      default:
        send(ws, { type: "serverError", message: `Unknown message type: ${message.type}` });
        break;
    }
  }

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

      if (!hostOpen || (!guestOpen && ageMs > EMPTY_ROOM_TTL_MS)) {
        rooms.delete(roomId);
      }
    }
  }, ROOM_CLEANUP_INTERVAL_MS).unref();

  return wss;
}
