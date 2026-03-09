const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

// --- Data persistence ---
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { words: getDefaultWords(), log: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getDefaultWords() {
  return {
    Lowkey: 0,
    Cooked: 0,
    "Am Tweaken": 0,
  };
}

// Init data file if missing
if (!fs.existsSync(DATA_FILE)) {
  saveData({ words: getDefaultWords(), log: [] });
}

// --- SSE (Server-Sent Events) for real-time updates ---
const clients = new Set();

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(msg);
  }
}

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- API ---

// Get current state
app.get("/api/state", (req, res) => {
  res.json(loadData());
});

// Increment a word counter
app.post("/api/increment", (req, res) => {
  const { word, user } = req.body;
  if (!word) return res.status(400).json({ error: "word required" });

  const data = loadData();

  if (!(word in data.words)) {
    data.words[word] = 0;
  }
  data.words[word]++;

  // Keep last 50 log entries
  data.log.unshift({
    word,
    user: user || "Anonym",
    time: new Date().toISOString(),
  });
  data.log = data.log.slice(0, 50);

  saveData(data);
  broadcast(data);
  res.json(data);
});

// Add a new word
app.post("/api/add-word", (req, res) => {
  const { word } = req.body;
  if (!word) return res.status(400).json({ error: "word required" });

  const data = loadData();
  if (!(word in data.words)) {
    data.words[word] = 0;
    saveData(data);
    broadcast(data);
  }
  res.json(data);
});

// Undo last action (decrement the most recent log entry)
app.post("/api/undo", (req, res) => {
  const data = loadData();
  if (data.log.length === 0) return res.status(400).json({ error: "nothing to undo" });

  const entry = data.log.shift();
  if (entry.word in data.words && data.words[entry.word] > 0) {
    data.words[entry.word]--;
  }

  saveData(data);
  broadcast(data);
  res.json(data);
});

// Remove a specific log entry by index
app.post("/api/remove-entry", (req, res) => {
  const { index } = req.body;
  const data = loadData();

  if (index == null || index < 0 || index >= data.log.length) {
    return res.status(400).json({ error: "invalid index" });
  }

  const entry = data.log.splice(index, 1)[0];
  if (entry.word in data.words && data.words[entry.word] > 0) {
    data.words[entry.word]--;
  }

  saveData(data);
  broadcast(data);
  res.json(data);
});

// Reset all counters
app.post("/api/reset", (req, res) => {
  const data = loadData();
  for (const key of Object.keys(data.words)) {
    data.words[key] = 0;
  }
  data.log = [];
  saveData(data);
  broadcast(data);
  res.json(data);
});

// SSE endpoint
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify(loadData())}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

app.listen(PORT, () => {
  console.log(`Navid Counter running on http://localhost:${PORT}`);
});
