const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.json());
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chitchat';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ DB Connected'))
  .catch(err => console.log('⚠️ DB Connection Warning:', err.message));

let activeRooms = {}; 

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('user_login', (userData) => {
        socket.data.user = userData;
        socket.emit('room_list_update', Object.values(activeRooms));
    });

    socket.on('create_room', ({ roomName, hostName }) => {
        const roomId = 'room_' + Date.now();
        const newRoom = {
            id: roomId,
            roomName: roomName,
            hostName: hostName,
            hostSocketId: socket.id,
            membersCount: 0,
            seats: Array(9).fill(null)
        };
        activeRooms[roomId] = newRoom;
        io.emit('room_list_update', Object.values(activeRooms));
    });

    socket.on('join_specific_room', ({ roomId, name }) => {
        socket.join(roomId);
        socket.data.currentRoom = roomId;

        if (activeRooms[roomId]) {
            activeRooms[roomId].membersCount = (activeRooms[roomId].membersCount || 0) + 1;
            
            // Send existing room users list for WebRTC mesh connection
            const roomClients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
            socket.emit('room_users_list', roomClients);

            io.to(roomId).emit('room_state_update', activeRooms[roomId]);
            io.emit('room_list_update', Object.values(activeRooms));
        }
    });

    socket.on('leave_room', ({ roomId }) => {
        socket.leave(roomId);
        if (activeRooms[roomId]) {
            activeRooms[roomId].membersCount = Math.max(0, (activeRooms[roomId].membersCount || 1) - 1);
            activeRooms[roomId].seats = activeRooms[roomId].seats.map(s => s?.id === socket.id ? null : s);

            io.to(roomId).emit('room_state_update', activeRooms[roomId]);
            io.emit('room_list_update', Object.values(activeRooms));
        }
        socket.data.currentRoom = null;
    });

    socket.on('toggle_seat', ({ roomId, seatIndex }) => {
        const room = activeRooms[roomId];
        if (!room) return;

        const userName = socket.data.user?.name || 'User';

        if (room.seats[seatIndex]?.id === socket.id) {
            room.seats[seatIndex] = null;
        } else if (!room.seats[seatIndex]) {
            room.seats = room.seats.map(s => s?.id === socket.id ? null : s);
            room.seats[seatIndex] = { id: socket.id, name: userName };
        }

        io.to(roomId).emit('room_state_update', room);
    });

    socket.on('send_room_message', ({ roomId, text }) => {
        const userName = socket.data.user?.name || 'Guest';
        io.to(roomId).emit('room_chat_message', { sender: userName, text: text });
    });

    socket.on('start_audio_stream', (data) => {
        socket.to(data.roomId).emit('user_joined_audio', data);
    });

    socket.on('webrtc_offer', (data) => {
        io.to(data.targetId).emit('webrtc_offer', data);
    });

    socket.on('webrtc_answer', (data) => {
        io.to(data.targetId).emit('webrtc_answer', data);
    });

    socket.on('webrtc_ice_candidate', (data) => {
        io.to(data.targetId).emit('webrtc_ice_candidate', data);
    });

    socket.on('disconnect', () => {
        const roomId = socket.data.currentRoom;
        if (roomId && activeRooms[roomId]) {
            activeRooms[roomId].membersCount = Math.max(0, (activeRooms[roomId].membersCount || 1) - 1);
            activeRooms[roomId].seats = activeRooms[roomId].seats.map(s => s?.id === socket.id ? null : s);
            io.to(roomId).emit('room_state_update', activeRooms[roomId]);
            io.emit('room_list_update', Object.values(activeRooms));
        }
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
