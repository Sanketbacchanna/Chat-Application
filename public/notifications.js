function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function subscribeUserToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            const publicVapidKey = 'BNFk2xYscFbIl9RUG74PoTlxwkJPw8XoBuWnCQan0P5_yMlKQ6FhA4Dtn0uaEta8RyOthkCraoiOvgN2GDCtHgo';
            const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });
        }
        await fetch('/api/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        console.error('Push Subscription failed:', e);
    }
}

function initNotifications() {
    if ("Notification" in window) {
        if (Notification.permission === "default") {
            setTimeout(() => {
                try { 
                    Notification.requestPermission().then(permission => {
                        if (permission === "granted") subscribeUserToPush();
                    }); 
                } catch(e) {}
            }, 1000);
        } else if (Notification.permission === "granted") {
            subscribeUserToPush();
        }
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
                icon: '/icons/icon-192.png',
                silent: true
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
        const audio = new Audio(getSavedMessageSound());
        audio.play().catch(e => console.warn('Audio play blocked', e));
    } catch(e) {}
}

let incomingCallRing = null;

// Sound options
const RINGTONES = {
    'iphone': '/sounds/iphone.mp3',
    'classic': '/sounds/classic.mp3',
    'modern': '/sounds/modern.mp3'
};

const MESSAGE_SOUNDS = {
    'beep': '/sounds/beep.mp3',
    'pop': '/sounds/pop.mp3',
    'bell': '/sounds/bell.mp3'
};

function getSavedRingtone() {
    const saved = localStorage.getItem('cwm_ringtone');
    return RINGTONES[saved] || RINGTONES['iphone'];
}

function getSavedMessageSound() {
    const saved = localStorage.getItem('cwm_message_sound');
    return MESSAGE_SOUNDS[saved] || MESSAGE_SOUNDS['beep'];
}

function injectSettingsModal() {
    // Add button to dropdown menu if exists
    const dropdownMenu = document.getElementById('dropdownMenu');
    if (dropdownMenu && !document.getElementById('openSettingsBtn')) {
        const btn = document.createElement('a');
        btn.id = 'openSettingsBtn';
        btn.href = '#';
        btn.innerHTML = '⚙️ Settings';
        btn.onclick = (e) => {
            e.preventDefault();
            const menu = document.getElementById('dropdownMenu');
            if (menu) menu.style.display = 'none';
            window.openSettingsModal();
        };
        
        // Insert before Logout
        const hr = dropdownMenu.querySelector('hr');
        if (hr) {
            dropdownMenu.insertBefore(btn, hr);
        } else {
            dropdownMenu.appendChild(btn);
        }
    }

    // Create Modal if not exists
    if (document.getElementById('cwmSettingsModal')) return;

    const modalHTML = `
        <div id="cwmSettingsModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:999999; justify-content:center; align-items:center;">
            <div style="background:white; padding:25px; border-radius:20px; width:90%; max-width:400px; box-shadow:0 15px 30px rgba(0,0,0,0.2); font-family:'Poppins',sans-serif;">
                <h3 style="margin-top:0; color:#2d3436; font-size:20px; font-weight:700;">Sound Settings</h3>
                
                <div style="margin-bottom:20px;">
                    <label style="display:block; font-size:14px; color:#636e72; font-weight:600; margin-bottom:8px;">Incoming Call Ringtone</label>
                    <div style="display:flex; gap:10px;">
                        <select id="cwmRingtoneSelect" style="flex:1; padding:10px; border-radius:10px; border:1px solid #edf2f7; font-family:inherit;">
                            <option value="iphone">iPhone (Default)</option>
                            <option value="classic">Classic Ring</option>
                            <option value="modern">Modern Synth</option>
                        </select>
                        <button onclick="testSound('ringtone')" style="padding:10px 15px; background:#6c5ce7; color:white; border:none; border-radius:10px; cursor:pointer;">▶️ Test</button>
                    </div>
                </div>

                <div style="margin-bottom:25px;">
                    <label style="display:block; font-size:14px; color:#636e72; font-weight:600; margin-bottom:8px;">Message Notification Sound</label>
                    <div style="display:flex; gap:10px;">
                        <select id="cwmMessageSoundSelect" style="flex:1; padding:10px; border-radius:10px; border:1px solid #edf2f7; font-family:inherit;">
                            <option value="beep">Short Beep (Default)</option>
                            <option value="pop">Water Pop</option>
                            <option value="bell">Bell</option>
                        </select>
                        <button onclick="testSound('message')" style="padding:10px 15px; background:#00b894; color:white; border:none; border-radius:10px; cursor:pointer;">▶️ Test</button>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:12px;">
                    <button onclick="closeSettingsModal()" style="padding:10px 20px; background:#f7fafc; color:#2d3436; border:1px solid #edf2f7; border-radius:10px; cursor:pointer; font-weight:600;">Cancel</button>
                    <button onclick="saveSettings()" style="padding:10px 20px; background:#6c5ce7; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:600;">Save Settings</button>
                </div>
            </div>
        </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
}

window.openSettingsModal = function() {
    const modal = document.getElementById('cwmSettingsModal');
    if (modal) {
        // Load current
        const r = localStorage.getItem('cwm_ringtone') || 'iphone';
        const m = localStorage.getItem('cwm_message_sound') || 'beep';
        document.getElementById('cwmRingtoneSelect').value = r;
        document.getElementById('cwmMessageSoundSelect').value = m;
        modal.style.display = 'flex';
    }
}

window.closeSettingsModal = function() {
    const modal = document.getElementById('cwmSettingsModal');
    if (modal) modal.style.display = 'none';
    if (window.testAudioNode) {
        window.testAudioNode.pause();
        window.testAudioNode = null;
    }
}

window.testSound = function(type) {
    if (window.testAudioNode) {
        window.testAudioNode.pause();
    }
    
    let url;
    if (type === 'ringtone') {
        const val = document.getElementById('cwmRingtoneSelect').value;
        url = RINGTONES[val] || RINGTONES['iphone'];
    } else {
        const val = document.getElementById('cwmMessageSoundSelect').value;
        url = MESSAGE_SOUNDS[val] || MESSAGE_SOUNDS['beep'];
    }
    
    window.testAudioNode = new Audio(url);
    window.testAudioNode.play().catch(e => console.error(e));
}

window.saveSettings = function() {
    const r = document.getElementById('cwmRingtoneSelect').value;
    const m = document.getElementById('cwmMessageSoundSelect').value;
    localStorage.setItem('cwm_ringtone', r);
    localStorage.setItem('cwm_message_sound', m);
    
    // Update incomingCallRing if exists
    if (incomingCallRing) {
        incomingCallRing = new Audio(getSavedRingtone());
        incomingCallRing.loop = true;
    }
    
    closeSettingsModal();
    alert("Settings saved successfully!");
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
                if (!incomingCallRing) {
                    incomingCallRing = new Audio(getSavedRingtone());
                    incomingCallRing.loop = true;
                }
                incomingCallRing.currentTime = 0;
                incomingCallRing.play().catch(e => console.warn('Audio play blocked', e));
                
                // Also vibrate the device if supported
                if (navigator.vibrate) {
                    navigator.vibrate([500, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000]);
                }
            } catch(e) {}

            const acceptUrl = `personal_chat.html?user=${encodeURIComponent(data.name)}&email=${encodeURIComponent(data.from)}&acceptCall=true`;
            
            showOSNotification(`Incoming Call from ${data.name}`, `Click to answer`, acceptUrl);
            
            showInAppNotification(
                `Incoming Call`, 
                `${data.name} is calling you...`, 
                'call', 
                null, 
                () => { // Accept
                    if (incomingCallRing) { incomingCallRing.pause(); incomingCallRing.currentTime = 0; }
                    if (navigator.vibrate) navigator.vibrate(0); // Stop vibrating
                    window.location.href = acceptUrl;
                }, 
                () => { // Reject
                    if (incomingCallRing) { incomingCallRing.pause(); incomingCallRing.currentTime = 0; }
                    if (navigator.vibrate) navigator.vibrate(0);
                    currentSocket.emit('reject-call', { to: data.from });
                },
                data.name.charAt(0).toUpperCase()
            );
        });

        currentSocket.on('video-hangup', () => {
            if (incomingCallRing) {
                incomingCallRing.pause();
                incomingCallRing.currentTime = 0;
            }
            if (navigator.vibrate) navigator.vibrate(0);
            
            const toasts = document.querySelectorAll('.cwm-toast');
            toasts.forEach(toast => {
                if (toast.innerHTML.includes('Incoming Call')) {
                    closeToast(toast);
                }
            });
        });
        
        currentSocket.on('call-rejected', () => {
            if (incomingCallRing) {
                incomingCallRing.pause();
                incomingCallRing.currentTime = 0;
            }
            if (navigator.vibrate) navigator.vibrate(0);
        });
    }
}, 500);

// Initialize settings modal
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSettingsModal);
} else {
    injectSettingsModal();
}
