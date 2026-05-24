# Project Synopsis: Real-Time Chat Application

## 💬 Project Overview
A **Real-Time Chat and Calling Application** with Progressive Web App (PWA) capabilities. It is designed to allow users to communicate instantly through text, audio, and video, complete with a friend management system and background push notifications. 

## 🛠️ Technology Stack
*   **Backend:** Node.js with Express.js
*   **Real-time Communication:** 
    *   `Socket.IO` for live chat messaging and WebRTC signaling.
    *   `WebRTC` for peer-to-peer audio and video calls.
*   **Database:** MySQL (accessed via the `mysql2` connection pool)
*   **Session Management:** `express-session` combined with `session-file-store` for persistent user sessions on the server.
*   **Frontend:** Vanilla HTML5, CSS3, and JavaScript, served statically.
*   **PWA & Notifications:** Service Workers (`sw.js`), Web App Manifest (`manifest.json`), and the `web-push` library for sending system-level push notifications.

## 🚀 Core Features

### 1. Authentication & User Management
*   Users can sign up, log in, log out, and reset their passwords. 
*   User sessions are securely managed and stored on the server's filesystem.

### 2. Friend System
*   Users can search for other registered users.
*   Send, accept, and manage friend requests.
*   Ability to remove friends and keep a log of removed friends to restore them later.

### 3. Real-Time Text Chat
*   Users can send instant text messages in dedicated private rooms.
*   Chat history is stored in the MySQL database and loaded dynamically when a user opens a chat.
*   Supports multimedia message detection (images, audio, file attachments).

### 4. Audio & Video Calling (WebRTC)
*   Peer-to-peer direct audio and video calls.
*   Call history tracking (missed, rejected, completed).
*   A robust ringing system that continuously notifies the receiver until the call is answered or rejected.

### 5. Progressive Web App (PWA) & Push Notifications
*   The app can be installed on devices like a native app.
*   Even when the app is closed or in the background, users receive Push Notifications for new messages and incoming calls.
*   Users can interact with notifications (e.g., rejecting an incoming call directly from the notification tray).

## 📂 Directory Structure Highlights
*   **/index.js**: The core server file handling Express routes, database initialization, API endpoints, and complex Socket.IO event listeners.
*   **/views/**: Contains the HTML templates for the authentication flow (Login, Signup, Forgot Password, Error pages).
*   **/public/**: Contains the main application interface (`homepage.html`, `Chats.html`, `personal_chat.html`), CSS styling (`style.css`), client-side JavaScript (`notifications.js`), and the Service Worker (`sw.js`).
*   **/sessions/**: Automatically generated folder storing active user session files.
