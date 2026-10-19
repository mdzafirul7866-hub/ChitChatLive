const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Global In-Memory Data Storage
const globalRegisteredUsers = {}; // socketId -> user details
const activeRooms = {};           // roomId -> room details

// 🔒 ADMIN SECRET KEY CONFIGURATION
const ADMIN_SECRET_KEY = "MD Zafirul 658"; 

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Standard User Registration & Identification
    socket.on('register_user', (userData) => {
        globalRegisteredUsers[socket.id] = {
            id: socket.id,
            name: userData.name || 'Unknown User',
            contact: userData.contact || 'N/A',
            banned: false
        };
        socket.emit('user_registered', { success: true, id: socket.id });
        
        // Refresh Admin View if active
        io.to('admin_room').emit('admin_refresh_data', getAdminData());
    });

    // 🔑 ADMIN LOGIN VERIFICATION
    socket.on('admin_login', ({ secretKey }) => {
        if (secretKey === ADMIN_SECRET_KEY) {
            socket.join('admin_room');
            socket.data.isAdmin = true;
            
            socket.emit('admin_auth_success', getAdminData());
            console.log(`Admin Authenticated Successfully: ${socket.id}`);
        } else {
            socket.emit('admin_auth_failed', 'Invalid Secret Key! Please try again.');
        }
    });

    // 🚫 ADMIN TOGGLE BAN USER
    socket.on('admin_toggle_ban', ({ targetSocketId }) => {
        if (socket.data.isAdmin && globalRegisteredUsers[targetSocketId]) {
            globalRegisteredUsers[targetSocketId].banned = !globalRegisteredUsers[targetSocketId].banned;
            
            // Notify target user if they get banned
            if (globalRegisteredUsers[targetSocketId].banned) {
                io.to(targetSocketId).emit('user_banned_notice', 'You have been banned by the admin.');
            }

            io.to('admin_room').emit('admin_refresh_data', getAdminData());
        }
    });

    // 💺 ADMIN FORCE KICK SEAT
    socket.on('admin_force_seat', ({ roomId, seatIndex }) => {
        if (socket.data.isAdmin && activeRooms[roomId]) {
            if (activeRooms[roomId].seats && activeRooms[roomId].seats[seatIndex]) {
                activeRooms[roomId].seats[seatIndex] = null;
                
                // Notify room members and admin
                io.to(roomId).emit('seat_updated', { seats: activeRooms[roomId].seats });
                io.to('admin_room').emit('admin_refresh_data', getAdminData());
            }
        }
    });

    // 📢 ADMIN GLOBAL FLASH ANNOUNCEMENT
    socket.on('admin_global_announcement', ({ message }) => {
        if (socket.data.isAdmin) {
            io.emit('global_flash_announcement', { message });
        }
    });

    // DISCONNECT HANDLING & CLEANUP
    socket.on('disconnect', () => {
        console.log(`User Disconnected: ${socket.id}`);
        delete globalRegisteredUsers[socket.id];
        
        // Remove user from any active seats
        Object.keys(activeRooms).forEach(rId => {
            if (activeRooms[rId].seats) {
                activeRooms[rId].seats = activeRooms[rId].seats.map(s => s && s.id === socket.id ? null : s);
            }
        });

        io.to('admin_room').emit('admin_refresh_data', getAdminData());
    });
});

// Helper Function to Package Admin Data
function getAdminData() {
    return {
        users: Object.values(globalRegisteredUsers),
        rooms: Object.values(activeRooms)
    };
}

// SERVER PORT BINDING (For Render & Local deployment)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
