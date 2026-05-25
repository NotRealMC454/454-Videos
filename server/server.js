const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";

const DEFAULT_AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23a1a1aa"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

// --- DATABASE SETUP & MIGRATION ---
const dbPath = path.join(__dirname, "database.json");
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: [], videos: [] }, null, 2));
}
function readDB() {
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}
function writeDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function migrateDB() {
  const db = readDB();
  let migrated = false;
  db.videos.forEach((v) => {
    if (!v.comments) {
      v.comments = [];
      migrated = true;
    }
    if (v.views === undefined) {
      v.views = 0;
      migrated = true;
    }
    if (v.description === undefined) {
      v.description = "";
      migrated = true;
    }
  });
  db.users.forEach((u) => {
    if (!u.avatar || u.avatar === "/default-avatar.png") {
      u.avatar = DEFAULT_AVATAR;
      migrated = true;
    }
    if (!u.subscribers) {
      u.subscribers = [];
      migrated = true;
    }
    if (!u.subscribedTo) {
      u.subscribedTo = [];
      migrated = true;
    }
  });
  if (migrated) writeDB(db);
}
migrateDB();

// --- MIDDLEWARE & STATIC FILES ---
app.use(express.static(path.join(__dirname, "../client/dist"), { extensions: ["html"] }));
app.use(express.static(path.join(__dirname, "../client/public")));
app.use("/uploads", express.static("uploads"));
app.use(express.json({ limit: "10gb" }));
app.use(express.urlencoded({ limit: "10gb", extended: true }));

const uploadDir = "./uploads";
const avatarDir = "./uploads/avatars";
const thumbDir = "./uploads/thumbnails";

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, "chunk-" + Date.now() + path.extname(file.originalname));
  },
});
const avatarStorage = multer.diskStorage({
  destination: avatarDir,
  filename: (req, file, cb) => {
    cb(null, "avatar-" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// --- AUTH & USER ROUTES ---
app.post("/api/signup", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.trim() === "")
    return res.status(400).json({
      success: false,
      message: "Valid username and password are required.",
    });
  const db = readDB();
  if (
    db.users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
    )
  )
    return res
      .status(400)
      .json({ success: false, message: "Username already exists." });

  db.users.push({
    username: username.trim(),
    password,
    avatar: DEFAULT_AVATAR,
    subscribers: [],
    subscribedTo: [],
  });
  writeDB(db);
  res.json({
    success: true,
    message: "Account created!",
    username: username.trim(),
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "Required." });
  const db = readDB();
  const user = db.users.find(
    (u) =>
      u.username.toLowerCase() === username.trim().toLowerCase() &&
      u.password === password,
  );
  if (user)
    res.json({ success: true, username: user.username, avatar: user.avatar });
  else
    res.status(401).json({ success: false, message: "Invalid credentials." });
});

app.get("/api/users/:username", (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.username === req.params.username);
  if (user) {
    res.json({
      success: true,
      username: user.username,
      avatar: user.avatar,
      subscribers: user.subscribers,
      subscribedTo: user.subscribedTo,
    });
  } else res.status(404).json({ success: false });
});

app.put("/api/users/password", (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  const db = readDB();
  const user = db.users.find(
    (u) => u.username === username && u.password === oldPassword,
  );
  if (user) {
    user.password = newPassword;
    writeDB(db);
    res.json({ success: true, message: "Password updated!" });
  } else
    res
      .status(401)
      .json({ success: false, message: "Incorrect old password." });
});

app.post("/api/users/avatar", (req, res) => {
  uploadAvatar.single("avatar")(req, res, function (err) {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ success: false, message: "File exceeds 5MB limit." });
    } else if (err) {
      return res.status(500).json({ success: false, message: "Upload error." });
    }
    if (!req.file) return res.status(400).json({ success: false });

    const { username } = req.body;
    const db = readDB();
    const user = db.users.find((u) => u.username === username);
    if (user) {
      user.avatar = `/uploads/avatars/${req.file.filename}`;
      writeDB(db);
      res.json({ success: true, avatar: user.avatar });
    } else res.status(404).json({ success: false });
  });
});

app.post("/api/users/:targetUser/subscribe", (req, res) => {
  const { currentUser } = req.body;
  const targetUsername = req.params.targetUser;
  if (!currentUser || currentUser === targetUsername)
    return res.status(400).json({ success: false });

  const db = readDB();
  const target = db.users.find((u) => u.username === targetUsername);
  const user = db.users.find((u) => u.username === currentUser);

  if (target && user) {
    const subIndex = target.subscribers.indexOf(currentUser);
    if (subIndex === -1) {
      target.subscribers.push(currentUser);
      user.subscribedTo.push(targetUsername);
    } else {
      target.subscribers.splice(subIndex, 1);
      user.subscribedTo = user.subscribedTo.filter(
        (name) => name !== targetUsername,
      );
    }
    writeDB(db);
    res.json({
      success: true,
      subscribersCount: target.subscribers.length,
      isSubscribed: subIndex === -1,
    });
  } else res.status(404).json({ success: false });
});

// --- BACKGROUND PROCESSING TRACKER ---
const processingTasks = {};

// --- CHUNKED UPLOAD (With Description) ---
app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No chunk provided" });

  const { taskId, chunkIndex, totalChunks, username, title, description } =
    req.body;
  const tempPath = path.join(uploadDir, `temp-${taskId}`);

  const chunkData = fs.readFileSync(req.file.path);
  fs.appendFileSync(tempPath, chunkData);
  fs.unlinkSync(req.file.path);

  if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
    startFFmpegProcessing(taskId, tempPath, username, title, description);
    res.json({ success: true, done: true });
  } else res.json({ success: true, done: false });
});

function startFFmpegProcessing(taskId, rawPath, username, title, description) {
  const compressedFilename = "454-video-" + taskId + ".mp4";
  const thumbFilename = "thumb-" + taskId + ".jpg";

  const compressedPath = path.join(uploadDir, compressedFilename);
  const thumbPath = path.join(thumbDir, thumbFilename);

  processingTasks[taskId] = {
    status: "processing",
    percent: 0,
    videoData: {
      id: taskId,
      uploader: username || "Anonymous",
      title: title || "Untitled Video",
      description: description || "",
      views: 0,
      url: `/uploads/${compressedFilename}`,
      thumbnailUrl: `/uploads/thumbnails/${thumbFilename}`,
      likedBy: [],
      comments: [],
    },
  };

  ffmpeg(rawPath)
    .seekInput(1)
    .frames(1)
    .output(thumbPath)
    .on("end", () => {
      ffmpeg(rawPath)
        .outputOptions(["-preset ultrafast", "-crf 28"])
        .on("progress", (progress) => {
          if (processingTasks[taskId] && progress.percent) {
            processingTasks[taskId].percent = Math.round(progress.percent);
          }
        })
        .save(compressedPath)
        .on("end", () => {
          fs.unlinkSync(rawPath);
          const db = readDB();
          db.videos.push(processingTasks[taskId].videoData);
          writeDB(db);
          processingTasks[taskId].status = "done";
        })
        .on("error", (err) => {
          console.error("Compression Error:", err);
          processingTasks[taskId].status = "error";
        });
    })
    .on("error", (err) => {
      console.error("Thumbnail Error:", err);
      processingTasks[taskId].status = "error";
    })
    .run();
}

app.get("/api/upload/status/:taskId", (req, res) => {
  const task = processingTasks[req.params.taskId];
  if (task) res.json(task);
  else res.status(404).json({ status: "not_found" });
});

// --- VIDEO MANAGEMENT ROUTES ---
app.get("/api/videos", (req, res) => {
  res.json(readDB().videos);
});

app.get("/api/videos/top", (req, res) => {
  const db = readDB();
  const sorted = [...db.videos]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 3);
  res.json(sorted);
});

app.get("/api/search", (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : "";
  const db = readDB();
  const results = db.videos.filter(
    (v) =>
      v.title.toLowerCase().includes(query) ||
      v.uploader.toLowerCase().includes(query),
  );
  res.json(results);
});

app.get("/api/channels/search", (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : "";
  const db = readDB();
  const results = db.users
    .filter((u) => u.username.toLowerCase().includes(query))
    .map((u) => ({ username: u.username, avatar: u.avatar }));
  res.json(results);
});

app.get("/api/videos/:id", (req, res) => {
  const db = readDB();
  const video = db.videos.find((v) => v.id === req.params.id);
  if (video) res.json({ success: true, video });
  else res.status(404).json({ success: false, message: "Video not found" });
});

app.post("/api/videos/:id/view", (req, res) => {
  const db = readDB();
  const video = db.videos.find((v) => v.id === req.params.id);
  if (video) {
    video.views = (video.views || 0) + 1;
    writeDB(db);
    res.json({ success: true, views: video.views });
  } else res.status(404).json({ success: false });
});

app.put("/api/videos/:id", (req, res) => {
  const { username, title } = req.body;
  const db = readDB();
  const videoIndex = db.videos.findIndex((v) => v.id === req.params.id);
  if (videoIndex > -1 && db.videos[videoIndex].uploader === username) {
    db.videos[videoIndex].title = title;
    writeDB(db);
    res.json({ success: true });
  } else res.status(403).json({ success: false, message: "Unauthorized" });
});

app.delete("/api/videos/:id", (req, res) => {
  const { username } = req.body;
  const db = readDB();
  const videoIndex = db.videos.findIndex((v) => v.id === req.params.id);
  if (videoIndex > -1 && db.videos[videoIndex].uploader === username) {
    const video = db.videos[videoIndex];
    const filePath = path.join(__dirname, video.url);
    const thumbPath = video.thumbnailUrl
      ? path.join(__dirname, video.thumbnailUrl)
      : null;

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (thumbPath && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    db.videos.splice(videoIndex, 1);
    writeDB(db);
    res.json({ success: true });
  } else res.status(403).json({ success: false, message: "Unauthorized" });
});

// --- SOCIAL ROUTES ---
app.post("/api/videos/:id/like", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(401).json({ success: false });
  const db = readDB();
  const video = db.videos.find((v) => v.id === req.params.id);
  if (video) {
    if (!video.likedBy) video.likedBy = [];
    const userIndex = video.likedBy.indexOf(username);
    if (userIndex === -1) video.likedBy.push(username);
    else video.likedBy.splice(userIndex, 1);
    writeDB(db);
    res.json({ success: true, likes: video.likedBy.length });
  }
});

app.post("/api/videos/:id/comments", (req, res) => {
  const { username, text } = req.body;
  if (!username || !text.trim())
    return res.status(400).json({ success: false });
  const db = readDB();
  const user = db.users.find((u) => u.username === username);
  const video = db.videos.find((v) => v.id === req.params.id);
  if (video && user) {
    if (!video.comments) video.comments = [];
    const newComment = {
      id: Date.now().toString(),
      username,
      avatar: user.avatar,
      text: text.trim(),
      date: new Date().toLocaleDateString(),
    };
    video.comments.push(newComment);
    writeDB(db);
    res.json({ success: true, comments: video.comments });
  } else res.status(404).json({ success: false });
});

app.listen(PORT, HOST, () => {
  console.log(`454 Videos V3.1.0 running on http://${HOST}:${PORT}`);
});
