function initNotifications() {
    if ("Notification" in window && Notification.permission === "default") {
        // Note: Modern browsers require user interaction for this to succeed, 
        // but keeping it as a fallback.
        setTimeout(() => {
            try { Notification.requestPermission(); } catch(e) {}
        }, 1000);
    }
    injectStyles();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotifications);
} else {
    initNotifications();
}

function injectStyles() {
    if (document.getElementById('cwm-notify-styles')) return;
    const style = document.createElement('style');
    style.id = 'cwm-notify-styles';
    style.textContent = `
        .cwm-notification-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        }
        .cwm-toast {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-left: 4px solid #6c5ce7;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 15px;
            transform: translateX(120%);
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: auto;
            cursor: pointer;
            min-width: 280px;
            max-width: 350px;
        }
        .cwm-toast.show {
            transform: translateX(0);
        }
        .cwm-toast-icon {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #6c5ce7;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px;
            flex-shrink: 0;
        }
        .cwm-toast-content {
            flex-grow: 1;
        }
        .cwm-toast-title {
            font-weight: 600;
            color: #2d3436;
            margin: 0 0 4px 0;
            font-size: 15px;
            font-family: 'Poppins', sans-serif;
        }
        .cwm-toast-body {
            color: #636e72;
            margin: 0;
            font-size: 13px;
            font-family: 'Poppins', sans-serif;
        }
        .cwm-toast-actions {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }
        .cwm-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
        }
        .cwm-btn-accept { background: #00b894; color: white; }
        .cwm-btn-reject { background: #ff7675; color: white; }
    `;
    document.head.appendChild(style);
    
    const container = document.createElement('div');
    container.id = 'cwm-notification-container';
    container.className = 'cwm-notification-container';
    document.body.appendChild(container);
}

function showInAppNotification(title, body, type, onClickUrl, onAccept, onReject, avatarChar) {
    const container = document.getElementById('cwm-notification-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'cwm-toast';
    
    let actionsHtml = '';
    if (type === 'call') {
        toast.style.borderLeftColor = '#00b894';
        actionsHtml = `
            <div class="cwm-toast-actions">
                <button class="cwm-btn cwm-btn-accept" id="cwm-accept-${Date.now()}">Answer</button>
                <button class="cwm-btn cwm-btn-reject" id="cwm-reject-${Date.now()}">Decline</button>
            </div>
        `;
    }

    toast.innerHTML = `
        <div class="cwm-toast-icon" style="background: ${type === 'call' ? '#00b894' : '#6c5ce7'}">${avatarChar || '!'}</div>
        <div class="cwm-toast-content">
            <h4 class="cwm-toast-title">${title}</h4>
            <p class="cwm-toast-body">${body}</p>
            ${actionsHtml}
        </div>
    `;

    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    if (type === 'call') {
        // Stop it from navigating on click anywhere if it's a call
        const acceptBtn = toast.querySelector('.cwm-btn-accept');
        const rejectBtn = toast.querySelector('.cwm-btn-reject');
        
        acceptBtn.onclick = (e) => {
            e.stopPropagation();
            if (onAccept) onAccept();
            closeToast(toast);
        };
        rejectBtn.onclick = (e) => {
            e.stopPropagation();
            if (onReject) onReject();
            closeToast(toast);
        };
    } else {
        // Message notification click
        toast.onclick = () => {
            if (onClickUrl) window.location.href = onClickUrl;
            closeToast(toast);
        };
        // Auto remove message after 5s
        setTimeout(() => closeToast(toast), 5000);
    }
}

function closeToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
}

function showOSNotification(title, body, onClickUrl) {
    if ("Notification" in window && Notification.permission === "granted") {
        try {
            const notif = new Notification(title, {
                body: body,
                icon: '/icons/icon-192.png'
            });
            if (onClickUrl) {
                notif.onclick = function(event) {
                    event.preventDefault();
                    window.location.href = onClickUrl;
                    notif.close();
                };
            }
        } catch(e) {
            // Fails on some mobile browsers, which is why we have in-app notifications
        }
    }
}

function playMessageSound() {
    try {
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audio.play().catch(e => console.warn('Audio play blocked', e));
    } catch(e) {}
}

const socketCheckInterval = setInterval(() => {
    // Use window.socket to avoid Temporal Dead Zone issues with 'const socket'
    const currentSocket = window.socket || (typeof socket !== 'undefined' ? socket : null);
    
    if (currentSocket) {
        clearInterval(socketCheckInterval);
        
        currentSocket.on('push notification', data => {
            if (data.type === 'message') {
                const urlParams = new URLSearchParams(window.location.search);
                const currentContactEmail = urlParams.get('email');
                
                // If we are actively chatting with them, do nothing
                if (window.location.pathname.includes('personal_chat.html') && currentContactEmail === data.fromEmail) {
                    return;
                }
                
                playMessageSound();
                
                let msgText = data.text;
                if (msgText.includes('<img')) msgText = '📷 Image';
                else if (msgText.includes('<audio')) msgText = '🎤 Voice Message';
                else if (msgText.includes('<a href')) msgText = '📎 Attachment';
                
                const clickUrl = `personal_chat.html?user=${encodeURIComponent(data.fromName)}&email=${encodeURIComponent(data.fromEmail)}`;
                
                // Show both OS and In-App
                showOSNotification(`Message from ${data.fromName}`, msgText, clickUrl);
                showInAppNotification(data.fromName, msgText, 'message', clickUrl, null, null, data.fromName.charAt(0).toUpperCase());
            }
        });

        // Listen for incoming calls on ALL pages except personal_chat.html (which handles it internally)
        currentSocket.on('video-offer', data => {
            if (window.location.pathname.includes('personal_chat.html')) return; // handled by personal_chat.html modal
            
            try {
                const audio = new Audio('https://www.zedge.net/ringtones/b320a15f-455f-38ab-88e1-06bda9564584');
                audio.play().catch(e => console.warn('Audio play blocked', e));
            } catch(e) {}

            const acceptUrl = `personal_chat.html?user=${encodeURIComponent(data.name)}&email=${encodeURIComponent(data.from)}&acceptCall=true`;
            
            showOSNotification(`Incoming Call from ${data.name}`, `Click to answer`, acceptUrl);
            
            showInAppNotification(
                `Incoming Call`, 
                `${data.name} is calling you...`, 
                'call', 
                null, 
                () => { // Accept
                    window.location.href = acceptUrl;
                }, 
                () => { // Reject
                    currentSocket.emit('reject-call', { to: data.from });
                },
                data.name.charAt(0).toUpperCase()
            );
        });
    }
}, 500);
