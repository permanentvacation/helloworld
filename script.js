const COLS = 10;
const ROWS = 20;
const TILE = 24;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const startButton = document.getElementById("start");
const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const bestEl = document.getElementById("best");
const muteButton = document.getElementById("mute");

// Each piece is a list of [x, y] cells in a small grid; rotation is done by math
const PIECES = {
  I: { color: "#00c6ff", cells: [[0, 1], [1, 1], [2, 1], [3, 1]], size: 4 },
  O: { color: "#ffd54a", cells: [[1, 0], [2, 0], [1, 1], [2, 1]], size: 4 },
  T: { color: "#b36bff", cells: [[1, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
  S: { color: "#4cd964", cells: [[1, 0], [2, 0], [0, 1], [1, 1]], size: 3 },
  Z: { color: "#ff5252", cells: [[0, 0], [1, 0], [1, 1], [2, 1]], size: 3 },
  J: { color: "#2f6bff", cells: [[0, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
  L: { color: "#ff9f43", cells: [[2, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
};
const NAMES = Object.keys(PIECES);

const LINE_POINTS = [0, 100, 300, 500, 800];

let grid, piece, nextName, score, lines, level;
let dropTimer = null;
let running = false;
let paused = false;
let best = 0;

try {
  best = Number(localStorage.getItem("3g-tetris-best")) || 0;
} catch (e) {
  // localStorage unavailable; best score just won't persist
}
bestEl.textContent = best;


// ---------- Sound ----------
// Everything is synthesised with the Web Audio API, so no audio files are needed.
let audioCtx = null;
let master = null;
let muted = false;
let musicPlaying = false;
let musicNext = 0;
let musicStep = 0;
let musicTimer = null;

function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  master = audioCtx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(audioCtx.destination);
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function tone(freq, start, dur, type, vol, slideTo) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise(start, dur, vol) {
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  src.buffer = buf;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(gain);
  gain.connect(master);
  src.start(start);
}

function sfx(name) {
  if (!audioCtx || muted) return;
  const t = audioCtx.currentTime;
  switch (name) {
    case "move":
      tone(220, t, 0.05, "square", 0.08);
      break;
    case "rotate":
      tone(380, t, 0.08, "square", 0.1, 560);
      break;
    case "lock":
      tone(120, t, 0.12, "triangle", 0.25, 70);
      break;
    case "drop":
      tone(200, t, 0.18, "sawtooth", 0.2, 50);
      noise(t, 0.12, 0.2);
      break;
    case "clear": {
      const base = 523.25; // a rising arpeggio, longer for bigger clears
      for (let i = 0; i < 4; i++) {
        tone(base * Math.pow(2, i * 4 / 12), t + i * 0.06, 0.18, "square", 0.12);
      }
      break;
    }
    case "tetris":
      for (let i = 0; i < 8; i++) {
        tone(440 * Math.pow(2, i * 3 / 12), t + i * 0.055, 0.22, "square", 0.12);
      }
      noise(t, 0.4, 0.15);
      break;
    case "levelup":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone(f, t + i * 0.09, 0.2, "triangle", 0.2);
      });
      break;
    case "gameover":
      [392, 330, 262, 196].forEach((f, i) => {
        tone(f, t + i * 0.22, 0.4, "sawtooth", 0.15);
      });
      break;
  }
}

// ---------- Music ----------
// [midi note, beats]; 0 is a rest. A folk-style tune in A minor with a simple bass line.
const MELODY = [
  [76, 1], [71, 0.5], [72, 0.5], [74, 1], [72, 0.5], [71, 0.5],
  [69, 1], [69, 0.5], [72, 0.5], [76, 1], [74, 0.5], [72, 0.5],
  [71, 1.5], [72, 0.5], [74, 1], [76, 1],
  [72, 1], [69, 1], [69, 1], [0, 1],
  [0, 0.5], [74, 1], [77, 0.5], [81, 1], [79, 0.5], [77, 0.5],
  [76, 1.5], [72, 0.5], [76, 1], [74, 0.5], [72, 0.5],
  [71, 1], [71, 0.5], [72, 0.5], [74, 1], [76, 1],
  [72, 1], [69, 1], [69, 1], [0, 1],
];
const BASS = [45, 52, 45, 52, 43, 50, 43, 50, 41, 48, 41, 48, 40, 47, 40, 47];

let melodyIndex = 0;
let melodyTime = 0;
let bassIndex = 0;
let bassTime = 0;

function beatLength() {
  return Math.max(0.17, 0.3 - (level - 1) * 0.012);
}

function scheduleMusic() {
  if (!musicPlaying || !audioCtx) return;
  const beat = beatLength();
  // Schedule slightly ahead so the timing stays steady
  while (melodyTime < audioCtx.currentTime + 0.25) {
    const [note, beats] = MELODY[melodyIndex];
    if (note) tone(midiToFreq(note), melodyTime, beats * beat * 0.9, "square", 0.05);
    melodyTime += beats * beat;
    melodyIndex = (melodyIndex + 1) % MELODY.length;
  }
  while (bassTime < audioCtx.currentTime + 0.25) {
    tone(midiToFreq(BASS[bassIndex]), bassTime, beat * 0.9, "triangle", 0.1);
    bassTime += beat;
    bassIndex = (bassIndex + 1) % BASS.length;
  }
}

function startMusic(fromStart) {
  if (!audioCtx) return;
  if (fromStart) {
    melodyIndex = 0;
    bassIndex = 0;
  }
  melodyTime = audioCtx.currentTime + 0.1;
  bassTime = melodyTime;
  musicPlaying = true;
  clearInterval(musicTimer);
  musicTimer = setInterval(scheduleMusic, 60);
}

function stopMusic() {
  musicPlaying = false;
  clearInterval(musicTimer);
}

function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.5;
  muteButton.textContent = muted ? "Sound: Off" : "Sound: On";
}

// ---------- Particles ----------
let particles = [];

function burst(x, y, color, count, power, gravity) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.3 + Math.random()) * power;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - power * 0.3,
      gravity: gravity,
      size: 2 + Math.random() * 3,
      life: 1,
      decay: 0.015 + Math.random() * 0.025,
      color,
    });
  }
}

function updateParticles() {
  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.life -= p.decay;
  });
  particles = particles.filter((p) => p.life > 0);
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// Short-lived white flash behind a cleared row
let flashes = [];

function drawFlashes() {
  flashes.forEach((f) => {
    ctx.globalAlpha = Math.max(0, f.life) * 0.7;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, f.row * TILE, canvas.width, TILE);
    f.life -= 0.06;
  });
  ctx.globalAlpha = 1;
  flashes = flashes.filter((f) => f.life > 0);
}

function randomName() {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
}

function newPiece(name) {
  const def = PIECES[name];
  return {
    name,
    color: def.color,
    size: def.size,
    cells: def.cells.map((c) => [c[0], c[1]]),
    x: Math.floor((COLS - def.size) / 2),
    y: 0,
  };
}

function collides(cells, px, py) {
  return cells.some(([cx, cy]) => {
    const x = px + cx;
    const y = py + cy;
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x]);
  });
}

function rotatedCells(p) {
  // Clockwise rotation inside the piece's size x size box
  return p.cells.map(([x, y]) => [p.size - 1 - y, x]);
}

function rotate() {
  if (piece.name === "O") return;
  const cells = rotatedCells(piece);
  // Try in place, then nudge sideways so rotating near a wall still works
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(cells, piece.x + dx, piece.y)) {
      piece.cells = cells;
      piece.x += dx;
      sfx("rotate");
      return;
    }
  }
}

function move(dx) {
  if (!collides(piece.cells, piece.x + dx, piece.y)) {
    piece.x += dx;
    sfx("move");
  }
}

function lockPiece(hard) {
  piece.cells.forEach(([cx, cy]) => {
    const y = piece.y + cy;
    if (y >= 0) {
      grid[y][piece.x + cx] = piece.color;
      // Little puff of dust where the block lands
      burst((piece.x + cx + 0.5) * TILE, (y + 1) * TILE, piece.color, hard ? 6 : 2, 1.5, 0.06);
    }
  });
  sfx(hard ? "drop" : "lock");
  clearLines();
  spawn();
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (grid[y].every((c) => c)) {
      grid[y].forEach((color, x) => {
        burst((x + 0.5) * TILE, (y + 0.5) * TILE, color, 5, 3.5, 0.15);
      });
      flashes.push({ row: y, life: 1 });
      grid.splice(y, 1);
      grid.unshift(new Array(COLS).fill(null));
      cleared++;
      y++; // re-check the row that dropped into this spot
    }
  }
  if (cleared) {
    score += LINE_POINTS[cleared] * level;
    lines += cleared;
    sfx(cleared === 4 ? "tetris" : "clear");
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel !== level) {
      level = newLevel;
      restartTimer();
      setTimeout(() => sfx("levelup"), 350);
    }
    updateStats();
  }
}

function spawn() {
  piece = newPiece(nextName);
  nextName = randomName();
  drawNext();
  if (collides(piece.cells, piece.x, piece.y)) {
    endGame();
  }
}

// Move down one row; returns true if the piece moved
function stepDown() {
  if (!collides(piece.cells, piece.x, piece.y + 1)) {
    piece.y++;
    return true;
  }
  lockPiece();
  return false;
}

function softDrop() {
  if (stepDown()) {
    score += 1;
    updateStats();
  }
}

function hardDrop() {
  let rows = 0;
  while (!collides(piece.cells, piece.x, piece.y + 1)) {
    // Leave a sparkle trail behind the falling piece
    piece.cells.forEach(([cx, cy]) => {
      burst((piece.x + cx + 0.5) * TILE, (piece.y + cy + 0.5) * TILE, piece.color, 1, 0.8, 0.02);
    });
    piece.y++;
    rows++;
  }
  score += rows * 2;
  lockPiece(true);
  updateStats();
}

function dropInterval() {
  return Math.max(100, 800 - (level - 1) * 70);
}

function restartTimer() {
  clearInterval(dropTimer);
  dropTimer = setInterval(() => {
    if (!paused && running) {
      stepDown();
      draw();
    }
  }, dropInterval());
}

function updateStats() {
  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function startGame() {
  grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  running = true;
  updateStats();
  particles = [];
  flashes = [];

  initAudio();
  startMusic(true);

  nextName = randomName();
  spawn();

  overlay.hidden = true;
  restartTimer();
  draw();
}

function endGame() {
  running = false;
  clearInterval(dropTimer);
  stopMusic();
  sfx("gameover");
  let text = "Game over! Score: " + score + ".";
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    text += " New best!";
    try {
      localStorage.setItem("3g-tetris-best", best);
    } catch (e) {
      // ignore
    }
  }
  message.textContent = text;
  startButton.textContent = "Play again";
  overlay.hidden = false;
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  if (paused) {
    stopMusic();
    message.textContent = "Paused";
    startButton.textContent = "Resume";
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
    startMusic(false);
  }
}

function drawCell(c, x, y, color, size) {
  c.fillStyle = color;
  c.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
}

function ghostY() {
  let y = piece.y;
  while (!collides(piece.cells, piece.x, y + 1)) y++;
  return y;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x]) drawCell(ctx, x, y, grid[y][x], TILE);
    }
  }

  drawFlashes();

  if (!piece || !running) {
    drawParticles();
    return;
  }

  // Faint outline showing where the piece will land
  const gy = ghostY();
  ctx.strokeStyle = piece.color;
  ctx.globalAlpha = 0.4;
  piece.cells.forEach(([cx, cy]) => {
    ctx.strokeRect((piece.x + cx) * TILE + 2, (gy + cy) * TILE + 2, TILE - 4, TILE - 4);
  });
  ctx.globalAlpha = 1;

  piece.cells.forEach(([cx, cy]) => {
    drawCell(ctx, piece.x + cx, piece.y + cy, piece.color, TILE);
  });

  drawParticles();
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const def = PIECES[nextName];
  const size = 20;
  const xs = def.cells.map((c) => c[0]);
  const ys = def.cells.map((c) => c[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  const offX = (nextCanvas.width / size - w) / 2 - Math.min(...xs);
  const offY = (nextCanvas.height / size - h) / 2 - Math.min(...ys);
  def.cells.forEach(([cx, cy]) => {
    drawCell(nextCtx, cx + offX, cy + offY, def.color, size);
  });
}

function act(name) {
  if (!running || paused) return;
  switch (name) {
    case "left": move(-1); break;
    case "right": move(1); break;
    case "rotate": rotate(); break;
    case "down": softDrop(); break;
    case "drop": hardDrop(); break;
  }
  if (running) draw();
}

const KEYS = {
  ArrowLeft: "left", a: "left",
  ArrowRight: "right", d: "right",
  ArrowUp: "rotate", w: "rotate",
  ArrowDown: "down", s: "down",
  " ": "drop",
};

document.addEventListener("keydown", (e) => {
  if (e.key === "p" || e.key === "P") {
    togglePause();
    return;
  }
  if (e.key === "m" || e.key === "M") {
    setMuted(!muted);
    return;
  }
  const action = KEYS[e.key];
  if (!action) return;
  e.preventDefault();
  act(action);
});

document.querySelectorAll(".pad button").forEach((btn) => {
  btn.addEventListener("click", () => act(btn.dataset.act));
});

muteButton.addEventListener("click", () => {
  setMuted(!muted);
  muteButton.blur(); // so the space bar doesn't toggle it mid-game
});

startButton.addEventListener("click", () => {
  if (running && paused) {
    togglePause();
  } else {
    startGame();
  }
});

// Draw an empty board behind the start screen
grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));

// Particles animate every frame, independent of the piece drop timer
function frame() {
  updateParticles();
  draw();
  requestAnimationFrame(frame);
}
frame();
