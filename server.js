const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const publicDir = path.join(__dirname, 'public');
const leaderboardFile = path.join(__dirname, 'leaderboard.json');

app.use(express.static(publicDir));
app.get('/health', (_, res) => res.json({ ok: true, service: 'online-rogue-beta-deploy' }));
app.get('*', (_, res) => res.sendFile(path.join(publicDir, 'index.html')));

function loadLeaderboard() {
  try {
    return JSON.parse(fs.readFileSync(leaderboardFile, 'utf8'));
  } catch {
    return [];
  }
}
function saveLeaderboard(entries) {
  fs.writeFileSync(leaderboardFile, JSON.stringify(entries, null, 2), 'utf8');
}
let leaderboard = loadLeaderboard();

const rooms = new Map();

function id4() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}
function makeRoomCode() {
  let code = id4();
  while (rooms.has(code)) code = id4();
  return code;
}
function defaultPlayer(socketId, name, cls) {
  return {
    id: socketId,
    name: name || '玩家',
    cls: cls || 'swordsman',
    x: 0,
    y: 0,
    aimX: 1,
    aimY: 0,
    hp: 100,
    maxHp: 100,
    level: 1,
    xp: 0,
    xpNeed: 10,
    kills: 0,
    gold: 0,
    ready: false,
    alive: true,
    input: { up: false, down: false, left: false, right: false, firing: false },
    upgradesOpen: false,
    upgradeOptions: [],
    invuln: 0,
    dashCd: 0,
    skillCd: 0,
    shootCd: 0
  };
}
function classStats(cls) {
  if (cls === 'mage') return { speed: 165, damage: 16, fireRate: 0.30, bulletSpeed: 420, color: '#84b9ff', maxHp: 86 };
  if (cls === 'rogue') return { speed: 215, damage: 12, fireRate: 0.18, bulletSpeed: 520, color: '#ffd76f', maxHp: 92 };
  return { speed: 155, damage: 18, fireRate: 0.42, bulletSpeed: 0, color: '#78e7ac', maxHp: 120 };
}
function makeEnemy(kind, room) {
  const edge = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  const spread = 550;
  if (edge === 0) { x = -spread; y = (Math.random() - 0.5) * 600; }
  if (edge === 1) { x = spread; y = (Math.random() - 0.5) * 600; }
  if (edge === 2) { x = (Math.random() - 0.5) * 800; y = -spread; }
  if (edge === 3) { x = (Math.random() - 0.5) * 800; y = spread; }

  const waveScale = 1 + room.wave * 0.22;
  const base = {
    normal: { r: 14, hp: 30, speed: 60, dmg: 8, xp: 2, gold: 1, color: '#ff7d88' },
    fast:   { r: 11, hp: 18, speed: 100, dmg: 6, xp: 2, gold: 1, color: '#ffbe69' },
    tank:   { r: 20, hp: 70, speed: 42, dmg: 13, xp: 5, gold: 2, color: '#bf89ff' },
    elite:  { r: 24, hp: 140, speed: 54, dmg: 18, xp: 12, gold: 5, color: '#7ee7ff' },
    boss:   { r: 34, hp: 420, speed: 48, dmg: 24, xp: 24, gold: 12, color: '#7df0c0' }
  }[kind];
  return {
    id: Math.random().toString(36).slice(2),
    kind,
    x, y,
    r: base.r,
    hp: Math.round(base.hp * waveScale),
    maxHp: Math.round(base.hp * waveScale),
    speed: base.speed * (1 + room.wave * 0.04),
    dmg: base.dmg,
    xp: base.xp,
    gold: base.gold,
    color: base.color,
    shotCd: kind === 'elite' ? 2.1 : kind === 'boss' ? 1.6 : 999
  };
}
function makeRoom(hostSocketId, hostName, hostClass) {
  return {
    code: makeRoomCode(),
    createdAt: Date.now(),
    started: false,
    ended: false,
    wave: 1,
    waveTime: 0,
    waveDuration: 42,
    spawnTimer: 0,
    chat: [],
    players: new Map([[hostSocketId, defaultPlayer(hostSocketId, hostName, hostClass)]]),
    enemies: [],
    bullets: [],
    enemyBullets: [],
    gems: [],
    overSummary: null
  };
}
function serializeRoom(room) {
  return {
    code: room.code,
    started: room.started,
    ended: room.ended,
    wave: room.wave,
    waveTime: room.waveTime,
    waveDuration: room.waveDuration,
    players: [...room.players.values()].map(p => {
      const s = classStats(p.cls);
      return {
        id: p.id, name: p.name, cls: p.cls,
        x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, level: p.level,
        xp: p.xp, xpNeed: p.xpNeed, kills: p.kills, gold: p.gold,
        ready: p.ready, alive: p.alive, color: s.color,
        upgradesOpen: p.upgradesOpen, upgradeOptions: p.upgradeOptions
      };
    }),
    enemies: room.enemies,
    bullets: room.bullets,
    enemyBullets: room.enemyBullets,
    gems: room.gems,
    chat: room.chat.slice(-20),
    overSummary: room.overSummary,
    leaderboard: leaderboard.slice(0, 10)
  };
}
function roomForSocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}
function broadcastRoom(room) {
  io.to(room.code).emit('state', serializeRoom(room));
}
function grantXp(player, amount) {
  player.xp += amount;
  while (player.xp >= player.xpNeed) {
    player.xp -= player.xpNeed;
    player.level += 1;
    player.xpNeed = Math.floor(player.xpNeed * 1.25 + 6);
    player.upgradesOpen = true;
    player.upgradeOptions = randomUpgradeOptions();
  }
}
const UPGRADE_POOL = [
  { key: 'hp', title: '厚实身板', apply: p => { p.maxHp += 24; p.hp += 24; } },
  { key: 'heal', title: '战地包扎', apply: p => { p.hp = Math.min(p.maxHp, p.hp + 30); } },
  { key: 'gold', title: '掠夺本能', apply: p => { p.gold += 12; } },
  { key: 'power', title: '武器强化', apply: p => { p._power = (p._power || 0) + 4; } },
  { key: 'haste', title: '攻速提升', apply: p => { p._haste = (p._haste || 0) + 0.03; } },
  { key: 'speed', title: '机动步伐', apply: p => { p._speed = (p._speed || 0) + 18; } }
];
function randomUpgradeOptions() {
  return [...UPGRADE_POOL].sort(() => Math.random() - 0.5).slice(0, 3).map(u => ({ key: u.key, title: u.title }));
}
function applyUpgrade(player, key) {
  const found = UPGRADE_POOL.find(u => u.key === key);
  if (!found) return;
  found.apply(player);
  player.upgradesOpen = false;
  player.upgradeOptions = [];
}
function endRoom(room, cleared) {
  room.started = false;
  room.ended = true;
  room.overSummary = {
    cleared,
    wave: room.wave,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, cls: p.cls, kills: p.kills, level: p.level, time: Math.floor(room.waveTime)
    }))
  };
  for (const p of room.players.values()) {
    leaderboard.push({
      name: p.name,
      cls: p.cls,
      wave: room.wave,
      kills: p.kills,
      level: p.level,
      cleared,
      at: new Date().toISOString()
    });
  }
  leaderboard = leaderboard
    .sort((a, b) => (b.cleared - a.cleared) || (b.wave - a.wave) || (b.kills - a.kills) || (b.level - a.level))
    .slice(0, 50);
  saveLeaderboard(leaderboard);
}
function restartRoom(room) {
  room.started = false;
  room.ended = false;
  room.wave = 1;
  room.waveTime = 0;
  room.waveDuration = 42;
  room.spawnTimer = 0;
  room.enemies = [];
  room.bullets = [];
  room.enemyBullets = [];
  room.gems = [];
  room.overSummary = null;
  for (const p of room.players.values()) {
    const fresh = defaultPlayer(p.id, p.name, p.cls);
    const stats = classStats(p.cls);
    fresh.maxHp = stats.maxHp;
    fresh.hp = stats.maxHp;
    fresh.ready = false;
    room.players.set(p.id, fresh);
  }
}
function updateRoom(room, dt) {
  if (!room.started || room.ended) return;
  room.waveTime += dt;
  room.spawnTimer += dt;

  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const stats = classStats(p.cls);
    const moveSpeed = stats.speed + (p._speed || 0);
    let mx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let my = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const len = Math.hypot(mx, my) || 1;
    p.x += mx / len * moveSpeed * dt;
    p.y += my / len * moveSpeed * dt;
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);

    if (!p.upgradesOpen && p.input.firing && p.shootCd <= 0) {
      const fireRate = Math.max(0.08, stats.fireRate - (p._haste || 0));
      p.shootCd = fireRate;
      if (p.cls === 'swordsman') {
        room.bullets.push({
          id: Math.random().toString(36).slice(2),
          owner: p.id, kind: 'slash',
          x: p.x + p.aimX * 24, y: p.y + p.aimY * 24,
          vx: 0, vy: 0, life: 0.18, r: 48, dmg: stats.damage + (p._power || 0)
        });
      } else if (p.cls === 'mage') {
        room.bullets.push({
          id: Math.random().toString(36).slice(2),
          owner: p.id, kind: 'orb',
          x: p.x, y: p.y,
          vx: p.aimX * (stats.bulletSpeed), vy: p.aimY * (stats.bulletSpeed),
          life: 1.4, r: 8, dmg: stats.damage + (p._power || 0)
        });
      } else {
        room.bullets.push({
          id: Math.random().toString(36).slice(2),
          owner: p.id, kind: 'knife',
          x: p.x, y: p.y,
          vx: p.aimX * (stats.bulletSpeed), vy: p.aimY * (stats.bulletSpeed),
          life: 1.0, r: 6, dmg: stats.damage + (p._power || 0)
        });
        room.bullets.push({
          id: Math.random().toString(36).slice(2),
          owner: p.id, kind: 'knife',
          x: p.x, y: p.y,
          vx: (p.aimX * 0.96 - p.aimY * 0.18) * stats.bulletSpeed,
          vy: (p.aimY * 0.96 + p.aimX * 0.18) * stats.bulletSpeed,
          life: 0.95, r: 5, dmg: stats.damage - 1 + (p._power || 0)
        });
      }
    }
  }

  const cfg = {
    spawnInterval: Math.max(0.25, 0.9 - room.wave * 0.08),
    weights: room.wave === 1 ? [0.75, 0.18, 0.07, 0, 0] :
             room.wave === 2 ? [0.55, 0.20, 0.15, 0.10, 0] :
             room.wave === 3 ? [0.44, 0.20, 0.18, 0.12, 0.06] :
             room.wave === 4 ? [0.34, 0.20, 0.24, 0.14, 0.08] :
                               [0.28, 0.18, 0.24, 0.16, 0.14]
  };
  while (room.spawnTimer >= cfg.spawnInterval) {
    room.spawnTimer -= cfg.spawnInterval;
    const r = Math.random();
    const [a,b,c,d] = cfg.weights;
    const kind = r < a ? 'normal' : r < a+b ? 'fast' : r < a+b+c ? 'tank' : r < a+b+c+d ? 'elite' : 'boss';
    room.enemies.push(makeEnemy(kind, room));
  }

  const livingPlayers = [...room.players.values()].filter(p => p.alive);
  if (livingPlayers.length === 0) {
    endRoom(room, false);
    return;
  }

  for (const e of room.enemies) {
    const target = livingPlayers.sort((a,b) => ((a.x-e.x)**2+(a.y-e.y)**2) - ((b.x-e.x)**2+(b.y-e.y)**2))[0];
    if (!target) continue;
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    e.x += dx / len * e.speed * dt;
    e.y += dy / len * e.speed * dt;
    e.shotCd -= dt;
    if ((e.kind === 'elite' || e.kind === 'boss') && e.shotCd <= 0) {
      e.shotCd = e.kind === 'boss' ? 1.7 : 2.3;
      const shots = e.kind === 'boss' ? 3 : 1;
      for (let i = 0; i < shots; i++) {
        const spread = shots === 1 ? 0 : (i - 1) * 0.18;
        const ax = (dx / len) * Math.cos(spread) - (dy / len) * Math.sin(spread);
        const ay = (dy / len) * Math.cos(spread) + (dx / len) * Math.sin(spread);
        room.enemyBullets.push({
          id: Math.random().toString(36).slice(2),
          x: e.x, y: e.y,
          vx: ax * (e.kind === 'boss' ? 260 : 220),
          vy: ay * (e.kind === 'boss' ? 260 : 220),
          r: e.kind === 'boss' ? 10 : 8,
          life: 3.2,
          dmg: e.kind === 'boss' ? 16 : 10
        });
      }
    }
    for (const p of livingPlayers) {
      const pd = Math.hypot(p.x - e.x, p.y - e.y);
      if (pd < p.maxHp * 0 + e.r + 14 && p.invuln <= 0) {
        p.hp -= e.dmg;
        p.invuln = 0.45;
        if (p.hp <= 0) {
          p.hp = 0;
          p.alive = false;
        }
      }
    }
  }

  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const b = room.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) {
      room.bullets.splice(i, 1);
      continue;
    }
    for (let j = room.enemies.length - 1; j >= 0; j--) {
      const e = room.enemies[j];
      if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
        e.hp -= b.dmg;
        if (b.kind !== 'slash') room.bullets.splice(i, 1);
        if (e.hp <= 0) {
          const owner = room.players.get(b.owner);
          if (owner) {
            owner.kills += 1;
            owner.gold += e.gold;
            grantXp(owner, e.xp);
          }
          room.gems.push({ id: Math.random().toString(36).slice(2), x: e.x, y: e.y, value: e.xp });
          room.enemies.splice(j, 1);
        }
        break;
      }
    }
  }

  for (let i = room.enemyBullets.length - 1; i >= 0; i--) {
    const b = room.enemyBullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) {
      room.enemyBullets.splice(i, 1);
      continue;
    }
    for (const p of livingPlayers) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + 12 && p.invuln <= 0) {
        p.hp -= b.dmg;
        p.invuln = 0.4;
        room.enemyBullets.splice(i, 1);
        if (p.hp <= 0) {
          p.hp = 0;
          p.alive = false;
        }
        break;
      }
    }
  }

  for (let i = room.gems.length - 1; i >= 0; i--) {
    const g = room.gems[i];
    for (const p of livingPlayers) {
      if (Math.hypot(g.x - p.x, g.y - p.y) < 28) {
        grantXp(p, Math.max(1, Math.round(g.value)));
        room.gems.splice(i, 1);
        break;
      }
    }
  }

  if (room.waveTime >= room.waveDuration) {
    room.wave += 1;
    room.waveTime = 0;
    room.waveDuration = Math.min(60, 42 + room.wave * 3);
    if (room.wave > 5) {
      endRoom(room, true);
      return;
    }
  }
}

io.on('connection', socket => {
  socket.emit('welcome', { leaderboard: leaderboard.slice(0, 10) });

  socket.on('createRoom', ({ name, cls }) => {
    const room = makeRoom(socket.id, name, cls);
    rooms.set(room.code, room);
    socket.join(room.code);
    broadcastRoom(room);
  });

  socket.on('joinRoom', ({ code, name, cls }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return socket.emit('errorMessage', '房间不存在');
    if (room.players.size >= 2) return socket.emit('errorMessage', '房间已满');
    room.players.set(socket.id, defaultPlayer(socket.id, name, cls));
    socket.join(room.code);
    broadcastRoom(room);
  });

  socket.on('readyToggle', () => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    p.ready = !p.ready;
    if (room.players.size === 2 && [...room.players.values()].every(v => v.ready)) {
      room.started = true;
      room.ended = false;
      room.wave = 1;
      room.waveTime = 0;
      room.waveDuration = 42;
      room.spawnTimer = 0;
      room.enemies = [];
      room.bullets = [];
      room.enemyBullets = [];
      room.gems = [];
      room.overSummary = null;
      let offset = -80;
      for (const player of room.players.values()) {
        const stats = classStats(player.cls);
        player.x = offset;
        player.y = 0;
        player.maxHp = stats.maxHp;
        player.hp = stats.maxHp;
        player.level = 1;
        player.xp = 0;
        player.xpNeed = 10;
        player.kills = 0;
        player.gold = 0;
        player.alive = true;
        player.upgradesOpen = false;
        player.upgradeOptions = [];
        player._power = 0;
        player._haste = 0;
        player._speed = 0;
        offset += 160;
      }
    }
    broadcastRoom(room);
  });

  socket.on('input', payload => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    if (payload.input) p.input = { ...p.input, ...payload.input };
    if (typeof payload.aimX === 'number' && typeof payload.aimY === 'number') {
      const len = Math.hypot(payload.aimX, payload.aimY) || 1;
      p.aimX = payload.aimX / len;
      p.aimY = payload.aimY / len;
    }
  });

  socket.on('dash', () => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p || p.dashCd > 0 || !p.alive) return;
    p.x += p.aimX * 90;
    p.y += p.aimY * 90;
    p.dashCd = 3.8;
    p.invuln = 0.25;
  });

  socket.on('skill', () => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p || p.skillCd > 0 || !p.alive) return;
    p.skillCd = 14;
    for (const e of room.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < 180) e.hp -= 20;
    }
    room.enemies = room.enemies.filter(e => e.hp > 0);
  });

  socket.on('pickUpgrade', ({ key }) => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p || !p.upgradesOpen) return;
    applyUpgrade(p, key);
    broadcastRoom(room);
  });

  socket.on('chat', ({ text }) => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    const p = room.players.get(socket.id);
    const clean = String(text || '').trim().slice(0, 120);
    if (!clean) return;
    room.chat.push({ id: Math.random().toString(36).slice(2), name: p.name, text: clean });
    broadcastRoom(room);
  });

  socket.on('restart', () => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    restartRoom(room);
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const room = roomForSocket(socket.id);
    if (!room) return;
    room.players.delete(socket.id);
    socket.leave(room.code);
    if (room.players.size === 0) {
      rooms.delete(room.code);
    } else {
      broadcastRoom(room);
    }
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    updateRoom(room, 1 / 30);
    broadcastRoom(room);
  }
}, 1000 / 30);

server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
