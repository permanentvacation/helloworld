const TILE = 20;
const COLS = 20;
const ROWS = 20;
const TICK_MS = 120;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const startButton = document.getElementById("start");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");

let snake, dir, nextDir, food, score, timerId;
let best = 0;

try {
  best = Number(localStorage.getItem("3g-snake-best")) || 0;
} catch (e) {
  // localStorage unavailable; best score just won't persist
}
bestEl.textContent = best;

function placeFood() {
  do {
    food = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  } while (snake.some((s) => s.x === food.x && s.y === food.y));
}

function startGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  dir = { x: 1, y: 0 };
  nextDir = dir;
  score = 0;
  scoreEl.textContent = score;
  placeFood();

  overlay.hidden = true;
  clearInterval(timerId);
  timerId = setInterval(tick, TICK_MS);
  draw();
}

function endGame() {
  clearInterval(timerId);
  let text = "Game over! Score: " + score + ".";
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    text += " New best!";
    try {
      localStorage.setItem("3g-snake-best", best);
    } catch (e) {
      // ignore
    }
  }
  message.textContent = text;
  startButton.textContent = "Play again";
  overlay.hidden = false;
}

function tick() {
  dir = nextDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
  const ate = head.x === food.x && head.y === food.y;
  // The tail moves away this tick unless we eat, so it isn't a collision
  const body = ate ? snake : snake.slice(0, -1);
  const hitSelf = body.some((s) => s.x === head.x && s.y === head.y);

  if (hitWall || hitSelf) {
    endGame();
    return;
  }

  snake.unshift(head);
  if (ate) {
    score++;
    scoreEl.textContent = score;
    placeFood();
  } else {
    snake.pop();
  }
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ff5252";
  ctx.beginPath();
  ctx.arc(food.x * TILE + TILE / 2, food.y * TILE + TILE / 2, TILE / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? "#00c6ff" : "#0072ff";
    ctx.fillRect(s.x * TILE + 1, s.y * TILE + 1, TILE - 2, TILE - 2);
  });
}

function steer(x, y) {
  // Ignore reversing straight into the snake's own neck
  if (x === -dir.x && y === -dir.y) return;
  nextDir = { x, y };
}

const KEYS = {
  ArrowUp: [0, -1], w: [0, -1],
  ArrowDown: [0, 1], s: [0, 1],
  ArrowLeft: [-1, 0], a: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0],
};

document.addEventListener("keydown", (e) => {
  const k = KEYS[e.key];
  if (!k || overlay.hidden === false) return;
  e.preventDefault();
  steer(k[0], k[1]);
});

// Swipe controls for touch screens
let touchStart = null;
canvas.addEventListener("touchstart", (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});
canvas.addEventListener("touchend", (e) => {
  if (!touchStart || overlay.hidden === false) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    steer(dx > 0 ? 1 : -1, 0);
  } else {
    steer(0, dy > 0 ? 1 : -1);
  }
  touchStart = null;
});

startButton.addEventListener("click", startGame);
