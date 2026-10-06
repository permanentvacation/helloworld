const GAME_SECONDS = 30;

const board = document.getElementById("board");
const target = document.getElementById("target");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const startButton = document.getElementById("start");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const bestEl = document.getElementById("best");

let score = 0;
let timeLeft = GAME_SECONDS;
let best = 0;
let timerId = null;
let moveId = null;

try {
  best = Number(localStorage.getItem("3g-best")) || 0;
} catch (e) {
  // localStorage unavailable; best score just won't persist
}
bestEl.textContent = best;

// Time between automatic moves; shrinks as the score grows
function moveDelay() {
  return Math.max(450, 1400 - score * 40);
}

function moveTarget() {
  const maxX = board.clientWidth - target.offsetWidth;
  const maxY = board.clientHeight - target.offsetHeight;
  target.style.left = Math.random() * maxX + "px";
  target.style.top = Math.random() * maxY + "px";

  clearTimeout(moveId);
  moveId = setTimeout(moveTarget, moveDelay());
}

function startGame() {
  score = 0;
  timeLeft = GAME_SECONDS;
  scoreEl.textContent = score;
  timeEl.textContent = timeLeft;

  overlay.hidden = true;
  target.hidden = false;
  moveTarget();

  timerId = setInterval(() => {
    timeLeft--;
    timeEl.textContent = timeLeft;
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  clearInterval(timerId);
  clearTimeout(moveId);
  target.hidden = true;

  let text = "Time's up! You caught " + score + " logo" + (score === 1 ? "" : "s") + ".";
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    text += " New best score!";
    try {
      localStorage.setItem("3g-best", best);
    } catch (e) {
      // ignore
    }
  }
  message.textContent = text;
  startButton.textContent = "Play again";
  overlay.hidden = false;
}

target.addEventListener("click", () => {
  score++;
  scoreEl.textContent = score;
  moveTarget();
});

startButton.addEventListener("click", startGame);
