const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

let activeRooms = {};

io.on('connection', (socket) => {

    socket.on('login_user', (userData) => {
        socket.data.user = userData;
        socket.emit('update_room_list', Object.values(activeRooms));
    });

    socket.on('create_room', ({ roomName, hostName, hostContact }) => {
        const roomId = 'room_' + Date.now();
        activeRooms[roomId] = {
            id: roomId,
            roomName: roomName,
            hostName: hostName,
            hostContact: hostContact,
            hostSocketId: socket.id,
            seats: Array(9).fill(null)
        };
        // Host gets Seat 1 automatically
        activeRooms[roomId].seats[0] = { id: socket.id, name: hostName };

        io.emit('update_room_list', Object.values(activeRooms));
    });

    socket.on('join_room', ({ roomId }) => {
        socket.join(roomId);
        socket.data.roomId = roomId;
        if (activeRooms[roomId]) {
            io.to(roomId).emit('update_room_state', activeRooms[roomId]);
        }
    });

    socket.on('leave_room', ({ roomId }) => {
        socket.leave(roomId);
        if (activeRooms[roomId]) {
            activeRooms[roomId].seats = activeRooms[roomId].seats.map(s => s?.id === socket.id ? null : s);
            io.to(roomId).emit('update_room_state', activeRooms[roomId]);
        }
        socket.data.roomId = null;
    });

    // ADMIN CONTROLLED SEATING LOGIC
    socket.on('seat_click_request', ({ roomId, seatIndex, userName, socketId }) => {
        const room = activeRooms[roomId];
        if (!room) return;

        // If clicking own occupied seat, unseat
        if (room.seats[seatIndex]?.id === socketId) {
            room.seats[seatIndex] = null;
            io.to(roomId).emit('update_room_state', room);
            return;
        }

        // If Host clicks or Host is self, sit directly
        if (room.hostSocketId === socketId) {
            room.seats[seatIndex] = { id: socketId, name: userName };
            io.to(roomId).emit('update_room_state', room);
        } else {
            // Send permission request to Host
            io.to(room.hostSocketId).emit('seat_request_pending_host', { seatIndex, userName, socketId });
            socket.emit('seat_request_pending_host', { seatIndex, userName, socketId });
        }
    });

    socket.on('approve_seat_request', ({ roomId, seatIndex, targetSocketId, userName }) => {
        const room = activeRooms[roomId];
        if (!room) return;

        room.seats[seatIndex] = { id: targetSocketId, name: userName };
        io.to(roomId).emit('update_room_state', room);
    });

    socket.on('send_gift', ({ roomId, giftName, emoji, sender }) => {
        io.to(roomId).emit('receive_gift_anim', { giftName, emoji, sender });
    });

    socket.on('send_msg', ({ roomId, text, sender }) => {
        io.to(roomId).emit('receive_msg', { sender, text });
    });

    socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        if (roomId && activeRooms[roomId]) {
            activeRooms[roomId].seats = activeRooms[roomId].seats.map(s => s?.id === socket.id ? null : s);
            io.to(roomId).emit('update_room_state', activeRooms[roomId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 ChitChat Server running on port ${PORT}`));
