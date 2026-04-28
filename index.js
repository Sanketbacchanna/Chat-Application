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

app.use(session({
    store: new FileStore({ path: './sessions' }),
    secret: 'chat-app-secret-123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

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

// Test the connection
database.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Database connection failed:", err);
        return;
    }
    console.log("✅ MySQL database pool is connected...");
    connection.release();

    // Ensure tables exist (we don't need to CREATE DATABASE if it's already specified in the pool config)
    database.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        UserName VARCHAR(255) NOT NULL,
        Passwords VARCHAR(255) NOT NULL,
        email_id VARCHAR(255) NOT NULL UNIQUE
    )`, (err) => {
        if (err) console.error("❌ Error creating users table:", err);
        else console.log("✅ Users table is ready");
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
        database.query(SQL_COMMAND, [UserName, Passwords, email_id], (err, result) => {
            if (err) {
                console.error("❌ Signup DB Error:", err);
                return res.redirect("login_error.html");
            }
            req.session.user = { id: result.insertId, username: UserName, email: email_id };
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
        database.query(SQL_COMMAND, [email_id, Passwords], (err, results) => {
            if (err) {
                console.error("❌ Login DB Error:", err);
                return res.redirect("login_error.html");
            }
            if (results.length > 0) {
                const user = results[0];
                req.session.user = { id: user.id, username: user.UserName, email: user.email_id };
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

// ✅ API to get friends list
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

    const { friend_email } = req.body;
    const user_email = req.session.user.email;

    console.log(`👤 User ${user_email} is removing friend ${friend_email}`);

    const SQL_COMMAND = "DELETE FROM friends WHERE user_email = ? AND friend_email = ?";
    database.query(SQL_COMMAND, [user_email, friend_email], (err, result) => {
        if (err) {
            console.error("❌ DB Error removing friend:", err);
            return res.status(500).json({ error: "Failed to remove friend" });
        }
        console.log("✅ Friend removed successfully from DB");
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

// 🔥 Create HTTP server for socket.io
const server = http.createServer(app);

// 🔥 Attach socket.io
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// 🔥 Socket.io logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

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
                    timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
                timestamp: new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// 🔥 Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is LIVE and running on port ${PORT}`);
});
