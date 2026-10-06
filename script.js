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
      return;
    }
  }
}

function move(dx) {
  if (!collides(piece.cells, piece.x + dx, piece.y)) {
    piece.x += dx;
  }
}

function lockPiece() {
  piece.cells.forEach(([cx, cy]) => {
    const y = piece.y + cy;
    if (y >= 0) grid[y][piece.x + cx] = piece.color;
  });
  clearLines();
  spawn();
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (grid[y].every((c) => c)) {
      grid.splice(y, 1);
      grid.unshift(new Array(COLS).fill(null));
      cleared++;
      y++; // re-check the row that dropped into this spot
    }
  }
  if (cleared) {
    score += LINE_POINTS[cleared] * level;
    lines += cleared;
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel !== level) {
      level = newLevel;
      restartTimer();
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
    piece.y++;
    rows++;
  }
  score += rows * 2;
  lockPiece();
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

  nextName = randomName();
  spawn();

  overlay.hidden = true;
  restartTimer();
  draw();
}

function endGame() {
  running = false;
  clearInterval(dropTimer);
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
    message.textContent = "Paused";
    startButton.textContent = "Resume";
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
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

  if (!piece || !running) return;

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
  const action = KEYS[e.key];
  if (!action) return;
  e.preventDefault();
  act(action);
});

document.querySelectorAll(".pad button").forEach((btn) => {
  btn.addEventListener("click", () => act(btn.dataset.act));
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
draw();
