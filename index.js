const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const mysql2 = require('mysql2');
const webpush = require('web-push');
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
    store: new FileStore({ path: './sessions', ttl: 31536000 }), // 1 year in seconds
    secret: 'chat-app-secret-123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 365 * 24 * 60 * 60 * 1000 } // 1 year
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
const activeOffers = {}; // Stores pending calls
const callIntervals = {}; // Store ringing intervals

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

    database.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        subscription TEXT NOT NULL,
        UNIQUE KEY unique_sub (user_email, subscription(255))
    )`, (err) => {
        if (err) console.error("❌ Error creating push_subscriptions table:", err);
        else console.log("✅ Push subscriptions table is ready");
    });

    database.query(`CREATE TABLE IF NOT EXISTS friend_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_email VARCHAR(255) NOT NULL,
        requester_name VARCHAR(255) NOT NULL,
        receiver_email VARCHAR(255) NOT NULL,
        status ENUM('pending', 'accepted') DEFAULT 'pending',
        UNIQUE KEY unique_request (requester_email, receiver_email)
    )`, (err) => {
        if (err) console.error("❌ Error creating friend_requests table:", err);
        else console.log("✅ friend_requests table is ready");
    });

    database.query(`CREATE TABLE IF NOT EXISTS call_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        caller_email VARCHAR(255) NOT NULL,
        caller_name VARCHAR(255) NOT NULL,
        receiver_email VARCHAR(255) NOT NULL,
        call_type ENUM('audio', 'video') NOT NULL,
        status ENUM('missed', 'rejected', 'completed') NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (caller_email),
        INDEX (receiver_email)
    )`, (err) => {
        if (err) console.error("❌ Error creating call_history table:", err);
        else console.log("✅ call_history table is ready");
    });
});

// Configure Web Push
const publicVapidKey = 'BNFk2xYscFbIl9RUG74PoTlxwkJPw8XoBuWnCQan0P5_yMlKQ6FhA4Dtn0uaEta8RyOthkCraoiOvgN2GDCtHgo';
const privateVapidKey = 'uCPs0wTlMwnB5-vIKGQfJgZnI6xYtyVceKgn6J1vUck';
webpush.setVapidDetails('mailto:test@example.com', publicVapidKey, privateVapidKey);

// Push subscription endpoint
app.post('/api/subscribe', (req, res) => {
    if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const subscription = req.body;
    const user_email = req.session.user.email.toLowerCase();
    
    const SQL = "INSERT IGNORE INTO push_subscriptions (user_email, subscription) VALUES (?, ?)";
    database.query(SQL, [user_email, JSON.stringify(subscription)], (err) => {
        if (err) {
            console.error('❌ Failed to save push subscription:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ success: true });
    });
});

// Helper to send push
function sendPushNotification(userEmail, payload) {
    const SQL = "SELECT subscription FROM push_subscriptions WHERE user_email = ?";
    database.query(SQL, [userEmail.toLowerCase()], (err, results) => {
        if (err || results.length === 0) return;
        results.forEach(row => {
            try {
                const sub = JSON.parse(row.subscription);
                webpush.sendNotification(sub, JSON.stringify(payload)).catch(e => {
                    if (e.statusCode === 410 || e.statusCode === 404) {
                        // Delete expired subscription
                        database.query("DELETE FROM push_subscriptions WHERE subscription = ?", [row.subscription]);
                    }
                });
            } catch (err) {}
        });
    });
}
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
        const normalizedEmail = email_id ? email_id.trim().toLowerCase() : "";
        const normalizedUsername = UserName ? UserName.trim() : "";
        
        console.log(`📝 Signup attempt: ${normalizedUsername} (${normalizedEmail})`);

        if (!normalizedEmail || !Passwords || !normalizedUsername) {
            return res.redirect("login_error.html");
        }

        const SQL_COMMAND = "INSERT INTO users(UserName, Passwords, email_id ) VALUES (?, ?, ?)";
        database.query(SQL_COMMAND, [normalizedUsername, Passwords, normalizedEmail], (err, result) => {
            if (err) {
                console.error("❌ Signup DB Error:", err);
                return res.redirect("login_error.html");
            }
            req.session.user = { id: result.insertId, username: normalizedUsername, email: normalizedEmail };
            req.session.save((saveErr) => {
                if (saveErr) console.error("❌ Session save error:", saveErr);
                console.log("✅ Signup successful, session created");
                res.redirect("homepage.html");
            });
        });
    } catch (err) {
        console.error("❌ Signup Catch Error:", err);
        res.redirect("login_error.html");
    }
});

app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'Login.html'));
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.post('/Login', (req, res) => {
    try {
        const { email_id, Passwords } = req.body;
        const normalizedEmail = email_id ? email_id.trim().toLowerCase() : "";
        console.log(`🔑 Login attempt: ${normalizedEmail}`);

        if (!normalizedEmail || !Passwords) {
            console.warn("⚠️ Login failed: Missing credentials");
            return res.redirect("login_error.html");
        }

        const SQL_COMMAND = "SELECT * FROM users WHERE email_id = ? AND Passwords = ?";
        database.query(SQL_COMMAND, [normalizedEmail, Passwords], (err, results) => {
            if (err) {
                console.error("❌ Login DB Error:", err);
                return res.redirect("login_error.html");
            }
            if (results.length > 0) {
                const user = results[0];
                req.session.user = { id: user.id, username: user.UserName, email: user.email_id.toLowerCase() };
                req.session.save((saveErr) => {
                    if (saveErr) console.error("❌ Session save error:", saveErr);
                    console.log(`✅ Login successful for ${user.UserName}`);
                    res.redirect("/homepage.html");
                });
            } else {
                console.warn(`⚠️ Login failed for ${normalizedEmail}: Invalid credentials`);
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

    // Insert request if not exists, or update status to pending if it already exists
    const insertSQL = "INSERT INTO friend_requests (requester_email, requester_name, receiver_email, status) VALUES (?, ?, ?, 'pending') ON DUPLICATE KEY UPDATE status='pending', requester_name=?";
    database.query(insertSQL, [requester_email, requester_name, target_email, requester_name], (err, result) => {
        if (err) {
            console.error("❌ DB Error inserting/updating friend request:", err);
            return res.status(500).json({ error: "Failed to request friend" });
        }
        console.log(`✅ Friend request from ${requester_email} to ${target_email}`);
        // Notify receiver if online via socket
        io.to(target_email).emit('friend request', { from: requester_email, name: req.session.user.username });
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
            io.to(requester_email).emit('friend accepted', { by: receiver_email });
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
    const user_email = req.session.user.email.toLowerCase();
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
    const user_email = req.session.user.email.toLowerCase();
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

    const user_email = req.session.user.email.toLowerCase();
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
    const user_email = req.session.user.email.toLowerCase();
    const target_email = friend_email.toLowerCase();

    console.log(`👤 User ${user_email} is removing friend ${target_email}`);

    // Delete from friends table
    const removeSQL = "DELETE FROM friends WHERE (user_email = ? AND friend_email = ?) OR (user_email = ? AND friend_email = ?)";
    database.query(removeSQL, [user_email, target_email, target_email, user_email], (err, result) => {
        if (err) {
            console.error("❌ DB Error removing friend:", err);
            return res.status(500).json({ error: "Failed to remove friend" });
        }

        // Also delete from friend_requests to allow re-requesting later
        database.query("DELETE FROM friend_requests WHERE (requester_email = ? AND receiver_email = ?) OR (requester_email = ? AND receiver_email = ?)", [user_email, target_email, target_email, user_email]);

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
            console.error("❌ DB Error fetching removed friends:", err);
            return res.status(500).json({ error: "Failed to fetch removed friends" });
        }
        res.json(results);
    });
});

// ✅ API to restore a friend
app.post('/api/restore-friend', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    
    const { friend_email } = req.body;
    const user_email = req.session.user.email;
    const user_name = req.session.user.username;

    // 1. Get friend's name from removed_friends
    database.query("SELECT friend_name FROM removed_friends WHERE user_email = ? AND friend_email = ?", [user_email, friend_email], (err, results) => {
        if (err || results.length === 0) return res.status(400).json({ error: "Friend not found in removed list" });
        
        const friend_name = results[0].friend_name;
        
        // 2. Insert into friends table (both ways)
        const insertSQL = "INSERT IGNORE INTO friends (user_email, friend_email, friend_name) VALUES (?, ?, ?), (?, ?, ?)";
        database.query(insertSQL, [user_email, friend_email, friend_name, friend_email, user_email, user_name], (err2) => {
            if (err2) {
                console.error("❌ DB Error restoring friend:", err2);
                return res.status(500).json({ error: "Failed to restore friend" });
            }
            
            // 3. Delete from removed_friends
            database.query("DELETE FROM removed_friends WHERE user_email = ? AND friend_email = ?", [user_email, friend_email], (err3) => {
                if (err3) console.error("❌ Error deleting from removed_friends:", err3);
                console.log(`✅ Friend ${friend_email} restored by ${user_email}`);
                res.json({ success: true });
            });
        });
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

// ✅ API to reject call from Push Notification
app.post('/api/reject-call-push', (req, res) => {
    let myEmail = "";
    let callerEmail = req.body.caller ? req.body.caller.toLowerCase() : "";
    
    if (req.body.token && req.body.receiver) {
        myEmail = req.body.receiver.toLowerCase();
        const offerData = activeOffers[myEmail];
        if (!offerData || offerData.rejectToken !== req.body.token) {
            return res.status(401).json({ error: 'Unauthorized token' });
        }
    } else {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        myEmail = req.session.user.email.toLowerCase();
    }

    const offerData = activeOffers[myEmail];
    if (offerData && offerData.from === callerEmail) {
        // If the interval was deleted, it means the user already opened the app!
        // We should ignore stale push notification declines.
        if (!callIntervals[myEmail]) {
            return res.json({ success: true, ignored: true });
        }

        const SQL = "INSERT INTO call_history (caller_email, caller_name, receiver_email, call_type, status) VALUES (?, ?, ?, ?, 'rejected')";
        database.query(SQL, [offerData.from, offerData.name, myEmail, offerData.type]);
        delete activeOffers[myEmail];
        
        // Notify caller that call was rejected
        io.to(callerEmail).emit('call-rejected', { from: myEmail, debug: "API reject-call-push" });
        
        // Tell all receiver's devices to stop ringing
        io.to(myEmail).emit('call-rejected', { from: myEmail, selfReject: true });
    }
    res.json({ success: true });
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

// ✅ API to Get Call History
app.get('/api/call-history', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const myEmail = req.session.user.email.toLowerCase();

    const SQL_COMMAND = `
        SELECT * FROM call_history 
        WHERE caller_email = ? OR receiver_email = ? 
        ORDER BY timestamp DESC LIMIT 50
    `;
    database.query(SQL_COMMAND, [myEmail, myEmail], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
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

    // ✅ Session tracking
    if (socket.request.session && socket.request.session.user) {
        const email = socket.request.session.user.email.toLowerCase();
        userSockets[email] = socket.id;
        socket.join(email); // Join a personal room for multi-device support
        console.log(`👤 User ${email} connected with socket ${socket.id}`);
    } else {
        console.log(`👤 Guest connected: ${socket.id}`);
    }

    // =========================
    // PRIVATE CHAT ROOM JOIN
    // =========================
    socket.on('join room', (data) => {
        let { room_id } = data;

        if (!room_id) return;

        room_id = room_id.trim().toLowerCase();
        socket.join(room_id);

        console.log(`👤 Socket ${socket.id} joined room: ${room_id}`);

        // Load previous messages
        const SQL_COMMAND = `
            SELECT sender_name as username,
                   sender_email,
                   message_text as text,
                   timestamp
            FROM messages
            WHERE room_id = ?
            ORDER BY timestamp ASC
        `;

        database.query(SQL_COMMAND, [room_id], (err, results) => {
            if (err) {
                console.error("❌ Error fetching history:", err);
                return;
            }

            socket.emit('chat history', results);
        });
    });

    // =========================
    // CHAT MESSAGE
    // =========================
    socket.on('chat message', (msg) => {
        let { room_id, sender_email, username, text } = msg;

        if (!room_id || !text) return;

        room_id = room_id.trim().toLowerCase();

        socket.join(room_id);

        // Save message
        const SQL_COMMAND = `
            INSERT INTO messages (room_id, sender_email, sender_name, message_text)
            VALUES (?, ?, ?, ?)
        `;

        database.query(SQL_COMMAND, [room_id, sender_email, username, text], (err) => {
            if (err) {
                console.error("❌ Error saving message:", err);
            }
        });

        // Broadcast message to room
        io.to(room_id).emit('chat message', {
            text,
            username,
            sender_email,
            timestamp: new Date().toISOString()
        });

        // Send push notification to the receiver's personal room
        const emails = room_id.split('_');
        const targetEmail = emails.find(e => e !== sender_email);
        if (targetEmail) {
            const pushData = {
                type: 'message',
                fromEmail: sender_email,
                fromName: username,
                text: text,
                room_id: room_id
            };
            io.to(targetEmail).emit('push notification', pushData);
            
            // Send actual Web Push for offline support
            let msgText = text;
            if (msgText.includes('<img')) msgText = '📷 Image';
            else if (msgText.includes('<audio')) msgText = '🎤 Voice Message';
            else if (msgText.includes('<a href')) msgText = '📎 Attachment';

            sendPushNotification(targetEmail, {
                title: `Message from ${username}`,
                body: msgText,
                url: `/personal_chat.html?user=${encodeURIComponent(username)}&email=${encodeURIComponent(sender_email)}`
            });
        }
    });

    // =========================
    // WEBRTC CALL USER
    // =========================
    socket.on('call-user', (data) => {
        const { to, offer, from, name, type } = data;
        
        // Store the active offer in memory
        const rejectToken = Math.random().toString(36).substring(2, 15);
        activeOffers[to.toLowerCase()] = { offer, from, name, type, rejectToken };
        
        io.to(to.toLowerCase()).emit('video-offer', { offer, from, name, type });
        console.log(`📞 Call from ${from} to ${to}`);
        
        // Send Web Push for incoming call
        const pushPayload = {
            title: `Incoming ${type} Call`,
            body: `${name} is calling you. Tap to view.`,
            url: `/personal_chat.html?user=${encodeURIComponent(name)}&email=${encodeURIComponent(from)}&toEmail=${encodeURIComponent(to)}&rt=${rejectToken}`
        };
        sendPushNotification(to, pushPayload);
        
        if (callIntervals[to.toLowerCase()]) {
            clearInterval(callIntervals[to.toLowerCase()]);
            delete callIntervals[to.toLowerCase()];
        }
        callIntervals[to.toLowerCase()] = setInterval(() => {
            if (activeOffers[to.toLowerCase()]) {
                sendPushNotification(to, pushPayload);
            } else {
                clearInterval(callIntervals[to.toLowerCase()]);
                delete callIntervals[to.toLowerCase()];
            }
        }, 8000);
    });

    // Request pending offer (when navigating from notification)
    socket.on('request-offer', (data) => {
        if (!socket.request.session || !socket.request.session.user) return;
        const email = socket.request.session.user.email.toLowerCase();
        if (activeOffers[email] && activeOffers[email].from === data.from) {
            socket.emit('video-offer', activeOffers[email]);
            
            // Stop sending push notifications because the user opened the app!
            if (callIntervals[email]) {
                clearInterval(callIntervals[email]);
                delete callIntervals[email];
            }
        }
    });

    // =========================
    // RINGING ACKNOWLEDGEMENT
    // =========================
    socket.on('ringing', (data) => {
        if (!socket.request.session || !socket.request.session.user) return;
        const email = socket.request.session.user.email.toLowerCase();
        
        // Stop sending push notifications because the user is already receiving the call in the app
        if (callIntervals[email]) {
            clearInterval(callIntervals[email]);
            delete callIntervals[email];
        }
    });

    // =========================
    // ANSWER CALL
    // =========================
    socket.on('make-answer', (data) => {
        const { to, answer } = data;
        if (socket.request.session.user) {
            const myEmail = socket.request.session.user.email.toLowerCase();
            
            const offerData = activeOffers[myEmail];
            if (offerData) {
                const SQL = "INSERT INTO call_history (caller_email, caller_name, receiver_email, call_type, status) VALUES (?, ?, ?, ?, 'completed')";
                database.query(SQL, [offerData.from, offerData.name, myEmail, offerData.type]);
                
                // Stop ringing on answer
                if (callIntervals[myEmail]) {
                    clearInterval(callIntervals[myEmail]);
                    delete callIntervals[myEmail];
                }
                delete activeOffers[myEmail];
            }

            io.to(to.toLowerCase()).emit('video-answer', {
                answer,
                from: myEmail
            });
            console.log(`✅ Call answered by ${myEmail}`);
        }
    });

    // =========================
    // ICE CANDIDATES
    // =========================
    socket.on('ice-candidate', (data) => {
        const { to, candidate } = data;
        if (socket.request.session.user) {
            io.to(to.toLowerCase()).emit('ice-candidate', {
                candidate,
                from: socket.request.session.user.email
            });
        }
    });

    // =========================
    // REJECT CALL
    // =========================
    socket.on('reject-call', (data) => {
        const { to } = data;
        if (socket.request.session.user) {
            const myEmail = socket.request.session.user.email.toLowerCase();
            
            const offerData = activeOffers[myEmail];
            if (offerData) {
                const SQL = "INSERT INTO call_history (caller_email, caller_name, receiver_email, call_type, status) VALUES (?, ?, ?, ?, 'rejected')";
                database.query(SQL, [offerData.from, offerData.name, myEmail, offerData.type]);
            }
            
            delete activeOffers[myEmail]; // Clear pending offer
            if (callIntervals[myEmail]) {
                clearInterval(callIntervals[myEmail]);
                delete callIntervals[myEmail];
            }
            
            io.to(to.toLowerCase()).emit('call-rejected', {
                from: myEmail,
                debug: "Socket reject-call event"
            });
            console.log(`❌ Call rejected by ${myEmail}`);
        }
    });

    // =========================
    // HANGUP CALL
    // =========================
    socket.on('hangup', (data) => {
        const { to } = data;
        if (socket.request.session.user) {
            const myEmail = socket.request.session.user.email.toLowerCase();
            const targetEmail = to.toLowerCase();
            
            // If the caller hung up before the receiver answered, log as missed
            const offerData = activeOffers[targetEmail];
            if (offerData && offerData.from === myEmail) {
                const SQL = "INSERT INTO call_history (caller_email, caller_name, receiver_email, call_type, status) VALUES (?, ?, ?, ?, 'missed')";
                database.query(SQL, [myEmail, socket.request.session.user.username, targetEmail, offerData.type]);
            }
            
            delete activeOffers[myEmail];
            delete activeOffers[targetEmail]; // Also clean up offer
        }
        if (callIntervals[socket.request.session.user.email.toLowerCase()]) {
            clearInterval(callIntervals[socket.request.session.user.email.toLowerCase()]);
            delete callIntervals[socket.request.session.user.email.toLowerCase()];
        }
        if (callIntervals[to.toLowerCase()]) {
            clearInterval(callIntervals[to.toLowerCase()]);
            delete callIntervals[to.toLowerCase()];
        }
        io.to(to.toLowerCase()).emit('video-hangup');
        console.log(`📴 Call ended`);
    });

    // =========================
    // DISCONNECT
    // =========================
    socket.on('disconnect', () => {
        if (socket.request.session && socket.request.session.user) {
            const email = socket.request.session.user.email.toLowerCase();

            delete userSockets[email];

            console.log(`👤 User ${email} disconnected`);
        } else {
            console.log(`👤 Guest disconnected: ${socket.id}`);
        }
    });

});

// 🔥 Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is LIVE and running on port ${PORT}`);
});
