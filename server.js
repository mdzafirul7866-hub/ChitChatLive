const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const otpStore = {};
const users = {}; 

// Two Different Room Types
const rooms = {
    "family_room": { 
        id: "family_room", 
        title: "📞 Family Group (10 Seats Open Call)", 
        type: "open_mic", // Open mic, no PTT needed
        seats: Array(10).fill(null) 
    },
    "ptt_room": { 
        id: "ptt_room", 
        title: "🔥 Pange & Live Room (15s PTT)", 
        type: "ptt", // Requires holding 15s mic
        seats: Array(10).fill(null) 
    }
};

const ADMIN_PASSWORD = "admin123password";

// OTP APIs
app.post('/api/send-otp', (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, msg: "मोबाइल नंबर दर्ज करें!" });
    otpStore[phone] = "1234";
    res.json({ success: true, msg: "OTP भेज दिया गया है (Demo OTP: 1234)" });
});

app.post('/api/verify-otp', (req, res) => {
    const { phone, otp } = req.body;
    if (otpStore[phone] && otpStore[phone] === otp) {
        delete otpStore[phone];
        return res.json({ success: true, phone });
    }
    res.status(400).json({ success: false, msg: "गलत OTP दर्ज किया है!" });
});

io.on('connection', (socket) => {

    socket.on('auth_login', ({ phone, username, bio, interests }) => {
        users[socket.id] = {
            id: socket.id,
            phone,
            name: username || 'User_' + phone.slice(-4),
            bio: bio || "Hey there!",
            interests: interests || "Chat",
            isAdmin: false
        };
        socket.emit('auth_success', users[socket.id]);
        io.emit('update_user_list', Object.values(users));
    });

    socket.on('update_profile', ({ bio, interests }) => {
        if (users[socket.id]) {
            users[socket.id].bio = bio;
            users[socket.id].interests = interests;
            io.emit('update_user_list', Object.values(users));
        }
    });

    socket.on('admin_login', (pass) => {
        if (pass === ADMIN_PASSWORD) {
            if (users[socket.id]) users[socket.id].isAdmin = true;
            socket.emit('admin_auth_res', { success: true });
        } else {
            socket.emit('admin_auth_res', { success: false, msg: "गलत एडमिन पासवर्ड!" });
        }
    });

    // Join Room & Send Room Type Info
    socket.on('join_room', (roomId) => {
        if (!rooms[roomId]) return;
        socket.join(roomId);
        socket.currentRoom = roomId;
        socket.emit('room_info', rooms[roomId]); // Send type: 'open_mic' or 'ptt'
        socket.emit('update_seats', rooms[roomId].seats);
    });

    // 10 Seats Management
    socket.on('take_seat', ({ seatIndex }) => {
        const roomId = socket.currentRoom;
        if (!roomId || !rooms[roomId]) return;
        let room = rooms[roomId];

        if (seatIndex >= 0 && seatIndex < 10 && !room.seats[seatIndex]) {
            room.seats = room.seats.map(s => s && s.id === socket.id ? null : s);
            room.seats[seatIndex] = {
                id: socket.id,
                name: users[socket.id].name,
                isTalking: room.type === 'open_mic' ? true : false // Open mic is always active, PTT is off initially
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

    // PTT Talking Signals (Only for PTT Room)
    socket.on('start_talking', () => {
        const roomId = socket.currentRoom;
        if (!roomId || !rooms[roomId] || rooms[roomId].type !== 'ptt') return;
        let seat = rooms[roomId].seats.find(s => s && s.id === socket.id);
        if (seat) {
            seat.isTalking = true;
            io.to(roomId).emit('update_seats', rooms[roomId].seats);
        }
    });

    socket.on('stop_talking', () => {
        const roomId = socket.currentRoom;
        if (!roomId || !rooms[roomId] || rooms[roomId].type !== 'ptt') return;
        let seat = rooms[roomId].seats.find(s => s && s.id === socket.id);
        if (seat) {
            seat.isTalking = false;
            io.to(roomId).emit('update_seats', rooms[roomId].seats);
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
