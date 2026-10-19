const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));
app.use(express.json());

// Secret Owner Password Key
const ADMIN_SECRET_KEY = "manoवर_owner_2026";

let activeRooms = {}; 
let registeredUsers = {}; // { socketId: { name, contact, banned: false } }

io.on('connection', (socket) => {

    socket.on('login_user', (userData) => {
        if (registeredUsers[socket.id]?.banned) {
            socket.emit('user_banned_alert', "Aapka account Admin dwara ban kar diya gaya hai!");
            return;
        }
        registeredUsers[socket.id] = { id: socket.id, name: userData.name, contact: userData.contact, banned: false };
        socket.data.user = userData;
        socket.emit('update_room_list', Object.values(activeRooms));
    });

    // --- ADMIN PANEL AUTH & ACTIONS ---
    socket.on('admin_login', ({ secretKey }) => {
        if (secretKey === ADMIN_SECRET_KEY) {
            socket.emit('admin_auth_success', {
                users: Object.values(registeredUsers),
                rooms: Object.values(activeRooms)
            });
        } else {
            socket.emit('admin_auth_failed', "Galat Secret Key! Access Denied.");
        }
    });

    socket.on('admin_toggle_ban', ({ targetSocketId }) => {
        if (registeredUsers[targetSocketId]) {
            registeredUsers[targetSocketId].banned = !registeredUsers[targetSocketId].banned;
            io.to(targetSocketId).emit('user_banned_alert', "Aapko Admin ne ban/unban kiya hai.");
            io.emit('admin_refresh_data', { users: Object.values(registeredUsers), rooms: Object.values(activeRooms) });
        }
    });

    socket.on('admin_force_seat', ({ roomId, seatIndex, targetSocketId, targetName }) => {
        const room = activeRooms[roomId];
        if (!room) return;

        if (targetSocketId === null) {
            room.seats[seatIndex] = null; // Clear seat
        } else {
            room.seats = room.seats.map(s => s?.id === targetSocketId ? null : s);
            room.seats[seatIndex] = { id: targetSocketId, name: targetName };
        }
        io.to(roomId).emit('update_room_state', room);
        io.emit('admin_refresh_data', { users: Object.values(registeredUsers), rooms: Object.values(activeRooms) });
    });

    socket.on('admin_global_announcement', ({ message }) => {
        io.emit('global_flash_announcement', message);
    });

    // --- ROOMS & SEATING ---
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

    socket.on('disconnect', () => {
        delete registeredUsers[socket.id];
        const roomId = socket.data.roomId;
        if (roomId && activeRooms[roomId]) {
            activeRooms[roomId].seats = activeRooms[roomId].seats.map(s => s?.id === socket.id ? null : s);
            io.to(roomId).emit('update_room_state', activeRooms[roomId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Admin Panel Server running on port ${PORT}`));
