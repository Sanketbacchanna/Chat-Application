document.addEventListener('DOMContentLoaded', () => {
    // Request notification permission if not already granted
    if ("Notification" in window && Notification.permission === "default") {
        // We delay slightly so it doesn't block the UI immediately
        setTimeout(() => Notification.requestPermission(), 1000);
    }
});

function showOSNotification(title, body, onClickUrl) {
    if ("Notification" in window && Notification.permission === "granted") {
        const notif = new Notification(title, {
            body: body,
            icon: '/icons/icon-192.png'
        });
        
        if (onClickUrl) {
            notif.onclick = function(event) {
                event.preventDefault(); // prevent the browser from focusing the Notification's tab
                window.location.href = onClickUrl;
                notif.close();
            };
        }
    }
}

function playMessageSound() {
    try {
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audio.play().catch(e => console.warn('Audio play blocked', e));
    } catch(e) {}
}

// We wrap the socket listener attachment in an interval to ensure socket is loaded
const socketCheckInterval = setInterval(() => {
    if (typeof socket !== 'undefined') {
        clearInterval(socketCheckInterval);
        
        // Listen for new messages
        socket.on('push notification', data => {
            if (data.type === 'message') {
                // Check if we are already in the chat room with this user
                const urlParams = new URLSearchParams(window.location.search);
                const currentContactEmail = urlParams.get('email');
                
                // If we are already in the chat with this user, don't show the OS notification
                if (window.location.pathname.includes('personal_chat.html') && currentContactEmail === data.fromEmail) {
                    return;
                }
                
                // Show custom UI toast if available
                if (typeof showNotification === 'function') {
                    showNotification(`New message from ${data.fromName}`);
                }
                
                playMessageSound();
                
                let msgText = data.text;
                if (msgText.includes('<img')) msgText = '📷 Image';
                else if (msgText.includes('<audio')) msgText = '🎤 Voice Message';
                else if (msgText.includes('<a href')) msgText = '📎 Attachment';
                
                showOSNotification(
                    `Message from ${data.fromName}`, 
                    msgText,
                    `personal_chat.html?user=${encodeURIComponent(data.fromName)}&email=${encodeURIComponent(data.fromEmail)}`
                );
            }
        });

        // Listen for incoming calls for OS level notification
        socket.on('video-offer', data => {
            showOSNotification(
                `Incoming Call from ${data.name}`, 
                `Click to answer`,
                `personal_chat.html?user=${encodeURIComponent(data.name)}&email=${encodeURIComponent(data.from)}&acceptCall=true`
            );
        });
    }
}, 500);
