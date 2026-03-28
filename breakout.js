const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let paddle = { x: 350, y: 550, width: 100, height: 10 };
let ball = { x: 400, y: 300, dx: 2, dy: 2, radius: 10 };
let bricks = [];
let score = 0;
let episodes = 0;
let gameRunning = false;
let aiPlaying = false;
let training = false;
let paused = false;
let lives = 3;
let currentLevel = 1;
let highScore = localStorage.getItem('breakoutHighScore') || 0;
let difficulty = 'normal';
let soundEnabled = true;

// Audio context for sound effects
let audioCtx;
try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
} catch (e) {
    console.warn('Web Audio API not supported');
}

let levels = {
    1: { rows: 5, cols: 10, pattern: 'full' },
    2: { rows: 6, cols: 10, pattern: 'pyramid' },
    3: { rows: 7, cols: 10, pattern: 'checker' }
};

// Q-table
let qTable = {};

function initBricks(level) {
    bricks = [];
    let config = levels[level];
    for (let i = 0; i < config.cols; i++) {
        for (let j = 0; j < config.rows; j++) {
            let include = true;
            if (config.pattern === 'pyramid' && j > i && j > config.cols - 1 - i) include = false;
            if (config.pattern === 'checker' && (i + j) % 2 === 0) include = false;
            if (include) {
                bricks.push({ x: i * 80, y: j * 30 + 50, width: 75, height: 25, alive: true });
            }
        }
    }
}

function playSound(frequency, duration, type = 'square') {
    if (!soundEnabled || !audioCtx) return;
    let oscillator = audioCtx.createOscillator();
    let gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    oscillator.type = type;
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
}

function getState() {
    let relX = Math.floor((ball.x - paddle.x) / 25); // finer: 25px bins for better precision
    let ballY = Math.floor(ball.y / 60);
    let ballDirX = ball.dx > 0 ? 1 : 0;
    let ballDirY = ball.dy > 0 ? 1 : 0;
    return `${relX},${ballY},${ballDirX},${ballDirY}`;
}

function getAction(state, ep) {
    if (!qTable[state]) qTable[state] = [0, 0, 0];
    let epsilon = Math.max(0.01, 0.1 - ep * 0.000005); // decay epsilon
    if (Math.random() < epsilon) return Math.floor(Math.random() * 3);
    return qTable[state].indexOf(Math.max(...qTable[state]));
}

function updateQ(state, action, reward, nextState) {
    if (!qTable[state]) qTable[state] = [0, 0, 0];
    if (!qTable[nextState]) qTable[nextState] = [0, 0, 0];
    let maxNext = Math.max(...qTable[nextState]);
    qTable[state][action] += 0.1 * (reward + 0.95 * maxNext - qTable[state][action]);
}

function reset() {
    let speed = difficulty === 'easy' ? 1.5 : difficulty === 'hard' ? 3 : 2;
    ball = { x: 400, y: 300, dx: speed * (Math.random() > 0.5 ? 1 : -1), dy: speed, radius: 10 };
    paddle = { x: 350, y: 550, width: difficulty === 'easy' ? 120 : difficulty === 'hard' ? 80 : 100, height: 10 };
    initBricks(currentLevel);
    score = 0;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('breakoutHighScore', highScore);
    }
}

function update() {
    if (!gameRunning || paused) return;

    // Move ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collisions
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) {
        ball.dx = -ball.dx;
        playSound(800, 0.1);
    }
    if (ball.y - ball.radius < 0) {
        ball.dy = -ball.dy;
        playSound(600, 0.1);
    }
    if (ball.y - ball.radius > canvas.height) {
        lives--;
        playSound(200, 0.5);
        if (lives <= 0) {
            gameRunning = false;
            alert('Game Over!');
            return;
        } else {
            reset();
            return;
        }
    }

    // Paddle collision
    if (ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddle.height &&
        ball.x >= paddle.x && ball.x <= paddle.x + paddle.width) {
        ball.dy = -Math.abs(ball.dy);
        playSound(1000, 0.1);
    }

    // Brick collisions
    bricks.forEach(brick => {
        if (brick.alive &&
            ball.x + ball.radius >= brick.x && ball.x - ball.radius <= brick.x + brick.width &&
            ball.y + ball.radius >= brick.y && ball.y - ball.radius <= brick.y + brick.height) {
            brick.alive = false;
            ball.dy = -ball.dy;
            score += 10;
            playSound(1200, 0.1);
            if (bricks.every(b => !b.alive)) {
                currentLevel++;
                if (currentLevel > 3) currentLevel = 1;
                initBricks(currentLevel);
            }
        }
    });

    // AI action
    if (aiPlaying) {
        let state = getState();
        let action = getAction(state, episodes); // pass episodes for epsilon
        // Smooth movement
        let targetX = paddle.x;
        if (action === 0) targetX -= 5;
        else if (action === 2) targetX += 5;
        targetX = Math.max(0, Math.min(canvas.width - paddle.width, targetX));
        paddle.x += (targetX - paddle.x) * 0.1; // easing
        document.getElementById('aiInfo').textContent = `State: ${state}, Action: ${action === 0 ? 'Left' : action === 1 ? 'Stay' : 'Right'}`;
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Bricks
    ctx.fillStyle = 'red';
    bricks.forEach(brick => {
        if (brick.alive) ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    });

    // Paddle
    ctx.fillStyle = 'blue';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

    // Ball
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Score
    document.getElementById('score').textContent = `Score: ${score}`;
    document.getElementById('highScore').textContent = `High Score: ${highScore}`;
    document.getElementById('level').textContent = `Level: ${currentLevel}`;
    document.getElementById('lives').textContent = `Lives: ${lives}`;
    document.getElementById('episodes').textContent = `Episodes: ${episodes}`;
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();

// Controls
document.addEventListener('keydown', (e) => {
    if (!aiPlaying && gameRunning && !paused) {
        if (e.key === 'ArrowLeft') paddle.x -= 10;
        if (e.key === 'ArrowRight') paddle.x += 10;
        paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
    }
    if (e.key === ' ') {
        e.preventDefault();
        paused = !paused;
        document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');

    // Touch controls for mobile
    let touchStartX = 0;
    canvas.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
    });
    canvas.addEventListener('touchmove', (e) => {
        if (!aiPlaying && gameRunning && !paused) {
            e.preventDefault();
            let touchX = e.touches[0].clientX;
            let diff = touchX - touchStartX;
            paddle.x += diff * 0.5;
            paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
            touchStartX = touchX;
        }
    });

    document.getElementById('start').addEventListener('click', () => {
        console.log('Start clicked');
        gameRunning = true;
        aiPlaying = false;
        training = false;
        paused = false;
        lives = 3;
        currentLevel = parseInt(document.getElementById('levelSelect').value);
        difficulty = document.getElementById('difficulty').value;
        soundEnabled = document.getElementById('soundEnabled').checked;
        reset();
        document.getElementById('pause').textContent = 'Pause';
    });

    document.getElementById('pause').addEventListener('click', () => {
        paused = !paused;
        document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause';
    });

    document.getElementById('playAI').addEventListener('click', () => {
        gameRunning = true;
        aiPlaying = true;
        training = false;
        paused = false;
        lives = 3;
        currentLevel = parseInt(document.getElementById('levelSelect').value);
        difficulty = document.getElementById('difficulty').value;
        soundEnabled = document.getElementById('soundEnabled').checked;
        reset();
        document.getElementById('pause').textContent = 'Pause';
    });

    document.getElementById('reset').addEventListener('click', () => {
        gameRunning = false;
        aiPlaying = false;
        training = false;
        paused = false;
        lives = 3;
        score = 0;
        currentLevel = 1;
        reset();
        document.getElementById('pause').textContent = 'Pause';
    });

    document.getElementById('train').addEventListener('click', () => {
        training = true;
        gameRunning = false;
        aiPlaying = false;
        paused = false;
        difficulty = document.getElementById('difficulty').value;
        soundEnabled = document.getElementById('soundEnabled').checked;
        trainAI();
    });
});

function trainAI() {
    for (let ep = 0; ep < 20000; ep++) {
        reset();
        let steps = 0;
        while (ball.y < canvas.height && steps < 1000 && lives > 0) {
            let state = getState();
            let action = getAction(state, ep);
            let targetX = paddle.x;
            if (action === 0) targetX -= 5;
            else if (action === 2) targetX += 5;
            targetX = Math.max(0, Math.min(canvas.width - paddle.width, targetX));
            paddle.x += (targetX - paddle.x) * 0.1; // easing

            // Move ball
            ball.x += ball.dx;
            ball.y += ball.dy;
            if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.dx = -ball.dx;
            if (ball.y - ball.radius < 0) ball.dy = -ball.dy;
            if (ball.y - ball.radius > canvas.height) {
                lives--;
                break;
            }

            // Paddle collision
            let paddleHit = false;
            if (ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddle.height &&
                ball.x >= paddle.x && ball.x <= paddle.x + paddle.width) {
                ball.dy = -Math.abs(ball.dy);
                paddleHit = true;
            }

            // Brick collisions
            let hitBrick = false;
            bricks.forEach(brick => {
                if (brick.alive &&
                    ball.x + ball.radius >= brick.x && ball.x - ball.radius <= brick.x + brick.width &&
                    ball.y + ball.radius >= brick.y && ball.y - ball.radius <= brick.y + brick.height) {
                    brick.alive = false;
                    ball.dy = -ball.dy;
                    hitBrick = true;
                }
            });

            let reward = 0.5; // increased survival reward
            if (paddleHit) reward += 5; // higher reward for hitting ball back
            if (hitBrick) reward += 10;
            if (ball.y > canvas.height) reward = -10;

            let nextState = getState();
            updateQ(state, action, reward, nextState);
            steps++;
        }
        episodes++;
        if (ep % 1000 === 0) console.log(`Episode ${ep}, Score: ${score}`);
    }
    training = false;
    alert('Training complete!');
}