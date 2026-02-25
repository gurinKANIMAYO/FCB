/* ============================================
   VOID STORM — 弾幕シューティング Game Engine
   ============================================ */

// ---- Canvas Setup ----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ---- Constants ----
const PLAYER_RADIUS = 6;
const PLAYER_HITBOX = 3;
const PLAYER_SPEED = 8;
const PLAYER_SLOW_SPEED = 1.8;
const PLAYER_BULLET_SPEED = 10;
const PLAYER_FIRE_RATE = 6; // frames between shots
const MAX_LIVES = 3;
const INVINCIBILITY_FRAMES = 120;
const BOSS_ENTER_DURATION = 120;
const MAX_ENEMY_BULLETS = 300;
const BULLET_MAX_AGE = 600;
const MAX_BOMBS = 3;
const BOMB_INVINCIBLE_FRAMES = 90;
const PATTERN_COOLDOWN = 40;

// ---- Colors ----
const COLORS = {
    playerBody: '#00f5ff',
    playerGlow: 'rgba(0,245,255,0.4)',
    playerHitbox: '#ffffff',
    playerBullet: '#39ff14',
    playerBulletGlow: 'rgba(57,255,20,0.4)',
    bossBody: '#ff2d95',
    bossGlow: 'rgba(255,45,149,0.4)',
    bossHealthBar: '#ff2d95',
    bossHealthBg: 'rgba(255,255,255,0.1)',
    bulletColors: ['#ff2d95', '#ff6a00', '#ffd700', '#ff00ff', '#4d8aff', '#00f5ff'],
    particleColors: ['#ff2d95', '#ff6a00', '#ffd700', '#00f5ff', '#ff00ff', '#39ff14'],
    starColors: ['#ffffff', '#aaddff', '#ffddaa', '#ddaaff'],
};

// ---- Game State ----
let gameState = 'title'; // title, playing, gameover
let score = 0;
let lives = MAX_LIVES;
let wave = 1;
let bombs = MAX_BOMBS;
let invincibleTimer = 0;
let frameCount = 0;
let fireTimer = 0;
let waveTimer = 0;
let waveAnnounceDuration = 0;
let shakeTimer = 0;
let shakeIntensity = 0;
let lastTime = 0;
let graze = 0;
let bombFlashTimer = 0;
let patternCooldown = 0;
let lastTapTime = 0;

// ---- Input ----
const keys = {};
let mouseX = 0, mouseY = 0;
let mouseDown = false;
let touchActive = false;
let touchX = 0, touchY = 0;
let touchOffsetX = 0, touchOffsetY = 0; // offset so finger doesn't cover player
const TOUCH_OFFSET_Y = -60; // player appears above touch point

window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keys[e.code] = false; });
window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
window.addEventListener('mousedown', e => { mouseDown = true; });
window.addEventListener('mouseup', e => { mouseDown = false; });

// ---- Touch Input ----
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    touchActive = true;
    touchX = t.clientX;
    touchY = t.clientY + TOUCH_OFFSET_Y;
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    touchX = t.clientX;
    touchY = t.clientY + TOUCH_OFFSET_Y;
}, { passive: false });

canvas.addEventListener('touchend', e => {
    e.preventDefault();
    touchActive = false;
}, { passive: false });

canvas.addEventListener('touchcancel', e => {
    touchActive = false;
}, { passive: false });

// ---- Player ----
const player = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    trail: [],
};

function resetPlayer() {
    player.x = canvas.width / 2;
    player.y = canvas.height * 0.8;
    player.vx = 0;
    player.vy = 0;
    player.trail = [];
}

// ---- Object Pools ----
let playerBullets = [];
let enemyBullets = [];
let particles = [];
let stars = [];
let boss = null;

// ---- Stars (Background) ----
function initStars() {
    stars = [];
    for (let i = 0; i < 200; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 0.5 + 0.1,
            alpha: Math.random() * 0.6 + 0.2,
            twinkleSpeed: Math.random() * 0.03 + 0.01,
            twinkleOffset: Math.random() * Math.PI * 2,
            color: COLORS.starColors[Math.floor(Math.random() * COLORS.starColors.length)],
        });
    }
}

// ---- Particle System ----
function spawnParticles(x, y, count, color, speedMul = 1, sizeMul = 1) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (Math.random() * 3 + 1) * speedMul;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: Math.random() * 0.03 + 0.01,
            size: (Math.random() * 4 + 2) * sizeMul,
            color: color || COLORS.particleColors[Math.floor(Math.random() * COLORS.particleColors.length)],
        });
    }
}

function spawnExplosion(x, y, count = 30) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        const color = COLORS.particleColors[Math.floor(Math.random() * COLORS.particleColors.length)];
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: Math.random() * 0.015 + 0.005,
            size: Math.random() * 6 + 3,
            color,
        });
    }
}

// ---- Boss System ----
function createBoss(waveNum) {
    const baseHP = 200 + waveNum * 120;
    return {
        x: canvas.width / 2,
        y: -80,
        targetY: canvas.height * 0.15,
        radius: 30 + Math.min(waveNum * 2, 20),
        hp: baseHP,
        maxHP: baseHP,
        phase: 0,
        phaseTimer: 0,
        enterTimer: BOSS_ENTER_DURATION,
        alive: true,
        color: COLORS.bossBody,
        angle: 0,
        pulsePhase: 0,
        patterns: getBossPatterns(waveNum),
        currentPattern: 0,
        patternTimer: 0,
    };
}

function getBossPatterns(waveNum) {
    // Capped scaling to prevent unfair difficulty
    const w = Math.min(waveNum, 10);
    const patterns = [
        { type: 'radial', interval: 14, bulletCount: 12 + w * 3, speed: 2.2 + w * 0.15, duration: 160 },
        { type: 'spiral', interval: 4, arms: 3 + Math.min(w, 4), speed: 2.5 + w * 0.12, duration: 200 },
        { type: 'flower', interval: 5, petals: 4 + Math.min(w, 6), speed: 2.2 + w * 0.15, duration: 180 },
        { type: 'aimed', interval: 10, spread: 3 + Math.min(w * 2, 12), speed: 3.5 + w * 0.2, duration: 120 },
        { type: 'random', interval: 5, count: 2 + Math.min(w, 6), speed: 2.5 + w * 0.15, duration: 150 },
    ];

    // Each wave uses a subset of patterns, cycling through
    const selected = [];
    for (let i = 0; i < 3 + Math.min(waveNum, 4); i++) {
        selected.push(patterns[i % patterns.length]);
    }
    return selected;
}

// ---- Bullet Patterns ----
function fireBossPattern(b, pattern) {
    const cx = b.x, cy = b.y;
    switch (pattern.type) {
        case 'radial': {
            const count = pattern.bulletCount;
            const angleOffset = b.angle;
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2 + angleOffset;
                spawnEnemyBullet(cx, cy, Math.cos(a) * pattern.speed, Math.sin(a) * pattern.speed);
            }
            b.angle += 0.15;
            break;
        }
        case 'spiral': {
            for (let arm = 0; arm < pattern.arms; arm++) {
                const a = b.angle + (arm / pattern.arms) * Math.PI * 2;
                spawnEnemyBullet(cx, cy, Math.cos(a) * pattern.speed, Math.sin(a) * pattern.speed);
            }
            b.angle += 0.12;
            break;
        }
        case 'flower': {
            const petals = pattern.petals;
            const t = b.patternTimer * 0.05;
            for (let i = 0; i < petals; i++) {
                const baseAngle = (i / petals) * Math.PI * 2;
                const wobble = Math.sin(t * 3 + i) * 0.3;
                const a = baseAngle + wobble + b.angle;
                spawnEnemyBullet(cx, cy, Math.cos(a) * pattern.speed, Math.sin(a) * pattern.speed, '#ff00ff');
            }
            b.angle += 0.08;
            break;
        }
        case 'aimed': {
            const dx = player.x - cx;
            const dy = player.y - cy;
            const baseAngle = Math.atan2(dy, dx);
            const spread = pattern.spread;
            for (let i = 0; i < spread; i++) {
                const a = baseAngle + (i - (spread - 1) / 2) * 0.12;
                spawnEnemyBullet(cx, cy, Math.cos(a) * pattern.speed, Math.sin(a) * pattern.speed, '#ffd700');
            }
            break;
        }
        case 'random': {
            for (let i = 0; i < pattern.count; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = pattern.speed * (0.7 + Math.random() * 0.6);
                spawnEnemyBullet(cx, cy, Math.cos(a) * s, Math.sin(a) * s);
            }
            break;
        }
    }
}

function spawnEnemyBullet(x, y, vx, vy, color) {
    enemyBullets.push({
        x, y, vx, vy,
        radius: 4,
        color: color || COLORS.bulletColors[Math.floor(Math.random() * COLORS.bulletColors.length)],
        age: 0,
    });
}

function spawnPlayerBullet() {
    if (fireTimer > 0) return;
    fireTimer = PLAYER_FIRE_RATE;
    playerBullets.push({
        x: player.x - 6,
        y: player.y - 10,
        vy: -PLAYER_BULLET_SPEED,
    });
    playerBullets.push({
        x: player.x + 6,
        y: player.y - 10,
        vy: -PLAYER_BULLET_SPEED,
    });
}

// ---- Collision ----
function circleCollide(x1, y1, r1, x2, y2, r2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return dx * dx + dy * dy < (r1 + r2) * (r1 + r2);
}

// ---- Game Logic ----
function startGame() {
    gameState = 'playing';
    score = 0;
    lives = MAX_LIVES;
    bombs = MAX_BOMBS;
    wave = 1;
    graze = 0;
    invincibleTimer = 0;
    bombFlashTimer = 0;
    patternCooldown = 0;
    frameCount = 0;
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    resetPlayer();
    initStars();
    startWave(1);
    updateHUD();
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('gameover-screen').style.display = 'none';
}

function startWave(num) {
    wave = num;
    boss = createBoss(num);
    waveAnnounceDuration = 120;
    enemyBullets = [];
    document.getElementById('wave-announce-num').textContent = num;
    document.getElementById('wave-announce').style.display = 'flex';
    const waveText = document.querySelector('.wave-text');
    waveText.style.animation = 'none';
    waveText.offsetHeight; // reflow
    waveText.style.animation = 'waveAnnounce 2s ease-in-out forwards';
    setTimeout(() => {
        document.getElementById('wave-announce').style.display = 'none';
    }, 2000);
    updateHUD();
}

function playerHit() {
    if (invincibleTimer > 0) return;
    lives--;
    invincibleTimer = INVINCIBILITY_FRAMES;
    shakeTimer = 20;
    shakeIntensity = 8;
    spawnExplosion(player.x, player.y, 40);

    // Death bomb: clear bullets near player on hit to prevent chain deaths
    const clearRadius = 120;
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        const dx = b.x - player.x;
        const dy = b.y - player.y;
        if (dx * dx + dy * dy < clearRadius * clearRadius) {
            spawnParticles(b.x, b.y, 2, b.color, 0.5, 0.3);
            enemyBullets.splice(i, 1);
        }
    }

    updateHUD();
    if (lives <= 0) {
        gameOver();
    }
}

// ---- Bomb System ----
function useBomb() {
    if (bombs <= 0 || gameState !== 'playing') return;
    bombs--;
    invincibleTimer = Math.max(invincibleTimer, BOMB_INVINCIBLE_FRAMES);
    bombFlashTimer = 30;
    shakeTimer = 15;
    shakeIntensity = 6;
    score += enemyBullets.length * 5;

    // Clear ALL enemy bullets with flashy effect
    for (const b of enemyBullets) {
        spawnParticles(b.x, b.y, 3, '#ffffff', 0.8, 0.5);
    }
    enemyBullets = [];
    spawnExplosion(player.x, player.y, 50);
    updateHUD();
}

function gameOver() {
    gameState = 'gameover';
    spawnExplosion(player.x, player.y, 80);
    document.getElementById('final-score-value').textContent = score.toLocaleString();
    document.getElementById('final-wave-value').textContent = wave;
    document.getElementById('gameover-screen').style.display = 'flex';
}

function updateHUD() {
    document.getElementById('score-value').textContent = score.toLocaleString();
    document.getElementById('wave-value').textContent = wave;
    let hearts = '';
    for (let i = 0; i < MAX_LIVES; i++) {
        hearts += i < lives ? '♥' : '♡';
    }
    document.getElementById('lives-value').textContent = hearts;
    document.getElementById('bombs-value').textContent = '💣'.repeat(bombs) + '○'.repeat(MAX_BOMBS - bombs);
}

// ---- Update ----
function update() {
    if (gameState !== 'playing') return;
    frameCount++;
    if (fireTimer > 0) fireTimer--;
    if (invincibleTimer > 0) invincibleTimer--;
    if (shakeTimer > 0) shakeTimer--;
    if (waveAnnounceDuration > 0) waveAnnounceDuration--;
    if (bombFlashTimer > 0) bombFlashTimer--;
    if (patternCooldown > 0) patternCooldown--;

    // Score ticks up with time
    if (frameCount % 6 === 0) {
        score += 1 + wave;
        updateHUD();
    }

    // ---- Player Movement ----
    if (touchActive) {
        // Touch: smoothly move toward touch position
        const tdx = touchX - player.x;
        const tdy = touchY - player.y;
        const dist = Math.sqrt(tdx * tdx + tdy * tdy);
        if (dist > 2) {
            const moveSpeed = Math.min(dist * 0.15, PLAYER_SPEED);
            player.x += (tdx / dist) * moveSpeed;
            player.y += (tdy / dist) * moveSpeed;
        }
    } else {
        // Keyboard movement
        const slow = keys['shift'] || keys['ShiftLeft'] || keys['ShiftRight'];
        const speed = slow ? PLAYER_SLOW_SPEED : PLAYER_SPEED;
        let dx = 0, dy = 0;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }
        player.x += dx * speed;
        player.y += dy * speed;
    }

    // Clamp player
    player.x = Math.max(PLAYER_RADIUS, Math.min(canvas.width - PLAYER_RADIUS, player.x));
    player.y = Math.max(PLAYER_RADIUS, Math.min(canvas.height - PLAYER_RADIUS, player.y));

    // Player trail
    player.trail.push({ x: player.x, y: player.y, life: 1 });
    if (player.trail.length > 20) player.trail.shift();

    // ---- Player Shooting ----
    // Touch: auto-fire while touching
    if (keys[' '] || keys['space'] || mouseDown || touchActive) {
        spawnPlayerBullet();
    }

    // ---- Update Player Bullets ----
    for (let i = playerBullets.length - 1; i >= 0; i--) {
        const b = playerBullets[i];
        b.y += b.vy;
        if (b.y < -20) {
            playerBullets.splice(i, 1);
            continue;
        }
        // Hit boss
        if (boss && boss.alive && boss.enterTimer <= 0) {
            if (circleCollide(b.x, b.y, 3, boss.x, boss.y, boss.radius)) {
                boss.hp -= 5;
                score += 10;
                spawnParticles(b.x, b.y, 5, COLORS.playerBullet, 0.5, 0.5);
                playerBullets.splice(i, 1);
                if (boss.hp <= 0) {
                    bossDefeated();
                }
                updateHUD();
            }
        }
    }

    // ---- Update Boss ----
    if (boss && boss.alive) {
        if (boss.enterTimer > 0) {
            boss.enterTimer--;
            boss.y += (boss.targetY - boss.y) * 0.03;
        } else {
            // Boss movement — gentle sway
            boss.x = canvas.width / 2 + Math.sin(frameCount * 0.01) * (canvas.width * 0.25);
            boss.y = boss.targetY + Math.sin(frameCount * 0.015) * 30;

            // Fire patterns
            const pattern = boss.patterns[boss.currentPattern];
            boss.patternTimer++;
            // Only fire if under bullet cap and not in cooldown
            if (waveAnnounceDuration <= 0 && patternCooldown <= 0 &&
                enemyBullets.length < MAX_ENEMY_BULLETS &&
                boss.patternTimer % pattern.interval === 0) {
                fireBossPattern(boss, pattern);
            }
            if (boss.patternTimer >= pattern.duration) {
                boss.patternTimer = 0;
                boss.currentPattern = (boss.currentPattern + 1) % boss.patterns.length;
                boss.angle = 0;
                patternCooldown = PATTERN_COOLDOWN; // brief gap between patterns
            }
        }
        boss.pulsePhase += 0.05;
    }

    // ---- Update Enemy Bullets ----
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.age++;

        // Off screen or too old (prevents infinite buildup)
        if (b.x < -50 || b.x > canvas.width + 50 || b.y < -50 || b.y > canvas.height + 50 || b.age > BULLET_MAX_AGE) {
            enemyBullets.splice(i, 1);
            continue;
        }

        // Graze detection (near miss bonus)
        const grazeDist = 20;
        const gdx = player.x - b.x;
        const gdy = player.y - b.y;
        const gd = Math.sqrt(gdx * gdx + gdy * gdy);
        if (gd < grazeDist && gd > PLAYER_HITBOX + b.radius && b.age > 10) {
            score += 2;
            graze++;
            spawnParticles(player.x, player.y, 1, '#ffffff', 0.3, 0.3);
        }

        // Hit player
        if (circleCollide(player.x, player.y, PLAYER_HITBOX, b.x, b.y, b.radius)) {
            playerHit();
            enemyBullets.splice(i, 1);
        }
    }

    // ---- Update Particles ----
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life -= p.decay;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    // ---- Update Stars ----
    for (const s of stars) {
        s.y += s.speed;
        if (s.y > canvas.height) {
            s.y = 0;
            s.x = Math.random() * canvas.width;
        }
    }
}

function bossDefeated() {
    boss.alive = false;
    score += 500 * wave;
    spawnExplosion(boss.x, boss.y, 80);
    shakeTimer = 30;
    shakeIntensity = 12;

    // Clear all enemy bullets with visual effect
    for (const b of enemyBullets) {
        spawnParticles(b.x, b.y, 2, b.color, 0.5, 0.5);
    }
    enemyBullets = [];

    updateHUD();

    // Next wave after delay
    setTimeout(() => {
        if (gameState === 'playing') {
            startWave(wave + 1);
        }
    }, 2500);
}

// ---- Render ----
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Screen shake
    ctx.save();
    if (shakeTimer > 0) {
        const sx = (Math.random() - 0.5) * shakeIntensity * (shakeTimer / 20);
        const sy = (Math.random() - 0.5) * shakeIntensity * (shakeTimer / 20);
        ctx.translate(sx, sy);
    }

    // ---- Background ----
    // Gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#05051a');
    bgGrad.addColorStop(0.5, '#0a0a2e');
    bgGrad.addColorStop(1, '#100a28');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    for (const s of stars) {
        const twinkle = Math.sin(frameCount * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7;
        ctx.globalAlpha = s.alpha * twinkle;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- Player Trail ----
    for (let i = 0; i < player.trail.length; i++) {
        const t = player.trail[i];
        const alpha = (i / player.trail.length) * 0.3;
        ctx.fillStyle = `rgba(0,245,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, PLAYER_RADIUS * (i / player.trail.length), 0, Math.PI * 2);
        ctx.fill();
    }

    // ---- Player ----
    if (gameState === 'playing') {
        const visible = invincibleTimer <= 0 || Math.floor(invincibleTimer / 4) % 2 === 0;
        if (visible) {
            // Outer glow
            ctx.shadowColor = COLORS.playerBody;
            ctx.shadowBlur = 20;
            ctx.fillStyle = COLORS.playerGlow;
            ctx.beginPath();
            ctx.arc(player.x, player.y, PLAYER_RADIUS + 6, 0, Math.PI * 2);
            ctx.fill();

            // Body (triangle ship)
            ctx.shadowBlur = 15;
            ctx.fillStyle = COLORS.playerBody;
            ctx.beginPath();
            ctx.moveTo(player.x, player.y - PLAYER_RADIUS - 4);
            ctx.lineTo(player.x - PLAYER_RADIUS - 2, player.y + PLAYER_RADIUS + 2);
            ctx.lineTo(player.x + PLAYER_RADIUS + 2, player.y + PLAYER_RADIUS + 2);
            ctx.closePath();
            ctx.fill();

            // Hitbox indicator (when slow mode or touch)
            const slow = keys['shift'] || keys['ShiftLeft'] || keys['ShiftRight'] || touchActive;
            if (slow) {
                ctx.fillStyle = COLORS.playerHitbox;
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(player.x, player.y, PLAYER_HITBOX + 1, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.shadowBlur = 0;
        }
    }

    // ---- Player Bullets ----
    ctx.shadowColor = COLORS.playerBullet;
    ctx.shadowBlur = 8;
    for (const b of playerBullets) {
        ctx.fillStyle = COLORS.playerBulletGlow;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.playerBullet;
        ctx.fillRect(b.x - 1.5, b.y - 6, 3, 12);
    }
    ctx.shadowBlur = 0;

    // ---- Boss ----
    if (boss && boss.alive) {
        const pulse = Math.sin(boss.pulsePhase) * 0.2 + 1;
        const hpRatio = boss.hp / boss.maxHP;

        // Boss glow
        ctx.shadowColor = boss.color;
        ctx.shadowBlur = 30 * pulse;
        ctx.fillStyle = COLORS.bossGlow;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, boss.radius * 1.5 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Boss body — hexagonal shape
        ctx.fillStyle = boss.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + boss.pulsePhase * 0.5;
            const r = boss.radius * pulse;
            const px = boss.x + Math.cos(a) * r;
            const py = boss.y + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // Boss inner core
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(boss.pulsePhase * 2) * 0.2})`;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, boss.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Orbiting rings
        for (let i = 0; i < 3; i++) {
            const orbitAngle = boss.pulsePhase * (1 + i * 0.3) + i * (Math.PI * 2 / 3);
            const orbitR = boss.radius * 1.3;
            const ox = boss.x + Math.cos(orbitAngle) * orbitR;
            const oy = boss.y + Math.sin(orbitAngle) * orbitR;
            ctx.fillStyle = `rgba(255,45,149,${0.3 + i * 0.1})`;
            ctx.beginPath();
            ctx.arc(ox, oy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;

        // HP Bar
        const hpBarWidth = 200;
        const hpBarHeight = 6;
        const hpX = boss.x - hpBarWidth / 2;
        const hpY = boss.y - boss.radius - 25;
        ctx.fillStyle = COLORS.bossHealthBg;
        ctx.fillRect(hpX, hpY, hpBarWidth, hpBarHeight);
        const hpGrad = ctx.createLinearGradient(hpX, hpY, hpX + hpBarWidth * hpRatio, hpY);
        hpGrad.addColorStop(0, '#ff2d95');
        hpGrad.addColorStop(1, '#ff6a00');
        ctx.fillStyle = hpGrad;
        ctx.fillRect(hpX, hpY, hpBarWidth * hpRatio, hpBarHeight);
        // HP bar glow
        ctx.shadowColor = '#ff2d95';
        ctx.shadowBlur = 8;
        ctx.fillRect(hpX, hpY, hpBarWidth * hpRatio, hpBarHeight);
        ctx.shadowBlur = 0;
    }

    // ---- Enemy Bullets ----
    for (const b of enemyBullets) {
        // Fade bullets near end of life
        const ageFade = b.age > BULLET_MAX_AGE * 0.75 ? 1 - (b.age - BULLET_MAX_AGE * 0.75) / (BULLET_MAX_AGE * 0.25) : 1;
        // Glow
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.3 * ageFade;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius + 4, 0, Math.PI * 2);
        ctx.fill();
        // Core
        ctx.globalAlpha = ageFade;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        // White center
        ctx.fillStyle = `rgba(255,255,255,${0.6 * ageFade})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // ---- Particles ----
    for (const p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // ---- Graze Counter ----
    if (gameState === 'playing' && graze > 0) {
        ctx.font = '12px Orbitron';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText(`GRAZE: ${graze}`, canvas.width / 2, canvas.height - 20);
    }

    // ---- Bomb Flash Effect ----
    if (bombFlashTimer > 0) {
        const flashAlpha = (bombFlashTimer / 30) * 0.4;
        ctx.fillStyle = `rgba(0,245,255,${flashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.restore();
}

// ---- Game Loop ----
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    lastTime = timestamp;

    update();
    render();
    requestAnimationFrame(gameLoop);
}

// ---- Event Bindings ----
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);

// Also start on Enter key + Bomb on X
window.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        if (gameState === 'title' || gameState === 'gameover') {
            startGame();
        }
    }
    if (e.key === 'x' || e.key === 'X') {
        useBomb();
    }
});

// Double-tap to bomb (mobile)
canvas.addEventListener('touchstart', e => {
    const now = Date.now();
    if (now - lastTapTime < 300 && gameState === 'playing') {
        useBomb();
    }
    lastTapTime = now;
}, { passive: true });

// ---- Init ----
initStars();
requestAnimationFrame(gameLoop);


