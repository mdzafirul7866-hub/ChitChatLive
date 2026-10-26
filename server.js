const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// इन-मेमोरी डेटाबेस
let rooms = {
    "main-room": {
        id: "main-room",
        name: "आवाज 🌸 सुनने ❤️ को",
        announcement: "🔥 ChitChat Official Room: नियमों का पालन करें!",
        seats: Array(9).fill(null), // 9 seats
        seatLocks: [false, true, true, true, true, true, true, true, true], // Host seat unlocked by default
        seatRequests: [],
        currentMusic: null
    }
};

let userWallets = {};
let messageHistory = {};
let userProfiles = {};

// Express API - Check Call Security Permission
app.post('/api/check-call-permission', (req, res) => {
    const { sender, receiver } = req.body;
    const key1 = `${sender}_${receiver}`;
    const key2 = `${receiver}_${sender}`;
    const canCall = messageHistory[key1] || messageHistory[key2] || false;
    res.json({ allowed: canCall });
});

// Express API - Admin Stats
app.get('/api/admin/stats', (req, res) => {
    res.json({
        activeRooms: Object.keys(rooms).length,
        totalUsers: Object.keys(userWallets).length,
        roomsData: rooms,
        usersData: userWallets
    });
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join_room', (userData) => {
        socket.data.user = userData;
        if (!userWallets[userData.name]) {
            userWallets[userData.name] = { coins: 1000, vip: true, avatarBorder: 'border-pink-500', socketId: socket.id };
        } else {
            userWallets[userData.name].socketId = socket.id;
        }

        userProfiles[userData.name] = userData.profile || {
            bio: "ChitChat Enthusiast 🚀",
            dp: "https://via.placeholder.com/150",
            bgDp: "https://via.placeholder.com/400x150"
        };

        const room = rooms["main-room"];
        socket.emit('init_room', { room, wallet: userWallets[userData.name] });

        // Broadcast Entrance Effect
        io.emit('entrance_effect', {
            name: userData.name,
            message: `✨ VIP User ${userData.name} ने रूम में शानदार एंट्री की!`
        });
    });

    // Seat Request / Seat Lock Enforcement
    socket.on('request_seat', ({ seatIndex }) => {
        const room = rooms["main-room"];
        const user = socket.data.user;

        if (!room.seatLocks[seatIndex]) {
            // Unlocked Seat: Sit immediately
            assignSeat(socket, seatIndex);
        } else {
            // Locked Seat: Send request to host/admin
            io.emit('chat_message', { sender: 'System', text: `📩 ${user.name} ने सीट #${seatIndex + 1} पर बैठने के लिए रिक्वेस्ट भेजी है।` });
        }
    });

    socket.on('approve_seat_request', ({ seatIndex, targetSocketId }) => {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            assignSeat(targetSocket, seatIndex);
        }
    });

    function assignSeat(userSocket, seatIndex) {
        const room = rooms["main-room"];
        const user = userSocket.data.user || { name: 'User' };

        // Clear existing seat
        room.seats = room.seats.map(s => s?.id === userSocket.id ? null : s);
        room.seats[seatIndex] = { id: userSocket.id, name: user.name, speaking: false, muted: false };

        io.emit('update_seats', room.seats);
    }

    socket.on('leave_seat', () => {
        const room = rooms["main-room"];
        room.seats = room.seats.map(s => s?.id === socket.id ? null : s);
        io.emit('update_seats', room.seats);
    });

    // Push-To-Talk Events
    socket.on('ptt_start', () => {
        const room = rooms["main-room"];
        room.seats.forEach(s => {
            if (s && s.id === socket.id) s.speaking = true;
        });
        io.emit('update_seats', room.seats);
    });

    socket.on('ptt_stop', () => {
        const room = rooms["main-room"];
        room.seats.forEach(s => {
            if (s && s.id === socket.id) s.speaking = false;
        });
        io.emit('update_seats', room.seats);
    });

    // Music Playback Control
    socket.on('play_music', ({ trackName, trackUrl }) => {
        rooms["main-room"].currentMusic = { trackName, trackUrl, playing: true };
        io.emit('music_updated', rooms["main-room"].currentMusic);
    });

    // Admin Controls
    socket.on('admin_action', ({ action, targetId, seatIndex }) => {
        const room = rooms["main-room"];
        if (action === 'kick_seat') {
            if (seatIndex !== undefined) room.seats[seatIndex] = null;
            io.emit('update_seats', room.seats);
        } else if (action === 'kick_room') {
            io.to(targetId).emit('kicked_from_app');
        }
    });

    // Gifting System (#103 and special gifts)
    socket.on('send_gift', ({ giftId, giftName, cost }) => {
        const user = socket.data.user;
        if (user && userWallets[user.name] && userWallets[user.name].coins >= cost) {
            userWallets[user.name].coins -= cost;
            socket.emit('wallet_update', userWallets[user.name]);
            io.emit('gift_animation', {
                sender: user.name,
                giftId,
                giftName,
                message: `🎁 ${user.name} ने शानदार Gift ${giftName} (#${giftId}) भेजा!`
            });
        } else {
            socket.emit('error_msg', 'पर्याप्त कॉइन्स नहीं हैं!');
        }
    });

    socket.on('send_message', ({ receiver, text }) => {
        const user = socket.data.user || { name: 'Guest' };
        if (receiver) {
            messageHistory[`${user.name}_${receiver}`] = true;
        }
        io.emit('chat_message', { sender: user.name, text });
    });

    socket.on('disconnect', () => {
        const room = rooms["main-room"];
        room.seats = room.seats.map(s => s?.id === socket.id ? null : s);
        io.emit('update_seats', room.seats);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`ChitChat Advanced Server running on port ${PORT}`));
