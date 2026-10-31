# ChitChatLive

Real-time voice rooms using Node.js, Express, Socket.io and WebRTC.

## Run locally
    npm install
    npm start
Open http://localhost:3000 (allow microphone access).

## Deploy to Render
1. Push this folder to a GitHub repo named `ChitChatLive`.
2. On Render: New > Web Service > pick the repo.
3. Build command: `npm install`  Start command: `npm start`.

Note: Only a STUN server is used. Some users behind strict firewalls/mobile networks may need a TURN server
(add it to `ICE_SERVERS` in public/index.html).
