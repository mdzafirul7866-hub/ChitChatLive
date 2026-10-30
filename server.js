const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const users = {}; 
const rooms = {
    "room_1": { id: "room_1", title: "VIP PTT Room 103", type: "ptt", seats: Array(10).fill(null), owner: "Admin" },
    "room_2": { id: "room_2", title: "Family Open Lounge", type: "open_mic", seats: Array(10).fill(null), owner: "Admin" }
};

// Video ke mutabiq alag-alag virtual gifts (No recharge gateway)
const GIFTS = {
    "rose": { name: "Rose", cost: 10, icon: "🌹" },
    "car": { name: "Sports Car", cost: 500, icon: "🏎️" },
    "rocket": { name: "Rocket", cost: 2000, icon: "🚀" },
    "crown": { name: "VIP Crown", cost: 5000, icon: "👑" },
    "cp_special": { name: "CP Special Gift", cost: 10000, icon: "💎" }
};

const ADMIN_PASSWORD = "admin123password";

app.post('/api/login', (req, res) => {
    const { phone, username, vipLevel } = req.body;
    if (!phone) return res.status(400).json({ success: false, msg: "Number daalein!" });
    res.json({ 
        success: true, 
        user: { 
            phone, 
            name: username || 'User_' + phone.slice(-4), 
            vipLevel: vipLevel || 5, 
            coins: 10000 
        } 
    });
});

io.on('connection', (socket) => {

    socket.on('join_app', (userData) => {
        users[socket.id] = { id: socket.id, ...userData, isAdmin: false };
        io.emit('update_user_list', Object.values(users));
        io.emit('room_list_update', Object.values(rooms));
    });

    // Naya room create karne ka feature (Jaise video me bataya)
    socket.on('create_room', ({ roomTitle, roomType }) => {
        const roomId = 'room_' + Date.now();
        rooms[roomId] = {
            id: roomId,
            title: roomTitle || 'My Party Room',
            type: roomType || 'ptt',
            seats: Array(10).fill(null),
            owner: users[socket.id] ? users[socket.id].name : 'User'
        };
        io.emit('room_list_update', Object.values(rooms));
    });

    socket.on('admin_login', (pass) => {
        if (pass === ADMIN_PASSWORD) {
            if (users[socket.id]) users[socket.id].isAdmin = true;
            socket.emit('admin_auth_res', { success: true });
        } else {
            socket.emit('admin_auth_res', { success: false, msg: "Galat admin password!" });
        }
    });

    socket.on('join_room', (roomId) => {
        if (!rooms[roomId]) return;
        socket.join(roomId);
        socket.currentRoom = roomId;
        socket.emit('room_info', rooms[roomId]);
        socket.emit('update_seats', rooms[roomId].seats);
    });

    // Seat management (Host/Admin permission check)
    socket.on('take_seat', ({ seatIndex }) => {
        const roomId = socket.currentRoom;
        if (!roomId || !rooms[roomId]) return;
        let room = rooms[roomId];

        if (seatIndex >= 0 && seatIndex < 10 && !room.seats[seatIndex]) {
            room.seats = room.seats.map(s => s && s.id === socket.id ? null : s);
            room.seats[seatIndex] = {
                id: socket.id,
                name: users[socket.id].name,
                vipLevel: users[socket.id].vipLevel,
                isTalking: false
            };
            io.to(roomId).emit('update_seats', room.seats);
        }
    });

    socket.on('leave_seat', () => {
        const roomId = socket.currentRoom;
        if (!roomId || !rooms[roomId]) return;
        rooms[roomId].seats = rooms[roomId].seats.map(s => s && s.id === socket.id ? null : s);
        io.to(roomId).emit('update_seats', rooms[roomId].seats);
    });

    // WebRTC Signaling
    socket.on('webrtc_offer', ({ targetId, offer }) => {
        io.to(targetId).emit('webrtc_offer', { senderId: socket.id, offer });
    });

    socket.on('webrtc_answer', ({ targetId, answer }) => {
        io.to(targetId).emit('webrtc_answer', { senderId: socket.id, answer });
    });

    socket.on('webrtc_ice', ({ targetId, candidate }) => {
        io.to(targetId).emit('webrtc_ice', { senderId: socket.id, candidate });
    });

    // 15s PTT Mic Control
    socket.on('start_talking', () => {
        const roomId = socket.currentRoom;
        if (!roomId || !rooms[roomId] || rooms[roomId].type !== 'ptt') return;
        let seat = rooms[roomId].seats.find(s => s && s.id === socket.id);
        if (seat) { seat.isTalking = true; io.to(roomId).emit('update_seats', rooms[roomId].seats); }
    });

    socket.on('stop_talking', () => {
        const roomId = socket.currentRoom;
        if (!roomId || !rooms[roomId] || rooms[roomId].type !== 'ptt') return;
        let seat = rooms[roomId].seats.find(s => s && s.id === socket.id);
        if (seat) { seat.isTalking = false; io.to(roomId).emit('update_seats', rooms[roomId].seats); }
    });

    socket.on('send_gift', ({ giftKey }) => {
        const roomId = socket.currentRoom;
        const sender = users[socket.id];
        const gift = GIFTS[giftKey];

        if (!roomId || !sender || !gift) return;
        if (sender.coins < gift.cost) return socket.emit('error_msg', 'Paryapt coins nahi hain!');

        sender.coins -= gift.cost;
        socket.emit('update_wallet', sender.coins);

        io.to(roomId).emit('gift_animation', { senderName: sender.name, gift });
    });

    socket.on('send_chat', (msg) => {
        const roomId = socket.currentRoom;
        const user = users[socket.id];
        if (roomId && user) {
            io.to(roomId).emit('new_chat', { sender: user.name, vipLevel: user.vipLevel, msg });
        }
    });

    socket.on('admin_kick_seat', (seatIndex) => {
        if (!users[socket.id] || !users[socket.id].isAdmin) return;
        const roomId = socket.currentRoom;
        if (roomId && rooms[roomId]) {
            rooms[roomId].seats[seatIndex] = null;
            io.to(roomId).emit('update_seats', rooms[roomId].seats);
        }
    });

    socket.on('disconnect', () => {
        if (socket.currentRoom && rooms[socket.currentRoom]) {
            rooms[socket.currentRoom].seats = rooms[socket.currentRoom].seats.map(s => s && s.id === socket.id ? null : s);
            io.to(socket.currentRoom).emit('update_seats', rooms[socket.currentRoom].seats);
        }
        delete users[socket.id];
        io.emit('update_user_list', Object.values(users));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
