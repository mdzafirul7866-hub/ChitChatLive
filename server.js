const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chitchat';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ DB Connected'))
  .catch(err => console.log('⚠️ DB Connection Warning:', err.message));

let roomState = {
    membersCount: 1845,
    seats: Array(9).fill(null),
    announcement: "🔥 ChitChat Official Club: स्वागत है!"
};

let userWallets = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    socket.emit('init_room', roomState);

    socket.on('join_room', (userData) => {
        socket.data.user = userData;
        if (!userWallets[userData.name]) {
            userWallets[userData.name] = { coins: 1000 };
        }
        socket.emit('wallet_update', userWallets[userData.name]);
        io.emit('chat_message', { sender: 'System', text: `${userData.name} ऐप से जुड़ गए हैं।` });
    });

    socket.on('toggle_seat', ({ seatIndex }) => {
        const user = socket.data.user || { name: 'User' };
        if (roomState.seats[seatIndex]?.id === socket.id) {
            roomState.seats[seatIndex] = null;
        } else if (!roomState.seats[seatIndex]) {
            roomState.seats = roomState.seats.map(s => s?.id === socket.id ? null : s);
            roomState.seats[seatIndex] = { id: socket.id, name: user.name };
        }
        io.emit('update_seats', roomState.seats);
    });

    socket.on('send_message', ({ text }) => {
        const user = socket.data.user || { name: 'Guest' };
        io.emit('chat_message', { sender: user.name, text });
    });

    socket.on('disconnect', () => {
        roomState.seats = roomState.seats.map(s => s?.id === socket.id ? null : s);
        io.emit('update_seats', roomState.seats);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
