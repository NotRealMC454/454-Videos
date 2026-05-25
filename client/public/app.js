const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23a1a1aa"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

// --- GLOBAL AUTH & NAVIGATION ---
function checkAuth() {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
        const navLogin = document.getElementById('nav-login');
        const navUpload = document.getElementById('nav-upload');
        const navUser = document.getElementById('nav-user');
        const badge = document.getElementById('display-user');
        const avatar = document.getElementById('nav-avatar');

        if (navLogin) navLogin.classList.add('hidden');
        if (navUpload) navUpload.classList.remove('hidden');
        if (navUser) navUser.classList.remove('hidden');
        
        if (badge) {
            badge.innerText = currentUser;
            if (badge.tagName === 'A') badge.href = `/account`;
        }

        fetch(`/api/users/${currentUser}`).then(r=>r.json()).then(data => {
            if(data.success && avatar) avatar.src = data.avatar || DEFAULT_AVATAR;
        });
    }
}

// --- SIDEBAR LOGIC ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if(sidebar) sidebar.classList.toggle('collapsed');
}

async function loadSidebar() {
    const currentUser = localStorage.getItem('currentUser');
    const subsList = document.getElementById('subscriptions-list');
    if(!subsList || !currentUser) return;

    try {
        const res = await fetch(`/api/users/${currentUser}`);
        const data = await res.json();
        if(data.success && data.subscribedTo.length > 0) {
            subsList.innerHTML = '';
            for (const sub of data.subscribedTo) {
                const subRes = await fetch(`/api/users/${sub}`);
                const subData = await subRes.json();
                const icon = subData.success && subData.avatar ? subData.avatar : DEFAULT_AVATAR;
                
                subsList.innerHTML += `
                    <a href="/channel?user=${sub}" class="sub-item">
                        <img src="${icon}" class="avatar-icon" style="width:30px; height:30px;" alt="">
                        <span style="font-weight:bold; font-size:0.95rem;">${sub}</span>
                    </a>
                `;
            }
        } else {
            subsList.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem; padding: 0 15px;">No subscriptions yet.</p>`;
        }
    } catch (e) { console.error("Sidebar load error", e); }
}

async function signup() {
    try {
        const userBox = document.getElementById('username');
        const passBox = document.getElementById('password');
        if (!userBox || !passBox) return;
        const user = userBox.value.trim(), pass = passBox.value; 
        if(!user || !pass) return alert("Please enter a valid username and password.");
        
        const res = await fetch('/api/signup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        
        if (data.success) { localStorage.setItem('currentUser', data.username); window.location.href = "/"; } 
        else alert("Signup Failed: " + data.message);
    } catch (error) { console.error("Signup Error:", error); }
}

async function login() {
    try {
        const userBox = document.getElementById('username');
        const passBox = document.getElementById('password');
        if (!userBox || !passBox) return;
        const user = userBox.value.trim(), pass = passBox.value; 
        if(!user || !pass) return alert("Please enter your username and password.");

        const res = await fetch('/api/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        
        if (data.success) { localStorage.setItem('currentUser', data.username); window.location.href = "/"; } 
        else alert("Login Failed: " + data.message);
    } catch (error) { console.error("Login Error:", error); }
}

function logout() { localStorage.removeItem('currentUser'); window.location.href = "/"; }

// --- ACCOUNT SETTINGS ---
async function promptPasswordChange() {
    try {
        const oldPassword = prompt("Enter your CURRENT password:");
        if (!oldPassword) return;
        const newPassword = prompt("Enter your NEW password:");
        if (!newPassword) return;

        const res = await fetch('/api/users/password', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: localStorage.getItem('currentUser'), oldPassword, newPassword })
        });
        const data = await res.json(); alert(data.message);
    } catch (error) { console.error("Password Update Error:", error); }
}

async function uploadAvatar() {
    const fileBox = document.getElementById('avatar-file');
    if (!fileBox || !fileBox.files[0]) return alert("Please select an image first.");
    const formData = new FormData();
    formData.append('username', localStorage.getItem('currentUser'));
    formData.append('avatar', fileBox.files[0]);

    try {
        const res = await fetch('/api/users/avatar', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) { alert("Avatar updated!"); window.location.reload(); }
        else alert("Upload failed. Make sure the file is under 5MB.");
    } catch (e) { alert("Network error. File might be too large."); }
}

// --- CHUNKED UPLOAD LOGIC ---
async function uploadVideo() {
    const currentUser = localStorage.getItem('currentUser');
    const titleBox = document.getElementById('video-title');
    const descBox = document.getElementById('video-desc');
    const fileBox = document.getElementById('video-file');
    if (!titleBox || !fileBox) return;

    const title = titleBox.value;
    const desc = descBox ? descBox.value : "";
    const file = fileBox.files[0];
    if (!title || !file) return alert("Provide a title and a file.");

    document.getElementById('progress-container').classList.remove('hidden');
    const progressBar = document.getElementById('upload-progress');
    const percentText = document.getElementById('upload-percent');
    const etaText = document.getElementById('upload-eta');
    
    const chunkSize = 10 * 1024 * 1024; 
    const totalChunks = Math.ceil(file.size / chunkSize);
    const taskId = Date.now().toString();
    const startTime = Date.now();
    let uploadedBytesBase = 0;

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunk = file.slice(start, end);
        
        const formData = new FormData();
        formData.append('username', currentUser);
        formData.append('title', title);
        formData.append('description', desc);
        formData.append('taskId', taskId);
        formData.append('chunkIndex', i);
        formData.append('totalChunks', totalChunks);
        formData.append('video', chunk);

        try {
            await sendChunkWithProgress(formData, uploadedBytesBase, file.size, startTime, progressBar, percentText, etaText);
            uploadedBytesBase += chunk.size;
        } catch (err) {
            etaText.innerText = "Network error during upload. Please check your connection.";
            return;
        }
    }
    
    etaText.innerText = "Upload Complete. Generating Thumbnail...";
    startProcessingPoller(taskId);
}

function sendChunkWithProgress(formData, uploadedBytesBase, totalSize, startTime, progressBar, percentText, etaText) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                const currentTotalUploaded = uploadedBytesBase + e.loaded;
                const percent = (currentTotalUploaded / totalSize) * 100;
                progressBar.value = percent;
                percentText.innerText = `${Math.round(percent)}%`;

                const timeElapsed = (Date.now() - startTime) / 1000; 
                const uploadSpeed = currentTotalUploaded / timeElapsed; 
                const remainingBytes = totalSize - currentTotalUploaded;
                const remainingSeconds = remainingBytes / uploadSpeed;

                if (remainingSeconds > 0 && Number.isFinite(remainingSeconds) && percent < 100) {
                    etaText.innerText = `Network ETA: ${remainingSeconds > 60 ? Math.floor(remainingSeconds/60)+'m ' : ''}${Math.floor(remainingSeconds%60)}s`;
                }
            }
        });

        xhr.onload = function() {
            if (xhr.status === 200) resolve();
            else reject(new Error("Chunk upload failed"));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/upload");
        xhr.send(formData);
    });
}

function startProcessingPoller(taskId) {
    const progressBar = document.getElementById('upload-progress');
    const percentText = document.getElementById('upload-percent');
    const etaText = document.getElementById('upload-eta');
    progressBar.removeAttribute('value');

    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/upload/status/${taskId}`);
            const data = await res.json();

            if (data.status === 'processing') {
                progressBar.value = data.percent;
                percentText.innerText = `${data.percent}%`;
                etaText.innerText = "Compressing & Optimizing...";
            } else if (data.status === 'done') {
                clearInterval(interval);
                progressBar.value = 100;
                percentText.innerText = `100%`;
                etaText.innerText = "Published! Redirecting to Home...";
                setTimeout(() => window.location.href = "/", 1500);
            } else if (data.status === 'error') {
                clearInterval(interval);
                etaText.innerText = "Error during compression.";
            }
        } catch (e) {}
    }, 1000);
}

// --- FEED, SEARCH & CHANNEL ---
function renderVideoGrid(videos, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ''; 
    if(videos.length === 0) return container.innerHTML = "<p style='color:#aaa;'>No videos found.</p>";

    videos.reverse().forEach(video => {
        const mediaElement = video.thumbnailUrl 
            ? `<img src="${video.thumbnailUrl}" class="video-thumbnail" alt="Thumbnail">`
            : `<video src="${video.url}#t=1" class="video-thumbnail" preload="metadata"></video>`;
        
        const views = video.views || 0;

        container.innerHTML += `
            <a href="/video?id=${video.id}" class="video-card-link">
                ${mediaElement}
                <div class="video-info">
                    <div class="video-title">${video.title}</div>
                    <div class="video-uploader">${video.uploader}</div>
                    <div class="video-views">${views} views</div>
                </div>
            </a>
        `;
    });
}

async function loadVideos() {
    try {
        const res = await fetch('/api/videos');
        const videos = await res.json();
        renderVideoGrid(videos, 'videos-container');
    } catch (error) { console.error("Failed to load videos:", error); }
}

async function loadTopVideos() {
    try {
        const res = await fetch('/api/videos/top');
        const videos = await res.json();
        const container = document.getElementById('top-videos-container');
        if (container) {
            renderVideoGrid(videos.reverse(), 'top-videos-container');
        }
    } catch (e) { console.error(e); }
}

async function executeSearch() {
    try {
        const searchBox = document.getElementById('search-input');
        if (!searchBox) return;
        const query = searchBox.value;
        if (!query.trim()) return;

        const topSection = document.getElementById('top-videos-section');
        if(topSection) topSection.classList.add('hidden');

        const resVideos = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const videos = await resVideos.json();
        
        const resChannels = await fetch(`/api/channels/search?q=${encodeURIComponent(query)}`);
        const channels = await resChannels.json();

        const cContainer = document.getElementById('channels-container');
        const cHeading = document.getElementById('channels-heading');
        if (cContainer && cHeading) {
            if (channels.length > 0) {
                cHeading.classList.remove('hidden');
                cContainer.innerHTML = channels.map(c => `
                    <a href="/channel?user=${c.username}" class="channel-card">
                        <img src="${c.avatar || DEFAULT_AVATAR}" class="avatar-icon" style="width:50px; height:50px;">
                        <div class="channel-card-name">${c.username}</div>
                    </a>
                `).join('');
            } else { cHeading.classList.add('hidden'); cContainer.innerHTML = ''; }
        }

        const vHeading = document.getElementById('videos-heading');
        if (vHeading) vHeading.classList.remove('hidden');
        renderVideoGrid(videos, 'videos-container');

    } catch (error) { console.error("Search failed:", error); }
}

let loadedChannelUser = null;
async function loadChannel() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        loadedChannelUser = urlParams.get('user'); 
        if (!loadedChannelUser) return window.location.href = "/";
        const currentUser = localStorage.getItem('currentUser');

        document.getElementById('channel-name').innerText = `${loadedChannelUser}`;
        
        const r = await fetch(`/api/users/${loadedChannelUser}`);
        const data = await r.json();
        if(data.success) {
            document.getElementById('channel-avatar').src = data.avatar || DEFAULT_AVATAR;
            document.getElementById('channel-subs').innerText = data.subscribers.length;
            
            const subBtn = document.getElementById('subscribe-btn');
            if (currentUser && currentUser !== loadedChannelUser) {
                subBtn.classList.remove('hidden');
                if (data.subscribers.includes(currentUser)) {
                    subBtn.innerText = "Unsubscribe";
                    subBtn.classList.add('secondary-btn');
                    subBtn.classList.remove('primary-btn');
                } else {
                    subBtn.innerText = "Subscribe";
                    subBtn.classList.add('primary-btn');
                    subBtn.classList.remove('secondary-btn');
                }
            }
        }

        const res = await fetch(`/api/search?q=${encodeURIComponent(loadedChannelUser)}`);
        const videos = await res.json();
        const channelVideos = videos.filter(v => v.uploader === loadedChannelUser);
        
        renderVideoGrid(channelVideos, 'videos-container');
    } catch (error) { console.error("Failed to load channel:", error); }
}

async function toggleSubscribeFromChannel() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return alert("Must be logged in to subscribe!");
    if (!loadedChannelUser) return;

    const res = await fetch(`/api/users/${loadedChannelUser}/subscribe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUser })
    });
    const data = await res.json();
    if(data.success) {
        document.getElementById('channel-subs').innerText = data.subscribersCount;
        const subBtn = document.getElementById('subscribe-btn');
        if(data.isSubscribed) {
            subBtn.innerText = "Unsubscribe";
            subBtn.classList.add('secondary-btn'); subBtn.classList.remove('primary-btn');
        } else {
            subBtn.innerText = "Subscribe";
            subBtn.classList.add('primary-btn'); subBtn.classList.remove('secondary-btn');
        }
        loadSidebar(); 
    }
}

async function toggleSubscribeFromVideo(targetUser) {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return alert("Must be logged in to subscribe!");

    const res = await fetch(`/api/users/${targetUser}/subscribe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentUser })
    });
    const data = await res.json();
    if(data.success) {
        const subBtn = document.getElementById('video-subscribe-btn');
        if(data.isSubscribed) {
            subBtn.innerText = "Unsubscribe";
            subBtn.classList.add('secondary-btn'); subBtn.classList.remove('primary-btn');
        } else {
            subBtn.innerText = "Subscribe";
            subBtn.classList.add('primary-btn'); subBtn.classList.remove('secondary-btn');
        }
        loadSidebar(); 
    }
}

// --- SINGLE VIDEO PAGE, PLAYER, & COMMENTS ---
let currentVideoId = null;

async function loadSingleVideo() {
    const container = document.getElementById('single-video-container');
    if (!container) return;

    try {
        const currentUser = localStorage.getItem('currentUser');
        currentVideoId = new URLSearchParams(window.location.search).get('id');
        if (!currentVideoId) return container.innerHTML = "<h2>Video not found.</h2>";

        await fetch(`/api/videos/${currentVideoId}/view`, { method: 'POST' });

        const res = await fetch(`/api/videos/${currentVideoId}`);
        const data = await res.json();
        if (!data.success) return container.innerHTML = "<h2>Video not found.</h2>";
        
        const video = data.video;
        const isOwner = currentUser === video.uploader;
        const isLiked = currentUser && video.likedBy.includes(currentUser);
        const views = video.views || 0;

        let subBtnHTML = '';
        if (currentUser && !isOwner) {
            const cRes = await fetch(`/api/users/${video.uploader}`);
            const cData = await cRes.json();
            if (cData.success) {
                const isSubbed = cData.subscribers.includes(currentUser);
                const subClass = isSubbed ? 'secondary-btn' : 'primary-btn';
                const subText = isSubbed ? 'Unsubscribe' : 'Subscribe';
                subBtnHTML = `<button id="video-subscribe-btn" class="${subClass}" onclick="toggleSubscribeFromVideo('${video.uploader}')" style="padding: 8px 15px;">${subText}</button>`;
            }
        }

        container.innerHTML = `
            <div class="custom-player-wrapper" id="player-wrapper">
                <video id="main-video" src="${video.url}" autoplay playsinline></video>
                <div class="player-controls">
                    <button id="play-pause-btn" class="control-btn">⏸</button>
                    <span id="time-display" style="font-size:0.8rem; font-weight:bold;">0:00 / 0:00</span>
                    <div class="progress-container">
                        <div id="buffer-bar"></div>
                        <input type="range" id="seek-bar" value="0" step="0.1">
                    </div>
                    <button id="fullscreen-btn" class="control-btn">⛶</button>
                </div>
            </div>

            <div class="theater-info">
                <div class="theater-header-row">
                    <div class="theater-meta">
                        <h2 id="display-title">${video.title}</h2>
                        <div style="display:flex; align-items:center; gap:15px; margin-top:5px;">
                            <p style="margin:0;"><a href="/channel?user=${video.uploader}" style="font-size:1.1rem;">${video.uploader}</a></p>
                            ${subBtnHTML}
                        </div>
                        <p style="margin-top:10px; color:#ddd; font-weight:bold;">${views} views</p>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end;">
                        <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="likeVideo('${video.id}')">
                            👍 <span id="likes-count">${video.likedBy.length}</span>
                        </button>
                    </div>
                </div>

                ${video.description ? `<div class="video-desc-box">${video.description}</div>` : ''}
                
                ${isOwner ? `
                    <div class="creator-tools">
                        <button onclick="editTitle('${video.id}')" class="secondary-btn">✏️ Edit Title</button>
                        <button onclick="deleteVideo('${video.id}')" class="danger-btn">🗑️ Delete</button>
                    </div>
                ` : ''}
            </div>
        `;

        initializeCustomPlayer();

        const addCommentSection = document.getElementById('add-comment-section');
        if(!currentUser && addCommentSection) addCommentSection.classList.add('hidden');
        renderComments(video.comments || []);

    } catch (error) {
        console.error("Failed to load video:", error);
        container.innerHTML = "<h2>Error loading video.</h2>";
    }
}

function renderComments(comments) {
    const countElement = document.getElementById('comment-count');
    const listElement = document.getElementById('comments-list');
    
    if (countElement) countElement.innerText = comments.length;
    if (!listElement) return;

    listElement.innerHTML = '';
    
    comments.slice().reverse().forEach(c => {
        const avatarSrc = c.avatar || DEFAULT_AVATAR;
        listElement.innerHTML += `
            <div class="comment-item">
                <img src="${avatarSrc}" class="avatar-icon" alt="">
                <div class="comment-body">
                    <div class="comment-header">
                        <a href="/channel?user=${c.username}" class="comment-user">${c.username}</a>
                        <span class="comment-date">${c.date}</span>
                    </div>
                    <div class="comment-text">${c.text}</div>
                </div>
            </div>
        `;
    });
}

async function postComment() {
    try {
        const input = document.getElementById('comment-input');
        if (!input) return;
        
        const text = input.value;
        const currentUser = localStorage.getItem('currentUser');
        if(!text.trim()) return;

        const res = await fetch(`/api/videos/${currentVideoId}/comments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, text: text })
        });
        
        const data = await res.json();
        if(data.success) { input.value = ''; renderComments(data.comments); }
    } catch (error) { console.error("Failed to post comment:", error); }
}

// --- VIDEO INTERACTIONS ---
async function editTitle(id) {
    try {
        const newTitle = prompt("Enter new title:");
        if (!newTitle || newTitle.trim() === "") return;
        
        const res = await fetch(`/api/videos/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: localStorage.getItem('currentUser'), title: newTitle.trim() })
        });
        const data = await res.json();
        if(data.success) { document.getElementById('display-title').innerText = newTitle.trim(); } 
        else alert("Failed to update title.");
    } catch (error) { console.error("Title edit error:", error); }
}

async function deleteVideo(id) {
    try {
        if (!confirm("Are you sure you want to delete this video forever?")) return;
        const res = await fetch(`/api/videos/${id}`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: localStorage.getItem('currentUser') })
        });
        const data = await res.json();
        if(data.success) window.location.href = "/"; 
        else alert("Failed to delete.");
    } catch (error) { console.error("Delete error:", error); }
}

async function likeVideo(id) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return alert("Login to like!");
        const res = await fetch(`/api/videos/${id}/like`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser }) 
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById(`likes-count`).innerText = data.likes;
            document.querySelector('.like-btn').classList.toggle('liked');
        }
    } catch (error) { console.error("Like error:", error); }
}

// --- CUSTOM PLAYER ENGINE ---
function initializeCustomPlayer() {
    const video = document.getElementById('main-video');
    const playBtn = document.getElementById('play-pause-btn');
    const seekBar = document.getElementById('seek-bar');
    const bufferBar = document.getElementById('buffer-bar');
    const timeDisplay = document.getElementById('time-display');
    const fullScreenBtn = document.getElementById('fullscreen-btn');
    const wrapper = document.getElementById('player-wrapper');

    if (!video || !playBtn) return; 

    const formatTime = (time) => {
        if(isNaN(time)) return "0:00";
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60).toString().padStart(2, '0');
        return `${min}:${sec}`;
    };

    const togglePlay = () => {
        if (video.paused) { video.play(); playBtn.innerText = "⏸"; } 
        else { video.pause(); playBtn.innerText = "▶"; }
    };
    playBtn.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);

    video.addEventListener('loadedmetadata', () => {
        seekBar.max = video.duration;
        timeDisplay.innerText = `0:00 / ${formatTime(video.duration)}`;
    });

    video.addEventListener('timeupdate', () => {
        seekBar.value = video.currentTime;
        timeDisplay.innerText = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
        const percentage = (video.currentTime / video.duration) * 100;
        seekBar.style.background = `linear-gradient(to right, var(--accent) ${percentage}%, transparent ${percentage}%)`;
    });

    seekBar.addEventListener('input', () => video.currentTime = seekBar.value);

    video.addEventListener('progress', () => {
        if (video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            if (video.duration > 0) bufferBar.style.width = (bufferedEnd / video.duration) * 100 + "%";
        }
    });

    fullScreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (wrapper.requestFullscreen) wrapper.requestFullscreen();
            else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    });

    let hideTimeout;
    const showControls = () => {
        wrapper.classList.add('show-controls');
        wrapper.classList.remove('hide-cursor'); 
        clearTimeout(hideTimeout);
        if (!video.paused) {
            hideTimeout = setTimeout(() => {
                wrapper.classList.remove('show-controls');
                wrapper.classList.add('hide-cursor'); 
            }, 2500);
        }
    };

    wrapper.addEventListener('mousemove', showControls);
    wrapper.addEventListener('mouseleave', () => {
        if (!video.paused) wrapper.classList.remove('show-controls');
    });
    video.addEventListener('play', showControls);
    video.addEventListener('pause', () => {
        clearTimeout(hideTimeout);
        wrapper.classList.add('show-controls');
        wrapper.classList.remove('hide-cursor');
    });
    
    wrapper.classList.add('show-controls');
    wrapper.classList.remove('hide-cursor');
}