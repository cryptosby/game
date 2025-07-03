const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const portfolioValueElement = document.getElementById('portfolioValue');
const walletBalanceElement = document.getElementById('walletBalance');
const blockchainDepthElement = document.getElementById('blockchainDepth');
const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const messageButton = document.getElementById('messageButton');
const powerUpTimersElement = document.getElementById('powerUpTimers');

// --- Game Settings ---
let portfolioValue = 0; // Renamed from score
let walletBalance = 3; // Renamed from lives
let blockchainDepth = 1; // Renamed from level
let gamePaused = true;
let gameOver = false;
let gameWon = false;
let rightPressed = false;
let leftPressed = false;
let animationFrameId;
let activePowerUps = {}; // To track active power-ups and their timers
let fallingPowerUps = []; // To track falling power-ups
let particles = []; // For particle effects on block break

// --- Sound Synthesis (Tone.js) ---
const synth = new Tone.Synth().toDestination();
// Modified metalSynth for a brighter, money-like sound
const moneySynth = new Tone.MetalSynth({
  frequency: 500, // Higher frequency for a chime
  envelope: { attack: 0.001, decay: 0.2, release: 0.05 }, // Quicker decay, longer release
  harmonicity: 5.1, // More harmonics for a richer sound
  modulationIndex: 20,
  resonance: 6000, // Higher resonance
  octaves: 2,
}).toDestination();
moneySynth.volume.value = -10; // Adjust volume

const powerUpSynth = new Tone.FMSynth({
  harmonicity: 3.01,
  modulationIndex: 14,
  carrier: {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.01, release: 0.05 },
  },
  modulator: {
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0.01, release: 0.05 },
  },
}).toDestination();
powerUpSynth.volume.value = -10;

function playSound(type) {
  // Ensure Tone.js context is started by user interaction
  if (Tone.context.state !== 'running') {
    Tone.start();
  }

  try {
    switch (type) {
      case 'paddle':
        synth.triggerAttackRelease('C4', '16n');
        break;
      case 'brick': // Now uses moneySynth for a coin/money sound
        moneySynth.triggerAttackRelease('C5', '8n'); // Play a specific note for money sound
        break;
      case 'wall':
        synth.triggerAttackRelease('E3', '16n');
        break;
      case 'powerup':
        powerUpSynth.triggerAttackRelease('C5', '8n');
        break;
      case 'loseLife': // Lose a wallet balance
        synth.triggerAttackRelease('C3', '4n');
        break;
      case 'gameOver': // Wallet drained
        synth.triggerAttackRelease('G2', '2n');
        break;
      case 'levelUp': // Blockchain depth increased
        powerUpSynth.triggerAttackRelease('G5', '4n');
        break;
    }
  } catch (error) {
    console.error('Tone.js error:', error);
  }
}

// --- Transaction Ball Properties ---
let balls = []; // Array to hold multiple balls
const initialBallRadius = 8;
const initialBallSpeed = 4;

function createBall(
  x,
  y,
  dx,
  dy,
  radius = initialBallRadius,
  speed = initialBallSpeed,
  isSmartContract = false, // Renamed from isFireball
  smartContractTimer = 0
) {
  return {
    x: x,
    y: y,
    dx: (dx * speed) / initialBallSpeed, // Scale speed correctly
    dy: (dy * speed) / initialBallSpeed,
    radius: radius,
    speed: speed, // Store original speed for reference
    color: '#00ffcc', // Neon cyan
    glow: '#00ffcc',
    isSmartContract: isSmartContract, // Renamed
    smartContractDuration: 5000, // 5 seconds in milliseconds
    smartContractTimer: smartContractTimer,
    trail: [], // For motion trail effect
  };
}

function resetBall(ballInstance = null) {
  // Reset a specific ball or all balls if none specified
  if (ballInstance) {
    ballInstance.x = paddle.x + paddle.width / 2;
    ballInstance.y = paddle.y - ballInstance.radius - 2;
    ballInstance.dx =
      (Math.random() < 0.5 ? 1 : -1) * initialBallSpeed * Math.cos(Math.PI / 4); // Random initial angle
    ballInstance.dy = -initialBallSpeed * Math.sin(Math.PI / 4);
    ballInstance.isSmartContract = false;
    ballInstance.smartContractTimer = 0;
    ballInstance.speed = initialBallSpeed; // Reset speed
    ballInstance.radius = initialBallRadius; // Reset radius
    ballInstance.color = '#00ffcc';
    ballInstance.glow = '#00ffcc';
    ballInstance.trail = []; // Clear trail on reset
  } else {
    balls = [
      createBall(
        paddle.x + paddle.width / 2,
        paddle.y - initialBallRadius - 2,
        initialBallSpeed * Math.cos(Math.PI / 4),
        -initialBallSpeed * Math.sin(Math.PI / 4)
      ),
    ];
  }
}

// --- Mining Rig (Paddle) Properties ---
const initialPaddleHeight = 12;
const initialPaddleWidth = 90;
const paddleY = canvas.height - initialPaddleHeight - 20; // Positioned lower
let paddle = {
  height: initialPaddleHeight,
  width: initialPaddleWidth,
  x: (canvas.width - initialPaddleWidth) / 2,
  y: paddleY,
  color: 'rgba(0, 150, 200, 0.8)', // Semi-transparent blue
  glow: '#00aaff', // Light blue glow
  speed: 7,
  hodlTimer: 0, // Renamed from expandTimer
  hodlDuration: 10000, // 10 seconds
};

// --- Crypto Block Properties ---
const brickRowCount = 5;
const brickColumnCount = 8;
const brickPadding = 5; // Reduced padding
const brickOffsetTop = 40;
const brickOffsetLeft = 30;
let brickWidth; // Will be calculated dynamically
const brickHeight = 20;
let bricks = [];

// Comprehensive list of cryptocurrencies with their symbols, colors, and base health/value
// Using placeholder.co for stylized text logos within the blocks
const cryptoBricksData = [
  // Major Cryptos
  { symbol: 'BTC', name: 'Bitcoin', health: 3, color: '#F7931A', glow: '#FFD700', value: 100, text_color: 'FFFFFF' },
  { symbol: 'ETH', name: 'Ethereum', health: 2, color: '#627EEA', glow: '#8C9EFF', value: 70, text_color: 'FFFFFF' },
  { symbol: 'SOL', name: 'Solana', health: 2, color: '#9945FF', glow: '#C080FF', value: 60, text_color: 'FFFFFF' },
  { symbol: 'ADA', name: 'Cardano', health: 2, color: '#0033AD', glow: '#0066FF', value: 50, text_color: 'FFFFFF' },
  { symbol: 'XRP', name: 'Ripple', health: 1, color: '#23292F', glow: '#87CEEB', value: 40, text_color: 'FFFFFF' },
  { symbol: 'DOT', name: 'Polkadot', health: 2, color: '#E6007A', glow: '#FF3399', value: 55, text_color: 'FFFFFF' },
  { symbol: 'BNB', name: 'Binance Coin', health: 2, color: '#F3BA2F', glow: '#FFDA66', value: 65, text_color: '000000' },
  { symbol: 'LTC', name: 'Litecoin', health: 1, color: '#BEBEBE', glow: '#E0E0E0', value: 35, text_color: '000000' },
  { symbol: 'LINK', name: 'Chainlink', health: 1, color: '#2A5ADA', glow: '#6699FF', value: 45, text_color: 'FFFFFF' },
  { symbol: 'AVAX', name: 'Avalanche', health: 2, color: '#E84142', glow: '#FF6666', value: 58, text_color: 'FFFFFF' },
  // Memecoins (for visual appeal - using ticker as "logo")
  { symbol: 'DOGE', name: 'Dogecoin', health: 1, color: '#C2A633', glow: '#FFEB3B', value: 20, text_color: '000000' },
  { symbol: 'SHIB', name: 'Shiba Inu', health: 1, color: '#E4572E', glow: '#FF7F50', value: 15, text_color: 'FFFFFF' },
  { symbol: 'PEPE', name: 'Pepe Coin', health: 1, color: '#88B04B', glow: '#A8D072', value: 10, text_color: 'FFFFFF' },
  { symbol: 'FLOKI', name: 'Floki Inu', health: 1, color: '#FFD700', glow: '#FFE873', value: 12, text_color: '000000' },
  // Stablecoins (less value, but perhaps always present)
  { symbol: 'USDT', name: 'Tether', health: 1, color: '#50AF95', glow: '#70D0B5', value: 5, text_color: 'FFFFFF' },
  { symbol: 'USDC', name: 'USD Coin', health: 1, color: '#2775CA', glow: '#4795EA', value: 5, text_color: 'FFFFFF' },
  // Other interesting cryptos
  { symbol: 'XMR', name: 'Monero', health: 2, color: '#FF6600', glow: '#FF9933', value: 48, text_color: 'FFFFFF' },
  { symbol: 'ZEC', name: 'Zcash', health: 2, color: '#F3BA2F', glow: '#FFDA66', value: 42, text_color: '000000' },
  { symbol: 'FIL', name: 'Filecoin', health: 1, color: '#0090FF', glow: '#33CCFF', value: 38, text_color: 'FFFFFF' },
  { symbol: 'ICP', name: 'Internet Computer', health: 2, color: '#3147B5', glow: '#6688FF', value: 52, text_color: 'FFFFFF' },
];

function createBricks(blockchainDepth) {
  bricks = [];
  const cryptoCount = cryptoBricksData.length;
  // Recalculate brickWidth based on current canvas size
  brickWidth = (canvas.width - 2 * brickOffsetLeft - (brickColumnCount - 1) * brickPadding) / brickColumnCount;

  const rowsToCreate = Math.min(brickRowCount + Math.floor(blockchainDepth / 2), 8); // Add rows up to 8

  for (let c = 0; c < brickColumnCount; c++) {
    bricks[c] = [];
    for (let r = 0; r < rowsToCreate; r++) {
      const brickX = brickOffsetLeft + c * (brickWidth + brickPadding);
      const brickY = brickOffsetTop + r * (brickHeight + brickPadding);

      // Select a crypto brick type
      let cryptoIndex = (r + c + blockchainDepth) % cryptoCount;
      const baseCrypto = cryptoBricksData[cryptoIndex];

      // Increase health for higher levels slightly
      let health = baseCrypto.health + Math.floor(blockchainDepth / 3);
      if (blockchainDepth > 5 && Math.random() < 0.2) health++; // Randomly make some bricks tougher

      bricks[c][r] = {
        x: brickX,
        y: brickY,
        width: brickWidth,
        height: brickHeight,
        status: 1, // 1: active, 0: broken
        crypto: baseCrypto, // Store the crypto data
        health: health,
        initialHealth: health, // Store initial health for color calculation
        column: c, // Store column for resize recalculation
        row: r, // Store row for resize recalculation
      };
    }
  }
}

// --- Particle System ---
function Particle(x, y, color) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 3 + 1;
    this.speedX = Math.random() * 6 - 3; // Random horizontal speed
    this.speedY = Math.random() * 6 - 3; // Random vertical speed
    this.color = color;
    this.life = 60; // Frames to live
    this.alpha = 1;

    this.update = function() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life--;
        this.alpha = this.life / 60; // Fade out
    };

    this.draw = function() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
    };
}

// --- Power-Up Definitions (Crypto Themed) ---
const powerUpTypes = [
  { type: 'hodl', color: '#00ff00', glow: '#33ff33', symbol: '💎🙌' }, // Green - HODL (Expand Paddle)
  { type: 'fork', color: '#ffff00', glow: '#ffff66', symbol: '⛓️' }, // Yellow - Fork (Multi-ball)
  { type: 'smartContract', color: '#ff0000', glow: '#ff3333', symbol: '📜' }, // Red - Smart Contract (Fireball)
];
const powerUpDropChance = 0.2; // 20% chance to drop a power-up
const powerUpSpeed = 2;

function createPowerUp(x, y) {
  const randomType =
    powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
  fallingPowerUps.push({
    x: x,
    y: y,
    width: 20,
    height: 20,
    type: randomType.type,
    color: randomType.color,
    glow: randomType.glow,
    symbol: randomType.symbol, // Add symbol
    speed: powerUpSpeed,
  });
}

function activatePowerUp(type) {
  const now = Date.now();
  playSound('powerup');

  switch (type) {
    case 'hodl': // Renamed from expand
      paddle.width = initialPaddleWidth * 1.5;
      paddle.hodlTimer = now + paddle.hodlDuration;
      activePowerUps['hodl'] = paddle.hodlTimer;
      // Ensure paddle doesn't go off-screen
      if (paddle.x + paddle.width > canvas.width) {
        paddle.x = canvas.width - paddle.width;
      }
      break;
    case 'fork': // Renamed from multi
      const currentBalls = balls.length;
      // Limit max balls to avoid chaos
      const ballsToAdd = Math.min(2, 5 - currentBalls); // Add up to 2 more balls, max 5 total

      for (let i = 0; i < ballsToAdd; i++) {
        // Find an existing ball to split from (ideally the first active one)
        const sourceBall = balls.find((b) => b.y < canvas.height); // Find a ball still in play
        if (sourceBall) {
          // Create new balls near the source ball with slightly different angles
          const angleOffset =
            (Math.PI / 12) * (i + 1) * (Math.random() < 0.5 ? 1 : -1); // +/- 15 degrees offset
          const speed = Math.sqrt(sourceBall.dx ** 2 + sourceBall.dy ** 2);
          const currentAngle = Math.atan2(sourceBall.dy, sourceBall.dx);
          const newAngle = currentAngle + angleOffset;

          balls.push(
            createBall(
              sourceBall.x,
              sourceBall.y,
              Math.cos(newAngle), // dx component based on new angle
              Math.sin(newAngle), // dy component based on new angle
              sourceBall.radius,
              speed, // Use the source ball's speed
              sourceBall.isSmartContract, // Inherit smart contract status
              sourceBall.smartContractTimer // Inherit timer
            )
          );
        } else {
          // If no active ball found (unlikely), create a default new ball
          balls.push(
            createBall(
              paddle.x + paddle.width / 2,
              paddle.y - initialBallRadius - 2,
              initialBallSpeed * Math.cos(Math.PI / 3),
              -initialBallSpeed * Math.sin(Math.PI / 3)
            )
          );
        }
      }
      break;
    case 'smartContract': // Renamed from fire
      balls.forEach((ball) => {
        ball.isSmartContract = true;
        ball.smartContractTimer = now + ball.smartContractDuration;
        ball.color = '#ff6600'; // Orange smart contract color
        ball.glow = '#ff3300'; // Red glow
        activePowerUps['smartContract'] = ball.smartContractTimer; // Track the *last* activation time
      });
      break;
  }
  updatePowerUpTimers();
}

function deactivatePowerUp(type) {
  delete activePowerUps[type]; // Remove from active list
  switch (type) {
    case 'hodl': // Renamed from expand
      paddle.width = initialPaddleWidth;
      paddle.hodlTimer = 0;
      // Recenter paddle if needed after shrinking
      if (paddle.x + paddle.width > canvas.width) {
        paddle.x = canvas.width - paddle.width;
      } else if (paddle.x < 0) {
        paddle.x = 0;
      }
      break;
    case 'smartContract': // Renamed from fire
      // Only deactivate if no other smartContract powerup is active
      if (!Object.keys(activePowerUps).includes('smartContract')) {
        balls.forEach((ball) => {
          ball.isSmartContract = false;
          ball.smartContractTimer = 0;
          ball.color = '#00ffcc'; // Revert to normal color
          ball.glow = '#00ffcc';
        });
      }
      break;
    // Fork (Multi-ball) doesn't have a timed deactivation, balls just get lost
  }
  updatePowerUpTimers();
}

function updatePowerUpTimers() {
  powerUpTimersElement.innerHTML = '';
  const now = Date.now();
  for (const type in activePowerUps) {
    const expiryTime = activePowerUps[type];
    const timeLeft = Math.max(0, Math.ceil((expiryTime - now) / 1000));
    if (timeLeft > 0) {
      const li = document.createElement('li');
      let name = '';
      if (type === 'hodl') name = 'HODL';
      if (type === 'fork') name = 'Fork';
      if (type === 'smartContract') name = 'Smart Contract';
      li.textContent = `${name}: ${timeLeft}s`;
      powerUpTimersElement.appendChild(li);
    } else {
      // Timer expired, deactivate
      deactivatePowerUp(type);
    }
  }
}

// --- Drawing Functions ---
function drawBall(ball) {
  // Trail effect
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 15) { // Increased trail length for more prominent effect
    ball.trail.shift();
  }

  // Draw trail
  for (let i = 0; i < ball.trail.length; i++) {
    const alpha = (i / ball.trail.length) * 0.4; // Fade out, slightly less opaque
    ctx.beginPath();
    ctx.arc(
      ball.trail[i].x,
      ball.trail[i].y,
      ball.radius * (i / ball.trail.length),
      0,
      Math.PI * 2
    );
    ctx.fillStyle = ball.isSmartContract
      ? `rgba(255, 100, 0, ${alpha})`
      : `rgba(0, 255, 204, ${alpha})`;
    ctx.fill();
    ctx.closePath();
  }

  // Draw ball
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = ball.color;
  // Glowing effect
  ctx.shadowBlur = 20; // More intense glow
  ctx.shadowColor = ball.glow;
  ctx.fill();
  ctx.closePath();
  // Reset shadow for other elements
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

function drawPaddle() {
  ctx.beginPath();
  // Use roundRect for softer edges on paddle
  ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 5); // 5px border radius
  ctx.fillStyle = paddle.color;
  ctx.strokeStyle = paddle.glow; // Outline glow
  ctx.lineWidth = 3; // Thicker outline
  // Glowing effect
  ctx.shadowBlur = 15; // More intense glow
  ctx.shadowColor = paddle.glow;
  ctx.fill();
  ctx.stroke(); // Draw the glowing outline
  ctx.closePath();
  // Reset shadow and line width
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
}

function drawBricks() {
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < bricks[c]?.length; r++) {
      const brick = bricks[c][r];
      if (brick.status === 1) {
        ctx.beginPath();
        // Use roundRect for rounded corners on bricks
        ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 5); // 5px border radius

        // Calculate color based on health (fade towards a darker shade)
        const healthRatio = brick.health / brick.initialHealth;
        const baseColor = brick.crypto.color;
        let rVal, gVal, bVal;

        // Convert hex to RGB for health fading
        if (baseColor.startsWith('#')) {
          const hex = baseColor.substring(1);
          rVal = parseInt(hex.substring(0, 2), 16);
          gVal = parseInt(hex.substring(2, 4), 16);
          bVal = parseInt(hex.substring(4, 6), 16);
        } else { // Fallback, though all current colors are hex
          rVal = gVal = bVal = 100;
        }
        ctx.fillStyle = `rgba(${Math.floor(rVal * healthRatio)}, ${Math.floor(gVal * healthRatio)}, ${Math.floor(bVal * healthRatio)}, 0.9)`;


        // Apply subtle 3D effect / highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // Top/Left highlight
        ctx.lineWidth = 1;
        ctx.stroke(); // Draw highlight border first

        ctx.shadowBlur = 8; // Slightly more glow for bricks
        ctx.shadowColor = brick.crypto.glow;
        ctx.fill(); // Fill the main color

        // Draw crypto symbol/text prominently
        ctx.fillStyle = `#${brick.crypto.text_color}`; // Use specified text color
        ctx.font = `bold ${brickHeight * 0.6}px 'Press Start 2P'`; // Larger font size for symbol
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(brick.crypto.symbol, brick.x + brick.width / 2, brick.y + brick.height / 2 + 1); // Adjust position slightly for font baseline

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.closePath();
      }
    }
  }
}

function drawFallingPowerUps() {
  fallingPowerUps.forEach((p) => {
    ctx.beginPath();
    // Draw a simple shape (circle)
    ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width / 2, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    // Glow
    ctx.shadowBlur = 12; // Enhanced glow
    ctx.shadowColor = p.glow;
    ctx.fill();
    ctx.closePath();

    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Draw symbol inside
    ctx.fillStyle = '#000'; // Black symbol
    ctx.font = '16px Arial'; // Use a standard font that supports emojis for symbols
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.symbol, p.x + p.width / 2, p.y + p.height / 2 + 1); // Adjust position slightly
  });
}

function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
        particles[i].draw();
    }
}

// --- Collision Detection ---
function collisionDetection() {
  let activeBricksCount = 0;

  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < bricks[c]?.length; r++) {
      const brick = bricks[c][r];
      if (brick.status === 1) {
        activeBricksCount++;
        balls.forEach((ball) => {
          if (
            ball.x + ball.radius > brick.x &&
            ball.x - ball.radius < brick.x + brick.width &&
            ball.y + ball.radius > brick.y &&
            ball.y - ball.radius < brick.y + brick.height
          ) {
            if (ball.isSmartContract) { // Renamed from isFireball
              // Smart Contract destroys brick instantly, no bounce
              brick.status = 0;
              portfolioValue += brick.crypto.value; // Add crypto's value
              playSound('brick'); // Still play sound
              // Generate particles
              for (let i = 0; i < 10; i++) {
                  particles.push(new Particle(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.crypto.color));
              }
              // Chance to drop power-up
              if (Math.random() < powerUpDropChance) {
                createPowerUp(
                  brick.x + brick.width / 2,
                  brick.y + brick.height / 2
                );
              }
            } else {
              // Regular ball collision
              playSound('brick');
              ball.dy = -ball.dy; // Reverse vertical direction
              brick.health--;
              portfolioValue += Math.floor(brick.crypto.value / 5); // Less value for just hitting

              if (brick.health <= 0) {
                brick.status = 0;
                portfolioValue += Math.floor(brick.crypto.value / 2); // Bonus for destroying
                // Generate particles
                for (let i = 0; i < 10; i++) {
                    particles.push(new Particle(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.crypto.color));
                }
                // Chance to drop power-up
                if (Math.random() < powerUpDropChance) {
                  createPowerUp(
                    brick.x + brick.width / 2,
                    brick.y + brick.height / 2
                  );
                }
              }
            }
            updatePortfolioValue();
          }
        });
      }
    }
  }

  // Check for win condition
  if (activeBricksCount === 0 && !gameWon) {
    blockchainDepth++; // Renamed from level
    playSound('levelUp');
    showMessage(`Blockchain Depth ${blockchainDepth} Reached!`, true); // Pause for next level
    // Keep powerups active between levels for now
    createBricks(blockchainDepth);
    resetBall(); // Reset ball position for the new level
    // Keep paddle position and size
  }
}

// --- Game Logic Update ---
function update() {
  if (gamePaused || gameOver || gameWon) return; // Don't update if paused or finished

  const now = Date.now();

  // --- Paddle Movement ---
  if (rightPressed && paddle.x < canvas.width - paddle.width) {
    paddle.x += paddle.speed;
  } else if (leftPressed && paddle.x > 0) {
    paddle.x -= paddle.speed;
  }

  // --- Power-Up Timers ---
  if (paddle.hodlTimer > 0 && now > paddle.hodlTimer) { // Renamed from expandTimer
    deactivatePowerUp('hodl'); // Renamed from expand
  }
  // Check smartContract timer on each ball
  let anySmartContractActive = false;
  balls.forEach((ball) => {
    if (ball.isSmartContract && ball.smartContractTimer > 0 && now > ball.smartContractTimer) {
      // Check if this specific ball's timer expired
      ball.isSmartContract = false;
      ball.smartContractTimer = 0;
      ball.color = '#00ffcc';
      ball.glow = '#00ffcc';
    }
    if (ball.isSmartContract) {
      anySmartContractActive = true; // Mark if any ball is still a smartContract
    }
  });
  // If no balls are smartContracts anymore, ensure the power-up is marked inactive
  if (!anySmartContractActive && activePowerUps['smartContract']) {
    deactivatePowerUp('smartContract'); // This updates the UI timer list
  } else {
    updatePowerUpTimers(); // Update timers display continuously
  }

  // --- Ball Movement & Collision ---
  balls.forEach((ball, index) => {
    // Wall collisions (left/right)
    if (
      ball.x + ball.dx > canvas.width - ball.radius ||
      ball.x + ball.dx < ball.radius
    ) {
      ball.dx = -ball.dx;
      playSound('wall');
    }

    // Wall collision (top)
    if (ball.y + ball.dy < ball.radius) {
      ball.dy = -ball.dy;
      playSound('wall');
    }
    // Bottom collision (paddle or lose life)
    else if (ball.y + ball.radius > canvas.height - paddle.height - 15) {
      // Check near paddle height first
      if (
        ball.x + ball.radius > paddle.x &&
        ball.x - ball.radius < paddle.x + paddle.width &&
        ball.y + ball.radius > paddle.y
      ) {
        // Collision with paddle
        playSound('paddle');
        // Calculate bounce angle based on where it hit the paddle
        let collidePoint = ball.x - (paddle.x + paddle.width / 2);
        collidePoint = collidePoint / (paddle.width / 2); // Normalize to -1 to 1
        let angle = collidePoint * (Math.PI / 3); // Max bounce angle 60 degrees

        // Recalculate speed components based on angle and original speed
        const currentSpeed = Math.sqrt(ball.dx ** 2 + ball.dy ** 2); // Use current speed in case it changed
        ball.dx = currentSpeed * Math.sin(angle);
        ball.dy = -currentSpeed * Math.cos(angle);

        // Prevent ball getting stuck inside paddle slightly
        ball.y = paddle.y - ball.radius - 1;
      } else if (ball.y + ball.radius > canvas.height) {
        // Ball missed paddle and hit bottom
        balls.splice(index, 1); // Remove this ball

        if (balls.length === 0) {
          // Check if it was the last ball
          walletBalance--; // Renamed from lives
          playSound('loseLife');
          updateWalletBalance();
          if (walletBalance > 0) {
            showMessage('Wallet Balance Reduced! Try Again!', true); // Pause
            resetPaddle();
            resetBall(); // Create a new single ball
          } else {
            gameOver = true;
            playSound('gameOver');
            showMessage('Wallet Drained! Game Over!', false);
          }
        }
      }
    }

    // Move ball
    ball.x += ball.dx;
    ball.y += ball.dy;
  });

  // --- Crypto Block Collision ---
  collisionDetection(); // Handles ball vs brick

  // --- Falling Power-Ups ---
  for (let i = fallingPowerUps.length - 1; i >= 0; i--) {
    const p = fallingPowerUps[i];
    p.y += p.speed;

    // Collision with paddle
    if (
      p.x < paddle.x + paddle.width &&
      p.x + p.width > paddle.x &&
      p.y < paddle.y + paddle.height &&
      p.y + p.height > paddle.y
    ) {
      activatePowerUp(p.type);
      fallingPowerUps.splice(i, 1); // Remove collected power-up
    }
    // Remove if it falls off screen
    else if (p.y > canvas.height) {
      fallingPowerUps.splice(i, 1);
    }
  }

  // --- Update Particles ---
  for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      if (particles[i].life <= 0) {
          particles.splice(i, 1);
      }
  }
}

// --- Drawing Loop ---
function draw() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw elements
  drawBricks();
  drawPaddle();
  balls.forEach(drawBall); // Draw all active balls
  drawFallingPowerUps();
  drawParticles(); // Draw particles
}

// --- Game Loop ---
function gameLoop(timestamp) {
  update(); // Update game state
  draw(); // Render game state

  if (!gameOver && !gameWon) {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

// --- UI Updates ---
function updatePortfolioValue() {
  portfolioValueElement.textContent = `Portfolio Value: ${portfolioValue}`;
}

function updateWalletBalance() {
  walletBalanceElement.textContent = `Wallet Balance: ${walletBalance}`;
}

function updateBlockchainDepth() {
  blockchainDepthElement.textContent = `Blockchain Depth: ${blockchainDepth}`;
}

function showMessage(text, pauseGame = false) {
  messageText.textContent = text;
  messageBox.style.display = 'block';
  gamePaused = pauseGame; // Pause if needed (e.g., between levels, try again)
  if (!pauseGame && (gameOver || gameWon)) {
    messageButton.textContent = 'Re-mine Portfolio?'; // Play Again
  } else if (pauseGame) {
    messageButton.textContent = 'Continue';
  } else {
    messageButton.textContent = 'OK'; // Should not happen often
  }
}

function hideMessage() {
  messageBox.style.display = 'none';
  // Unpause only if the game wasn't already over
  if (!gameOver && !gameWon) {
    gamePaused = false;
    // Resume animation loop if it was paused
    if (!animationFrameId) {
      // Start loop if not running
      requestAnimationFrame(gameLoop);
    }
  }
}

// --- Event Listeners ---
document.addEventListener('keydown', keyDownHandler);
document.addEventListener('keyup', keyUpHandler);
document.addEventListener('mousemove', mouseMoveHandler);
messageButton.addEventListener('click', handleMessageButtonClick);

function keyDownHandler(e) {
  if (e.key === 'Right' || e.key === 'ArrowRight') {
    rightPressed = true;
  } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
    leftPressed = true;
  } else if (e.key === 'Enter' || e.key === ' ') {
    // Start game or resume from pause if message box is shown
    if (messageBox.style.display === 'block') {
      handleMessageButtonClick();
    } else if (gamePaused && !gameOver && !gameWon) {
      // If paused without message box (e.g., initial start)
      gamePaused = false;
      if (!animationFrameId) {
        // Start loop if not running
        requestAnimationFrame(gameLoop);
      }
    }
  }
}

function keyUpHandler(e) {
  if (e.key === 'Right' || e.key === 'ArrowRight') {
    leftPressed = false;
  } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
    leftPressed = false;
  }
}

function mouseMoveHandler(e) {
  // Get the bounding rectangle of the canvas
  const containerRect = canvas.getBoundingClientRect();
  // Calculate the scale factor if the canvas is resized by CSS
  const scaleX = canvas.width / containerRect.width;
  // Calculate mouse X relative to the canvas, accounting for scaling
  const mouseX = (e.clientX - containerRect.left) * scaleX;

  // Ensure mouseX is within canvas bounds before updating paddle position
  if (mouseX > 0 && mouseX < canvas.width) {
    paddle.x = mouseX - paddle.width / 2;
    // Clamp paddle position within canvas bounds
    if (paddle.x < 0) {
      paddle.x = 0;
    }
    if (paddle.x + paddle.width > canvas.width) {
      paddle.x = canvas.width - paddle.width;
    }
  }
}

function handleMessageButtonClick() {
  if (gameOver || gameWon) {
    // Restart game
    document.location.reload(); // Simple way to reset everything
  } else {
    // Just hide message and unpause
    hideMessage();
  }
}

function resetPaddle() {
  paddle.x = (canvas.width - initialPaddleWidth) / 2;
  paddle.width = initialPaddleWidth;
  paddle.hodlTimer = 0; // Renamed from expandTimer
  // Clear hodl powerup if active
  if (activePowerUps['hodl']) {
    delete activePowerUps['hodl'];
    updatePowerUpTimers();
  }
}

// --- Game Initialization ---
function initGame() {
  portfolioValue = 0;
  walletBalance = 3;
  blockchainDepth = 1;
  gameOver = false;
  gameWon = false;
  gamePaused = true;
  activePowerUps = {};
  fallingPowerUps = [];
  particles = []; // Clear particles on new game
  updatePortfolioValue();
  updateWalletBalance();
  updateBlockchainDepth();
  updatePowerUpTimers();
  resetPaddle();
  createBricks(blockchainDepth);
  resetBall();
  showMessage('Press Enter or Click Continue to Start Blockchain Battle!', true);
  draw(); // Initial draw to show the game state before starting
}

// Ensure the game initializes after the window and all resources are loaded
window.onload = function() {
    // Initial canvas dimensions setup
    const container = canvas.parentElement;
    canvas.width = container.clientWidth > 600 ? 600 : container.clientWidth - 20; // Max 600px, or container width minus padding
    canvas.height = canvas.width * (450 / 600); // Maintain aspect ratio

    // Recalculate brick width based on initial canvas size
    brickWidth = (canvas.width - 2 * brickOffsetLeft - (brickColumnCount - 1) * brickPadding) / brickColumnCount;

    initGame();
};

// Add a resize listener to make the canvas responsive
window.addEventListener('resize', function() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth > 600 ? 600 : container.clientWidth - 20;
    canvas.height = canvas.width * (450 / 600);

    // Recalculate brick width and update brick positions
    brickWidth = (canvas.width - 2 * brickOffsetLeft - (brickColumnCount - 1) * brickPadding) / brickColumnCount;
    bricks.forEach(col => {
        col.forEach(brick => {
            if (brick.status === 1) { // Only update active bricks
                brick.width = brickWidth;
                brick.x = brickOffsetLeft + brick.column * (brickWidth + brickPadding);
            }
        });
    });
    paddle.x = (canvas.width - paddle.width) / 2;
    paddle.y = canvas.height - initialPaddleHeight - 20; // Re-set Y position based on new height

    draw(); // Redraw the game immediately after resize
});
