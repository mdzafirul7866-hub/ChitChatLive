const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

// In-memory rooms: { [roomId]: { id, name, host, members: Set<socketId> } }
const activeRooms = {};

const roomList = () =>
  Object.values(activeRooms).map((r) => ({
    id: r.id, name: r.name, host: r.host, count: r.members.size,
  }));
const broadcastRooms = () => io.emit("room-list", roomList());

function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId || !activeRooms[roomId]) return;
  const room = activeRooms[roomId];
  room.members.delete(socket.id);
  socket.leave(roomId);
  socket.to(roomId).emit("user-left", { id: socket.id });
  if (room.members.size === 0) delete activeRooms[roomId];
  socket.data.roomId = null;
  broadcastRooms();
}

io.on("connection", (socket) => {
  socket.emit("room-list", roomList());

  socket.on("create-room", ({ name, host }, cb) => {
    const id = crypto.randomBytes(4).toString("hex");
    activeRooms[id] = {
      id,
      name: String(name || "Untitled Room").slice(0, 40),
      host: String(host || "Guest").slice(0, 24),
      members: new Set(),
    };
    broadcastRooms();
    cb && cb({ id });
  });

  socket.on("join-room", ({ roomId, username }, cb) => {
    const room = activeRooms[roomId];
    if (!room) return cb && cb({ error: "Room not found" });
    leaveRoom(socket);
    socket.data.username = String(username || "Guest").slice(0, 24);
    socket.data.roomId = roomId;
    const peers = [...room.members].map((id) => ({
      id, username: io.sockets.sockets.get(id)?.data.username || "Guest",
    }));
    room.members.add(socket.id);
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", { id: socket.id, username: socket.data.username });
    broadcastRooms();
    cb && cb({ room: { id: room.id, name: room.name, host: room.host }, peers });
  });

  // WebRTC signaling relays
  socket.on("offer", ({ to, sdp }) => io.to(to).emit("offer", { from: socket.id, sdp, username: socket.data.username }));
  socket.on("answer", ({ to, sdp }) => io.to(to).emit("answer", { from: socket.id, sdp }));
  socket.on("ice-candidate", ({ to, candidate }) => io.to(to).emit("ice-candidate", { from: socket.id, candidate }));

  socket.on("leave-room", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`ChitChatLive running on port ${PORT}`));
