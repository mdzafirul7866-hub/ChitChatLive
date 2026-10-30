const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

let activeRooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Get Active Rooms
    socket.emit('update-rooms', Object.values(activeRooms));

    // Create Room
    socket.on('create-room', (roomName) => {
        const roomId = 'room_' + Math.random().toString(36).substr(2, 9);
        activeRooms[roomId] = {
            id: roomId,
            name: roomName,
            host: socket.id,
            users: []
        };
        io.emit('update-rooms', Object.values(activeRooms));
        socket.emit('room-created', roomId);
    });

    // Join Room Signaling for WebRTC Voice
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-joined', socket.id);

        socket.on('offer', (data) => {
            io.to(data.target).emit('offer', { signal: data.signal, sender: socket.id });
        });

        socket.on('answer', (data) => {
            io.to(data.target).emit('answer', { signal: data.signal, sender: socket.id });
        });

        socket.on('ice-candidate', (data) => {
            io.to(data.target).emit('ice-candidate', { candidate: data.candidate, sender: socket.id });
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ChitChat Server running on port ${PORT}`);
});
