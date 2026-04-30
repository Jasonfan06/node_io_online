import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoomSocketServer } from "./server/rooms.js";
import { createStaticFileHandler } from "./server/static-files.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const NETWORK_PROTOCOL = "node-field-v1";
const server = http.createServer(createStaticFileHandler(PUBLIC_DIR));

createRoomSocketServer(server, { protocol: NETWORK_PROTOCOL });

server.listen(PORT, () => {
  console.log(`Node Field online server listening on http://localhost:${PORT}`);
});
