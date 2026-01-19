const express = require('express');
const path = require('path');
const http = require("http");
const mysql2 = require('mysql2');
const app = express();
const server = http.createServer(app);

// your PWA / service worker code
app.use(express.static("public"));

app.use(express.json());

const database = mysql2.createConnection({
    host: "127.0.0.1",
    user: "root",
    password: "Sanket@123",
    database: "firstproject"
});

database.connect((error) => {
    if (error) {
        return console.log(error);
    }
    console.log("MySQL database is connected...");
});
// Sign-up handler
app.use(express.static(path.join(__dirname, 'public')));

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
                return res.send("Registration unsuccessful");
            }
            console.log(result);
            res.redirect("homepage.html");
        });
    } catch (err) {
        console.error(err);
        res.send("Registration unsuccessful");
    }
});
// ✅ Login handler
app.use(express.static(path.join(__dirname, 'public')));

// app.get('/login', (req, res) => {
//     res.sendFile(path.join(__dirname, 'views', 'Login.html'));
// });

app.get('/', (req, res) => {
    res.redirect('/login');
});

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
            res.send("Invalid email or password");
        }
    });
});
// ✅ HomePage handler
app.use(express.static(path.join(__dirname, 'public')));

app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'homepage.html'));
});

app.post('/search', (req, res) => {

    if (results.length > 0) {
        res.redirect("/Chats.html");
    }
});

// login signup
app.use(express.static(path.join(__dirname, 'views')));

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', (req, res) => {

    if (results.length > 0) {
        res.redirect("/signup.html");
    }
});



// signup login

app.use(express.static(path.join(__dirname, 'views')));

app.get('/handleform', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

app.post('/handleform', (req, res) => {

    if (results.length > 0) {
        res.redirect("/signup.html");
    }
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

// homepage 

// app.use(express.static(path.join(__dirname, 'public')));

// app.use(express.urlencoded({ extended: true }));

// app.get('/homepage', (req, res) => {
//     const htmlfile = path.join(__dirname, 'views', 'homepage.html');
//     res.sendFile(htmlfile);
// });

// app.post('/friends', (req, res) => {
//     try {
//         const { name, image_url, profile_link} = req.body;
//         const SQL_COMMAND = "INSERT INTO friends(name, image_url, profile_link) VALUES (?, ?, ?)";
//         database.query(SQL_COMMAND, [name, image_url, profile_link], (err, result) => {
//             if (err) {
//                 console.error(err);
//                 return res.send("Registration unsuccessful");
//             }
//             console.log(result);
//             res.redirect("Chats.html");
//         });
//     } catch (err) {
//         console.error(err);
//         res.send("Registration unsuccessful");
//     }
// });

// old one

app.listen(3001, () => {
    console.log('Server is running on port 3001');
});

//new one
// const server = http.createServer(app);
// const io = new Server(server);

// server.listen(3000, () => {
//   console.log("Server running on http://localhost:3000");
// });
// using socket.io
// io.on("connection", (socket) => {
//   console.log("User connected:", socket.id);

//   socket.on("sendMessage", (data) => {
//     // data = { sender, message }
//     socket.broadcast.emit("receiveMessage", data);
//   });

//   socket.on("disconnect", () => {
//     console.log("User disconnected:", socket.id);
//   });
// });



