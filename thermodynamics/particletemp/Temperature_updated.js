let id = null;
const N = 768;
const cafeN = 256;
const waterN = N - cafeN;
let isPause = true;

// ---- Stopwatch state ----
let tStart = 0;
let pausedAt = 0;
let pausedTotal = 0;

function formatStopwatch(ms) {
    const total = Math.max(0, Math.floor(ms));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const millis = total % 1000;
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    const mmm = String(millis).padStart(3, "0");
    return `${mm}:${ss}.${mmm}`;
}

function updateStopwatch() {
    const now = performance.now();
    const elapsed = isPause
        ? (pausedAt - tStart - pausedTotal)
        : (now - tStart - pausedTotal);
    document.getElementById("stopwatch").textContent = formatStopwatch(elapsed);
}

function resetStopwatch() {
    tStart = performance.now();
    pausedAt = 0;
    pausedTotal = 0;
    document.getElementById("stopwatch").textContent = "00:00.000";
}

const canvas = document.getElementById("simulationCanvas");
const ctx = canvas.getContext("2d");
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

/******** 질량 및 온도 설정 ********/
const waterMass = 18;
const cafeMass = 243;
const RADIUS = 5;
let TEMP = 300; // K
const k = 1.38;
let beta;

/******** grid 설정 ********/
const COLLISION_DIST = 2 * RADIUS;
const COLLISION_DIST2 = COLLISION_DIST * COLLISION_DIST;
const CELL_SIZE = COLLISION_DIST; // 안전한 최소 선택
const GRID_COLS = Math.ceil(canvasWidth / CELL_SIZE);
const GRID_ROWS = Math.ceil(canvasHeight / CELL_SIZE);

let grid = [];

/******** 운동량 및 위치 배열 ********/
const X = new Float64Array(N);
const Y = new Float64Array(N);
const Px = new Float64Array(N);
const Py = new Float64Array(N);
const Mass = new Uint16Array(N);

/******** 분포함수 ********/
function MBSample(mass, beta) {
    const sigma = Math.sqrt(1 / (waterMass * beta));
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * sigma;
}

function configMomentum() {
    for (let i = 0; i < cafeN; i++) {
        Mass[i] = cafeMass;
        Px[i] = 0;
        Py[i] = 0;
    }

    for (let i = cafeN; i < N; i++) {
        Mass[i] = waterMass;
        Px[i] = waterMass * MBSample(waterMass, beta);
        Py[i] = waterMass * MBSample(waterMass, beta);
    }
}

function configPosition() {
    const gridSize = Math.sqrt(cafeN);
    const dx = 2 * RADIUS;
    const offsetX = ((gridSize - 1) / 2) * dx;
    const offsetY = ((gridSize - 1) / 2) * dx;

    let index = 0;
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            if (index >= cafeN) break;
            X[index] = i * dx - offsetX;
            Y[index] = j * dx - offsetY;
            index++;
        }
    }

    for (let i = cafeN; i < N; i++) {
        let positionX, positionY;
        do {
            positionX = Math.random() * canvasWidth - canvasWidth / 2;
            positionY = Math.random() * canvasHeight - canvasHeight / 2;
        } while (
            positionX > -offsetX && positionX < offsetX &&
            positionY > -offsetY && positionY < offsetY
        );

        X[i] = positionX;
        Y[i] = positionY;
    }
}

/******** grid 유틸 ********/
function gridIndex(cx, cy) {
    return cy * GRID_COLS + cx;
}

function initGrid() {
    grid = Array.from({ length: GRID_COLS * GRID_ROWS }, () => []);
}

function getCellCoords(x, y) {
    const cx = Math.floor((x + canvasWidth / 2) / CELL_SIZE);
    const cy = Math.floor((y + canvasHeight / 2) / CELL_SIZE);
    return { cx, cy };
}

function addParticlesToGrid() {
    for (let i = 0; i < N; i++) {
        const { cx, cy } = getCellCoords(X[i], Y[i]);

        if (cx < 0 || cx >= GRID_COLS || cy < 0 || cy >= GRID_ROWS) {
            continue;
        }

        grid[gridIndex(cx, cy)].push(i);
    }
}

/******** 충돌 해결 ********/
function resolveCollision(i, j) {
    const mi = Mass[i];
    const mj = Mass[j];

    const dx = X[j] - X[i];
    const dy = Y[j] - Y[i];
    const dist2 = dx * dx + dy * dy;

    if (dist2 >= COLLISION_DIST2) return;
    if (dist2 === 0) return;

    const distance = Math.sqrt(dist2);
    const nx = dx / distance;
    const ny = dy / distance;

    const dvx = Px[j] / mj - Px[i] / mi;
    const dvy = Py[j] / mj - Py[i] / mi;

    const dotProduct = dvx * nx + dvy * ny;

    // 이미 서로 멀어지는 중이면 패스
    if (dotProduct > 0) return;

    const mu = mi * mj / (mi + mj);

    // 기존 코드 스타일 유지
    const impulseX = 2 * mu * dvx;
    const impulseY = 2 * mu * dvy;

    Px[i] += impulseX;
    Py[i] += impulseY;
    Px[j] -= impulseX;
    Py[j] -= impulseY;

    // 겹침 보정
    const overlap = (COLLISION_DIST - distance) / 2;
    X[i] -= overlap * nx;
    Y[i] -= overlap * ny;
    X[j] += overlap * nx;
    Y[j] += overlap * ny;
}

function handleCollisionsGrid() {
    for (let i = 0; i < N; i++) {
        const { cx, cy } = getCellCoords(X[i], Y[i]);

        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                const nx = cx + ox;
                const ny = cy + oy;

                if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) {
                    continue;
                }

                const cell = grid[gridIndex(nx, ny)];

                for (const j of cell) {
                    if (j <= i) continue; // 중복 검사 방지
                    resolveCollision(i, j);
                }
            }
        }
    }
}

/******** 위치 업데이트 ********/
function updatePositions() {
    for (let i = 0; i < N; i++) {
        X[i] += Px[i] / Mass[i];
        Y[i] += Py[i] / Mass[i];

        // 벽 반사
        if (X[i] < -canvasWidth / 2 + RADIUS) {
            X[i] = -canvasWidth / 2 + RADIUS;
            Px[i] *= -1;
        } else if (X[i] > canvasWidth / 2 - RADIUS) {
            X[i] = canvasWidth / 2 - RADIUS;
            Px[i] *= -1;
        }

        if (Y[i] < -canvasHeight / 2 + RADIUS) {
            Y[i] = -canvasHeight / 2 + RADIUS;
            Py[i] *= -1;
        } else if (Y[i] > canvasHeight / 2 - RADIUS) {
            Y[i] = canvasHeight / 2 - RADIUS;
            Py[i] *= -1;
        }
    }

    initGrid();
    addParticlesToGrid();
    handleCollisionsGrid();
}

/******** 그리기 ********/
function drawParticles() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = "red";
    for (let i = 0; i < cafeN; i++) {
        ctx.beginPath();
        ctx.arc(
            X[i] + 0.5 * canvasWidth,
            0.5 * canvasHeight - Y[i],
            RADIUS,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    ctx.fillStyle = "blue";
    for (let i = cafeN; i < N; i++) {
        ctx.beginPath();
        ctx.arc(
            X[i] + 0.5 * canvasWidth,
            0.5 * canvasHeight - Y[i],
            RADIUS,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }
}

/******** 애니메이션 ********/
function animate() {
    if (!isPause) {
        updatePositions();
        drawParticles();
        updateStopwatch();
        id = requestAnimationFrame(animate);
    }
}

function startSimulation() {
    TEMP = Number(document.getElementById("temperature").value);
    beta = 1 / (k * TEMP);

    cancelAnimationFrame(id);
    isPause = true;

    configPosition();
    configMomentum();

    resetStopwatch();
    tStart = performance.now();

    isPause = false;
    updateStopwatch();

    document.getElementById("pause").disabled = false;
    document.getElementById("reset").disabled = false;
    document.getElementById("pause").textContent = "Pause";

    animate();
    console.log("Simulation started with TEMP:", TEMP);
}

function togglePause() {
    if (isPause) {
        const now = performance.now();
        if (pausedAt > 0) {
            pausedTotal += (now - pausedAt);
        }
        pausedAt = 0;
        isPause = false;
        document.getElementById("pause").textContent = "Pause";
        animate();
    } else {
        isPause = true;
        pausedAt = performance.now();
        cancelAnimationFrame(id);
        updateStopwatch();
        document.getElementById("pause").textContent = "Resume";
    }
}

function resetSimulation() {
    cancelAnimationFrame(id);
    isPause = true;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    resetStopwatch();
    document.getElementById("pause").textContent = "Pause";
    document.getElementById("pause").disabled = true;
    document.getElementById("reset").disabled = true;
}

document.getElementById("start").addEventListener("click", startSimulation);
document.getElementById("pause").addEventListener("click", togglePause);
document.getElementById("reset").addEventListener("click", resetSimulation);
