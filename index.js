const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const path = require('path');
// const http = require("http");
const mysql2 = require('mysql2');
const app = express();
// const server = http.createServer(app);

// your PWA / service worker code
// app.use(express.static("public"));

// app.use(express.json());

const database = mysql2.createConnection({
    host: process.env.HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.USERNAME || process.env.DB_USER || "root",
    password: process.env.PASSWORD || process.env.DB_PASSWORD || "Sanket@123",
    database: process.env.DB_NAME || "test",
    port: process.env.PORT || process.env.DB_PORT || 3306,
    ssl: (process.env.HOST || process.env.DB_HOST) ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    } : false
});

database.connect((error) => {
    if (error) {
        console.error("❌ Database connection failed:", error);
        return;
    }
    console.log("✅ MySQL database is connected...");
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
        const SQL_COMMAND = "INSERT INTO users(UserName, Passwords, email_id ) VALUES (?, ?, ?)";
        database.query(SQL_COMMAND, [UserName, Passwords, email_id], (err, result) => {
            if (err) {
                console.error(err);
                return res.redirect("login_error.html");
            }
            console.log(result);
            res.redirect("homepage.html");
        });
    } catch (err) {
        console.error(err);
        res.redirect("login_error.html");
    }
});
// ✅ Login handler
app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'Login.html'));
});

// app.get('/', (req, res) => {
//     res.redirect('/login');
// });

app.post('/Login', (req, res) => {
    const { email_id, Passwords } = req.body;
    const SQL_COMMAND = "SELECT * FROM users WHERE email_id = ? AND Passwords = ?";
    database.query(SQL_COMMAND, [email_id, Passwords], (err, results) => {
        if (err) {
            console.error(err);
            return res.send("Login error");
        }
        if (results.length > 0) {
            res.redirect("/homepage.html");
        } else {
            res.redirect("login_error.html");
        }
    });
});
// ✅ HomePage handler
app.use(express.static(path.join(__dirname, 'public')));

// ✅ API to Search Users from MySQL Database
app.get('/api/users', (req, res) => {
    const searchQuery = req.query.q || '';
    
    // Search the database for any user whose name matches the search text
    const SQL_COMMAND = "SELECT UserName, email_id FROM users WHERE UserName LIKE ?";
    database.query(SQL_COMMAND, [`%${searchQuery}%`], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database search failed" });
        }
        // Send back the matching users as JSON
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

    // Chat message event
    socket.on('chat message', (msg) => {
        io.emit('chat message', {
            text: msg.text,
            username: msg.username,
            timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// 🔥 Start server with Automatic Port Switching
let PORT = process.env.PORT || 3001;

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`⚠️  Port ${PORT} is already in use! Automatically trying port ${PORT + 1}...`);
        PORT++; // Increment port
        setTimeout(() => {
            server.close();
            server.listen(PORT, '0.0.0.0');
        }, 100);
    } else {
        console.error("Server error:", e);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running securely on http://localhost:${PORT}`);
    console.log(`   (If you open multiple terminals, it will automatically switch to a new port!)`);
});
