# Node Field online multiplayer

This version removes PeerJS and uses a real WebSocket server.

## Local test

```bash
npm install
npm start
```

Open `http://localhost:3000` on both browsers/laptops. One player creates a room; the other joins using the six-digit room code or the invite URL.

## Deploy

Deploy this folder as a Node app on Render, Railway, Fly.io, or another host that supports WebSockets. The same app serves the frontend from `/public` and hosts the WebSocket server on the same origin, so the browser automatically uses `wss://your-domain` when the site is served over HTTPS.

If you keep the frontend on GitHub Pages and deploy only the server elsewhere, set this before `game.js` loads:

```html
<script>
  window.NODE_FIELD_SERVER_URL = "wss://your-server.example.com";
</script>
<script src="./game.js?v=23"></script>
```
