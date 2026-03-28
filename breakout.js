const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let paddle = { x: 350, y: 550, width: 100, height: 10 };
let ball = { x: 400, y: 300, dx: 2, dy: 2, radius: 10 };
let bricks = [];
for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 5; j++) {
        bricks.push({ x: i * 80, y: j * 30, width: 75, height: 25, alive: true });
    }
}
let score = 0;
let episodes = 0;
let gameRunning = false;
let aiPlaying = false;
let training = false;

// Q-table
let qTable = {};

function getState() {
    let ballX = Math.floor(ball.x / 40); // finer: 20 bins for 800px
    let ballY = Math.floor(ball.y / 60);
    let paddleX = Math.floor(paddle.x / 40); // 20 bins
    let ballDirX = ball.dx > 0 ? 1 : 0;
    let ballDirY = ball.dy > 0 ? 1 : 0;
    return `${ballX},${ballY},${paddleX},${ballDirX},${ballDirY}`;
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
    qTable[state][action] += 0.1 * (reward + 0.9 * maxNext - qTable[state][action]);
}

function reset() {
    ball = { x: 400, y: 300, dx: 2 + Math.random() * 2 - 1, dy: 2, radius: 10 };
    paddle = { x: 350, y: 550, width: 100, height: 10 };
    bricks.forEach(b => b.alive = true);
    score = 0;
}

function update() {
    if (!gameRunning) return;

    // Move ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collisions
    if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.dx = -ball.dx;
    if (ball.y - ball.radius < 0) ball.dy = -ball.dy;
    if (ball.y - ball.radius > canvas.height) {
        // Lose
        reset();
        return;
    }

    // Paddle collision
    if (ball.y + ball.radius >= paddle.y && ball.y - ball.radius <= paddle.y + paddle.height &&
        ball.x >= paddle.x && ball.x <= paddle.x + paddle.width) {
        ball.dy = -Math.abs(ball.dy);
    }

    // Brick collisions
    bricks.forEach(brick => {
        if (brick.alive &&
            ball.x + ball.radius >= brick.x && ball.x - ball.radius <= brick.x + brick.width &&
            ball.y + ball.radius >= brick.y && ball.y - ball.radius <= brick.y + brick.height) {
            brick.alive = false;
            ball.dy = -ball.dy;
            score++;
        }
    });

    // AI action
    if (aiPlaying) {
        let state = getState();
        let action = getAction(state, episodes); // pass episodes for epsilon
        if (action === 0) paddle.x -= 5;
        else if (action === 2) paddle.x += 5;
        paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
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
    if (!aiPlaying && gameRunning) {
        if (e.key === 'ArrowLeft') paddle.x -= 10;
        if (e.key === 'ArrowRight') paddle.x += 10;
        paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
    }
});

document.getElementById('start').addEventListener('click', () => {
    gameRunning = true;
    aiPlaying = false;
    training = false;
    reset();
});

document.getElementById('playAI').addEventListener('click', () => {
    gameRunning = true;
    aiPlaying = true;
    training = false;
    reset();
});

document.getElementById('train').addEventListener('click', () => {
    training = true;
    gameRunning = false;
    aiPlaying = false;
    trainAI();
});

function trainAI() {
    for (let ep = 0; ep < 10000; ep++) {
        reset();
        let steps = 0;
        while (ball.y < canvas.height && steps < 1000) {
            let state = getState();
            let action = getAction(state, ep);
            if (action === 0) paddle.x -= 5;
            else if (action === 2) paddle.x += 5;
            paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));

            // Move ball
            ball.x += ball.dx;
            ball.y += ball.dy;
            if (ball.x - ball.radius < 0 || ball.x + ball.radius > canvas.width) ball.dx = -ball.dx;
            if (ball.y - ball.radius < 0) ball.dy = -ball.dy;
            if (ball.y - ball.radius > canvas.height) break;

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

            let reward = 0.2; // increased survival reward
            if (paddleHit) reward += 1; // reward for hitting ball back
            if (hitBrick) reward += 10;
            if (ball.y > canvas.height) reward = -10;

            let nextState = getState();
            updateQ(state, action, reward, nextState);
            steps++;
        }
        episodes++;
    }
    training = false;
    alert('Training complete!');
}