const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const mysql2 = require('mysql2');
const app = express();

// your PWA / service worker code
// app.use(express.static("public"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

const sessionMiddleware = session({
    store: new FileStore({ path: './sessions' }),
    secret: 'chat-app-secret-123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
});
app.use(sessionMiddleware);

const dbConfig = {
    host: process.env.DB_HOST || process.env.HOST || "127.0.0.1",
    user: process.env.DB_USER || process.env.USER || "root", // Added process.env.USER
    password: process.env.DB_PASSWORD || process.env.PASSWORD || "Sanket@123",
    port: process.env.DB_PORT || 3306, // Default to 3306 for MySQL
    database: process.env.DB_NAME || "test",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: (process.env.HOST || process.env.DB_HOST) ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false
    } : false
};

console.log(`📡 Attempting to connect to database at ${dbConfig.host}:${dbConfig.port} as user ${dbConfig.user}...`);

const database = mysql2.createPool(dbConfig);
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});
const userSockets = {};

io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Socket connection logic is at the bottom of the file

// Test the connection
database.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Database connection failed:", err);
        return;
    }
    console.log("✅ MySQL database pool is connected...");
    connection.release();

    // Ensure tables exist
    database.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        UserName VARCHAR(255) NOT NULL,
        Passwords VARCHAR(255) NOT NULL,
        email_id VARCHAR(255) NOT NULL UNIQUE
    )`, (err) => {
        if (err) console.error("❌ Error creating users table:", err);
        else console.log("✅ Users table is ready");
    });

    database.query(`CREATE TABLE IF NOT EXISTS friend_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_email VARCHAR(255) NOT NULL,
        requester_name VARCHAR(255) NOT NULL,
        receiver_email VARCHAR(255) NOT NULL,
        status ENUM('pending','accepted') DEFAULT 'pending',
        UNIQUE KEY unique_request (requester_email, receiver_email)
    )`, (err) => {
        if (err) console.error("❌ Error creating friend_requests table:", err);
        else {
            console.log("✅ friend_requests table is ready");
            // Auto-fix for existing tables missing the requester_name column
            database.query("ALTER TABLE friend_requests ADD COLUMN requester_name VARCHAR(255) NOT NULL AFTER requester_email", (err2) => {
                if (err2 && err2.code !== 'ER_DUP_COLUMN_NAME' && err2.errno !== 1060) {
                    // Ignore "duplicate column" errors
                }
            });
        }
    });

    database.query(`CREATE TABLE IF NOT EXISTS friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        friend_email VARCHAR(255) NOT NULL,
        friend_name VARCHAR(255) NOT NULL,
        UNIQUE KEY unique_friendship (user_email, friend_email)
    )`, (err) => {
        if (err) console.error("❌ Error creating friends table:", err);
        else console.log("✅ Friends table is ready");
    });

    database.query(`CREATE TABLE IF NOT EXISTS removed_friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        friend_email VARCHAR(255) NOT NULL,
        friend_name VARCHAR(255) NOT NULL,
        UNIQUE KEY unique_removal (user_email, friend_email)
    )`, (err) => {
        if (err) console.error("❌ Error creating removed_friends table:", err);
        else console.log("✅ removed_friends table is ready");
    });

    database.query(`CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(255) NOT NULL,
        sender_email VARCHAR(255) NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        message_text TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (room_id)
    )`, (err) => {
        if (err) console.error("❌ Error creating messages table:", err);
        else console.log("✅ Messages table is ready");
    });
});
// Sign-up handler
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

app.use(express.urlencoded({ extended: true }));

app.get('/signup', (req, res) => {
    const htmlfile = path.join(__dirname, 'views', 'signup.html');
    res.sendFile(htmlfile);
});

app.post('/handleform', (req, res) => {
    try {
        const { UserName, Passwords, email_id } = req.body;
        console.log(`📝 Signup attempt: ${UserName} (${email_id})`);

        const SQL_COMMAND = "INSERT INTO users(UserName, Passwords, email_id ) VALUES (?, ?, ?)";
        database.query(SQL_COMMAND, [UserName, Passwords, email_id.toLowerCase()], (err, result) => {
            if (err) {
                console.error("❌ Signup DB Error:", err);
                return res.redirect("login_error.html");
            }
            req.session.user = { id: result.insertId, username: UserName, email: email_id.toLowerCase() };
            console.log("✅ Signup successful, session created");
            res.redirect("homepage.html");
        });
    } catch (err) {
        console.error("❌ Signup Catch Error:", err);
        res.redirect("login_error.html");
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'Login.html'));
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.post('/Login', (req, res) => {
    try {
        const { email_id, Passwords } = req.body;
        console.log(`🔑 Login attempt: ${email_id}`);

        if (!email_id || !Passwords) {
            console.warn("⚠️ Login failed: Missing credentials");
            return res.redirect("login_error.html");
        }

        const SQL_COMMAND = "SELECT * FROM users WHERE email_id = ? AND Passwords = ?";
        database.query(SQL_COMMAND, [email_id.toLowerCase(), Passwords], (err, results) => {
            if (err) {
                console.error("❌ Login DB Error:", err);
                return res.redirect("login_error.html");
            }
            if (results.length > 0) {
                const user = results[0];
                req.session.user = { id: user.id, username: user.UserName, email: user.email_id.toLowerCase() };
                console.log(`✅ Login successful for ${user.UserName}`);
                res.redirect("/homepage.html");
            } else {
                console.warn(`⚠️ Login failed for ${email_id}: Invalid credentials`);
                res.redirect("login_error.html");
            }
        });
    } catch (err) {
        console.error("❌ Login Catch Error:", err);
        res.redirect("login_error.html");
    }
});

// ✅ API to get current session user
app.get('/api/me', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: "Not logged in" });
    }
});

// ✅ Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error("❌ Logout error:", err);
        res.redirect('/login');
    });
});

// ✅ API to add a friend (using database)
app.post('/api/request-friend', async (req, res) => {
    if (!req.session.user) {
        console.error("❌ Request friend failed: No session user");
        return res.status(401).json({ error: "Unauthorized" });
    }
    const { friend_email, friend_name } = req.body;
    const requester_email = req.session.user.email.toLowerCase();
    const requester_name = req.session.user.username;
    const target_email = friend_email.toLowerCase();

    // Insert request if not exists
    const insertSQL = "INSERT IGNORE INTO friend_requests (requester_email, requester_name, receiver_email) VALUES (?, ?, ?)";
    database.query(insertSQL, [requester_email, requester_name, target_email], (err, result) => {
        if (err) {
            console.error("❌ DB Error inserting friend request:", err);
            return res.status(500).json({ error: "Failed to request friend" });
        }
        console.log(`✅ Friend request from ${requester_email} to ${target_email}`);
        // Notify receiver if online via socket
        const socketId = userSockets[target_email];
        if (socketId) {
            io.to(socketId).emit('friend request', { from: requester_email, name: req.session.user.username });
        }
        res.json({ success: true });
    });
});

app.post('/api/accept-friend', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const requester_email = req.body.requester_email.toLowerCase();
    const requester_name = req.body.requester_name;
    const receiver_email = req.session.user.email.toLowerCase();
    const receiver_name = req.session.user.username;

    // Update request status
    const updateSQL = "UPDATE friend_requests SET status='accepted' WHERE requester_email=? AND receiver_email=?";
    database.query(updateSQL, [requester_email, receiver_email], (err) => {
        if (err) return res.status(500).json({ error: "Failed to accept" });

        // Insert into friends table for both sides
        const insertFriend = "INSERT IGNORE INTO friends (user_email, friend_email, friend_name) VALUES (?, ?, ?), (?, ?, ?)";
        database.query(insertFriend, [
            requester_email, receiver_email, receiver_name,
            receiver_email, requester_email, requester_name
        ], (err2) => {
            if (err2) {
                console.error("❌ Error adding to friends table:", err2);
                return res.status(500).json({ error: "Failed to add friend" });
            }

            // Notify requester if online
            const socketId = userSockets[requester_email];
            if (socketId) {
                io.to(socketId).emit('friend accepted', { by: receiver_email });
            }
            res.json({ success: true });
        });
    });
});
app.post('/api/add-friend', (req, res) => {
    if (!req.session.user) {
        console.error("❌ Add friend failed: No session user found");
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { friend_email, friend_name } = req.body;
    const user_email = req.session.user.email;

    console.log(`👤 User ${user_email} is adding friend ${friend_email} (${friend_name})`);

    const checkSQL = "INSERT IGNORE INTO friends (user_email, friend_email, friend_name) VALUES (?, ?, ?)";
    database.query(checkSQL, [user_email, friend_email, friend_name], (err, result) => {
        if (err) {
            console.error("❌ DB Error adding friend:", err);
            return res.status(500).json({ error: "Failed to add friend" });
        }
        console.log("✅ Friend added successfully to DB");
        res.json({ success: true });
    });
});




// ✅ API to get sent friend requests
app.get('/api/sent-requests', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const user_email = req.session.user.email;
    const SQL_COMMAND = "SELECT receiver_email FROM friend_requests WHERE requester_email = ? AND status = 'pending'";
    database.query(SQL_COMMAND, [user_email], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Failed to fetch sent requests" });
        }
        res.json(results.map(r => r.receiver_email));
    });
});

// ✅ API to get pending friend requests
app.get('/api/friend-requests', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const user_email = req.session.user.email;
    const SQL_COMMAND = "SELECT requester_email, requester_name FROM friend_requests WHERE receiver_email = ? AND status = 'pending'";
    database.query(SQL_COMMAND, [user_email], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Failed to fetch requests" });
        }
        res.json(results);
    });
});

app.get('/api/friends', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

    const user_email = req.session.user.email;
    const SQL_COMMAND = "SELECT friend_email, friend_name FROM friends WHERE user_email = ?";
    database.query(SQL_COMMAND, [user_email], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Failed to fetch friends" });
        }
        res.json(results);
    });
});

// ✅ API to remove a friend
app.post('/api/remove-friend', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

    const { friend_email, friend_name } = req.body;
    const user_email = req.session.user.email;

    console.log(`👤 User ${user_email} is removing friend ${friend_email}`);

    // First, get the friend's name if not provided (though it usually is)
    const removeSQL = "DELETE FROM friends WHERE user_email = ? AND friend_email = ?";
    database.query(removeSQL, [user_email, friend_email], (err, result) => {
        if (err) {
            console.error("❌ DB Error removing friend:", err);
            return res.status(500).json({ error: "Failed to remove friend" });
        }

        // Also remove reciprocal
        database.query("DELETE FROM friends WHERE user_email = ? AND friend_email = ?", [friend_email, user_email]);

        // Add to removed_friends list
        const logSQL = "INSERT IGNORE INTO removed_friends (user_email, friend_email, friend_name) VALUES (?, ?, ?)";
        database.query(logSQL, [user_email, friend_email, friend_name || 'User'], (err2) => {
            if (err2) console.error("❌ Error logging removal:", err2);
            console.log("✅ Friend removed and logged successfully");
            res.json({ success: true });
        });
    });
});

// ✅ API to get removed friends
app.get('/api/removed-friends', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const user_email = req.session.user.email;
    const SQL_COMMAND = "SELECT friend_email, friend_name FROM removed_friends WHERE user_email = ?";
    database.query(SQL_COMMAND, [user_email], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Failed to fetch removed friends" });
        }
        res.json(results);
    });
});

// ✅ API to restore/re-add a removed friend
app.post('/api/restore-friend', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const { friend_email } = req.body;
    const user_email = req.session.user.email;

    const SQL_COMMAND = "DELETE FROM removed_friends WHERE user_email = ? AND friend_email = ?";
    database.query(SQL_COMMAND, [user_email, friend_email], (err) => {
        if (err) return res.status(500).json({ error: "Failed to restore" });
        res.json({ success: true });
    });
});
// ✅ HomePage handler
app.use(express.static(path.join(__dirname, 'public')));

// ✅ API to Search Users from MySQL Database
app.get('/api/users', (req, res) => {
    const searchQuery = req.query.q || '';
    const myEmail = req.session.user ? req.session.user.email : '';

    // Search for users, but EXCLUDE the currently logged-in user
    const SQL_COMMAND = "SELECT UserName, email_id FROM users WHERE UserName LIKE ? AND email_id != ?";
    database.query(SQL_COMMAND, [`%${searchQuery}%`, myEmail], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database search failed" });
        }
        res.json(results);
    });
});

// for forgot password 

app.post('/reset-password', (req, res) => {
    const { email_id, newPassword } = req.body;

    if (!email_id || !newPassword) {
        return res.status(400).send("Email and new password are required.");
    }

    const updateSQL = "UPDATE users SET Passwords = ? WHERE email_id = ?";
    database.query(updateSQL, [newPassword, email_id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error updating password.");
        }
        if (result.affectedRows === 0) {
            return res.status(404).send("User not found.");
        }
        res.send("Password reset successful.");
    });
});

// old one

// app.listen(3001, () => {
//     console.log('Server is running on port 3001');
// });



// 🔥 Socket.io logic
io.on('connection', (socket) => {
    // --- WebRTC Signaling ---
    socket.on('call-user', (data) => {
        const { to, offer, from, name, type } = data;
        const targetSocketId = userSockets[to.toLowerCase()];

        if (targetSocketId) {
            io.to(targetSocketId).emit('video-offer', {
                offer,
                from,
                name,
                type
            });
        }
    });

    socket.on('make-answer', (data) => {
        const { to, answer } = data;
        const targetSocketId = userSockets[to.toLowerCase()];

        if (targetSocketId) {
            io.to(targetSocketId).emit('video-answer', {
                answer,
                from: socket.request.session.user.email
            });
        }
    });

    socket.on('ice-candidate', (data) => {
        const { to, candidate } = data;
        const targetSocketId = userSockets[to.toLowerCase()];

        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
                candidate,
                from: socket.request.session.user.email
            });
        }
    });

    socket.on('reject-call', (data) => {
        const { to } = data;
        const targetSocketId = userSockets[to.toLowerCase()];

        if (targetSocketId) {
            io.to(targetSocketId).emit('call-rejected');
        }
    });

    socket.on('hangup', (data) => {
        const { to } = data;
        const targetSocketId = userSockets[to.toLowerCase()];

        if (targetSocketId) {
            io.to(targetSocketId).emit('video-hangup');
        }
    });
    // till here i added the peice of code
    // Session tracking
    if (socket.request.session && socket.request.session.user) {
        const email = socket.request.session.user.email.toLowerCase();
        userSockets[email] = socket.id;
        console.log(`👤 User ${email} connected with socket ${socket.id}`);
    } else {
        console.log('User connected:', socket.id);
    }

    // Join a private room
    socket.on('join room', (data) => {
        let { room_id } = data;
        if (room_id) {
            room_id = room_id.trim().toLowerCase();
            socket.join(room_id);
            console.log(`👤 Socket ${socket.id} joined room: ${room_id}`);

            // Send chat history for this room
            const SQL_COMMAND = "SELECT sender_name as username, sender_email, message_text as text, timestamp FROM messages WHERE room_id = ? ORDER BY timestamp ASC";
            database.query(SQL_COMMAND, [room_id], (err, results) => {
                if (err) {
                    console.error("❌ Error fetching history:", err);
                    return;
                }
                const history = results.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp // Send raw DB timestamp (ISO/Date object)
                }));
                socket.emit('chat history', history);
            });
        }
    });

    // Chat message event
    socket.on('chat message', (msg) => {
        let { room_id, sender_email, username, text } = msg;
        if (room_id) {
            room_id = room_id.trim().toLowerCase();

            // Re-ensure the socket is in the room (prevents silent drops)
            socket.join(room_id);

            // Save to DB
            const SQL_COMMAND = "INSERT INTO messages (room_id, sender_email, sender_name, message_text) VALUES (?, ?, ?, ?)";
            database.query(SQL_COMMAND, [room_id, sender_email, username, text], (err) => {
                if (err) console.error("❌ Error saving message:", err);
            });

            // Broadcast to EVERYONE in the room
            io.to(room_id).emit('chat message', {
                text: text,
                username: username,
                sender_email: sender_email,
                timestamp: new Date().toISOString() // Send raw ISO string
            });
        }
    });

    // --- WebRTC Signaling ---
    socket.on('call-user', (data) => {
        const { to, offer, from, name } = data;
        const targetSocketId = userSockets[to.toLowerCase()];
        if (targetSocketId) {
            io.to(targetSocketId).emit('video-offer', {
                offer,
                from,
                name,
                type
            });
        }
    });

    socket.on('make-answer', (data) => {
        const { to, answer } = data;
        const targetSocketId = userSockets[to.toLowerCase()];
        if (targetSocketId) {
            io.to(targetSocketId).emit('video-answer', {
                answer: answer,
                from: socket.request.session.user.email
            });
        }
    });

    socket.on('reject-call', (data) => {
        const { to } = data;
        const targetSocketId = userSockets[to.toLowerCase()];
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-rejected', {
                from: socket.request.session.user.email
            });
        }
    });

    socket.on('ice-candidate', (data) => {
        const { to, candidate } = data;
        const targetSocketId = userSockets[to.toLowerCase()];
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
                candidate: candidate,
                from: socket.request.session.user.email
            });
        }
    });

    socket.on('hangup', (data) => {
        const { to } = data;
        const targetSocketId = userSockets[to.toLowerCase()];
        if (targetSocketId) {
            io.to(targetSocketId).emit('video-hangup');
        }
    });

    socket.on('disconnect', () => {
        if (socket.request.session && socket.request.session.user) {
            const email = socket.request.session.user.email;
            delete userSockets[email];
            console.log(`👤 User ${email} disconnected`);
        } else {
            console.log('User disconnected:', socket.id);
        }
    });
});

// 🔥 Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is LIVE and running on port ${PORT}`);
});
