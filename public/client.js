const socket = io({ transports: ['websocket', 'polling'], timeout: 10000 });
const spriteAssets = { players: new Image(), enemies: new Image(), tiles: new Image() };
let spritesReady = false;
let spriteLoadCount = 0;
function markSpriteLoaded(){ spriteLoadCount += 1; if(spriteLoadCount >= 3) spritesReady = true; }
spriteAssets.players.src = '/assets/players_states.png';
spriteAssets.enemies.src = '/assets/enemies_states.png';
spriteAssets.tiles.src = '/assets/tiles_anim.png';
spriteAssets.players.onload = markSpriteLoaded;
spriteAssets.enemies.onload = markSpriteLoaded;
spriteAssets.tiles.onload = markSpriteLoaded;

const playerAnimState = new Map();
const enemyAnimState = new Map();

function animFrame(speed=8, offset=0){ return Math.floor((Date.now()/1000)*speed + offset) % 4; }
function enemyBaseRow(sprite){ return sprite==='slime' ? 0 : sprite==='bat' ? 1 : sprite==='golem' ? 2 : sprite==='warlock' ? 3 : 4; }
function playerBaseRow(cls){ return cls==='mage' ? 1 : cls==='rogue' ? 2 : 0; }
function stateOffset(state){ return state==='idle' ? 0 : state==='walk' ? 1 : state==='attack' ? 2 : state==='hit' ? 3 : 4; }
function playerRow(cls, state){ return playerBaseRow(cls) * 5 + stateOffset(state); }
function enemyRow(sprite, state){ return enemyBaseRow(sprite) * 5 + stateOffset(state); }

function getPlayerDrawState(p){
  const prev = playerAnimState.get(p.id) || { hp: p.hp, hurtUntil: 0 };
  if (p.hp < prev.hp) prev.hurtUntil = Date.now() + 220;
  prev.hp = p.hp;
  playerAnimState.set(p.id, prev);
  if (!p.alive) return 'death';
  if (Date.now() < prev.hurtUntil) return 'hit';
  if ((p.shootCd ?? 1) < 0.08) return 'attack';
  if (p.input?.up || p.input?.down || p.input?.left || p.input?.right) return 'walk';
  return 'idle';
}
function getEnemyDrawState(e){
  const prev = enemyAnimState.get(e.id) || { hp: e.hp, hurtUntil: 0 };
  if (e.hp < prev.hp) prev.hurtUntil = Date.now() + 180;
  prev.hp = e.hp;
  enemyAnimState.set(e.id, prev);
  if (Date.now() < prev.hurtUntil) return 'hit';
  if ((e.shotCd ?? 99) < 0.22 && (e.kind==='elite' || e.kind==='boss')) return 'attack';
  return e.kind === 'fast' ? 'walk' : 'idle';
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu'), roomPanel = document.getElementById('roomPanel'), hud = document.getElementById('hud');
const menuMsg = document.getElementById('menuMsg'), connectBadge = document.getElementById('connectBadge'), socketText = document.getElementById('socketText');
const playersList = document.getElementById('playersList'), roomCodeEl = document.getElementById('roomCode'), roomInfo = document.getElementById('roomInfo'), roomDebug = document.getElementById('roomDebug');
const waveText = document.getElementById('waveText'), meInfo = document.getElementById('meInfo'), teamInfo = document.getElementById('teamInfo');
const chatLog = document.getElementById('chatLog'), chatInput = document.getElementById('chatInput'), leaderboardList = document.getElementById('leaderboardList');
const upgrades = document.getElementById('upgrades'), upgradeList = document.getElementById('upgradeList');
const summary = document.getElementById('summary'), summaryTitle = document.getElementById('summaryTitle'), summaryBody = document.getElementById('summaryBody');
const heroBadge = document.getElementById('heroBadge'), levelText = document.getElementById('levelText'), hpText = document.getElementById('hpText'), xpText = document.getElementById('xpText');
const hpFill = document.getElementById('hpFill'), xpFill = document.getElementById('xpFill');
let W=0,H=0,DPR=Math.min(window.devicePixelRatio||1,2), state=null, myId=null, mouse={x:1,y:0}, firing=false, keys={up:false,down:false,left:false,right:false};
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const mobileControls = document.getElementById('mobileControls');
const joystickZone = document.getElementById('joystickZone');
const joyBase = document.getElementById('joyBase');
const joyStick = document.getElementById('joyStick');
const touchDashBtn = document.getElementById('touchDashBtn');
const touchSkillBtn = document.getElementById('touchSkillBtn');
const mobileHint = document.getElementById('mobileHint');
const touchState = { active:false, id:null, ox:0, oy:0, attackId:null };
if (isTouchDevice) { document.body.classList.add('mobile-mode'); mobileControls.classList.remove('hidden'); setTimeout(()=>mobileHint.classList.add('hidden'), 5000); }

function resize(){ W=window.innerWidth; H=window.innerHeight; canvas.width=W*DPR; canvas.height=H*DPR; canvas.style.width=W+'px'; canvas.style.height=H+'px'; ctx.setTransform(DPR,0,0,DPR,0,0); }
window.addEventListener('resize', resize); resize();
function setMessage(text,type='info'){ menuMsg.textContent=text||''; menuMsg.style.color=type==='error'?'#ffb0ba':type==='ok'?'#93f1bd':'#aab6d6'; }
function setConnect(status,text){ connectBadge.className='badge '+(status==='ok'?'ok':status==='err'?'err':'warn'); connectBadge.textContent=status==='ok'?'已连接':status==='err'?'已断开':'连接中'; socketText.textContent=text; }
function normalizedRoomCode(){ return String(document.getElementById('roomInput').value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''); }
function clsName(cls){ return cls==='mage'?'魔法师':cls==='rogue'?'盗贼':'剑士'; }
function clsColor(cls){ return cls==='mage'?'#84b9ff':cls==='rogue'?'#ffd76f':'#78e7ac'; }
function getMe(){ return state?.players?.find(p=>p.id===myId) || null; }
// Allow free movement in room and during upgrades; only block if ended/dead.
function canMove(){ const me=getMe(); return !!(me && me.alive && !state?.ended); }
function canAttack(){ const me=getMe(); return !!(state?.started && me && me.alive && !state?.ended); }
function resetInputs(){ keys={up:false,down:false,left:false,right:false}; firing=false; }
function setMoveKeysFromVector(nx, ny) { const threshold = 0.2; keys.left = nx < -threshold; keys.right = nx > threshold; keys.up = ny < -threshold; keys.down = ny > threshold; }
function releaseTouchMove() { touchState.active = false; touchState.id = null; setMoveKeysFromVector(0,0); joyBase.classList.add('hidden'); joyStick.classList.add('hidden'); }
function setAimFromClientPoint(x, y) { mouse.x = x - W / 2; mouse.y = y - H / 2; const len = Math.hypot(mouse.x, mouse.y) || 1; mouse.x /= len; mouse.y /= len; }

if (isTouchDevice) {
  joystickZone.addEventListener('pointerdown', e => { if(!canMove()) return; touchState.active = true; touchState.id = e.pointerId; touchState.ox = e.clientX; touchState.oy = e.clientY; joyBase.classList.remove('hidden'); joyStick.classList.remove('hidden'); joyBase.style.left = (e.clientX - 61) + 'px'; joyBase.style.top = (e.clientY - 61) + 'px'; joyStick.style.left = (e.clientX - 29) + 'px'; joyStick.style.top = (e.clientY - 29) + 'px'; });
  joystickZone.addEventListener('pointermove', e => { if (!touchState.active || e.pointerId !== touchState.id || !canMove()) return; const dx = e.clientX - touchState.ox, dy = e.clientY - touchState.oy; const max = 42, len = Math.hypot(dx, dy) || 1; const nx = len > max ? dx / len * max : dx, ny = len > max ? dy / len * max : dy; joyStick.style.left = (touchState.ox + nx - 29) + 'px'; joyStick.style.top = (touchState.oy + ny - 29) + 'px'; setMoveKeysFromVector(nx / max, ny / max); });
  const endJoy = e => { if (touchState.id !== null && e.pointerId !== touchState.id) return; releaseTouchMove(); };
  joystickZone.addEventListener('pointerup', endJoy); joystickZone.addEventListener('pointercancel', endJoy);

  canvas.addEventListener('pointerdown', e => { if(!canAttack() || e.clientX < W * 0.45) return; touchState.attackId = e.pointerId; setAimFromClientPoint(e.clientX, e.clientY); firing = true; });
  canvas.addEventListener('pointermove', e => { if (touchState.attackId !== e.pointerId) return; setAimFromClientPoint(e.clientX, e.clientY); firing = canAttack(); });
  const endAttack = e => { if (touchState.attackId !== e.pointerId) return; touchState.attackId = null; firing = false; };
  canvas.addEventListener('pointerup', endAttack); canvas.addEventListener('pointercancel', endAttack);

  touchDashBtn.addEventListener('click', () => { if(canMove()) socket.emit('dash'); });
  touchSkillBtn.addEventListener('click', () => { if(canMove()) socket.emit('skill'); });
}
function sendInput(){
  if(!socket.connected) return;
  socket.emit('input',{ input:{...keys,firing:canAttack() ? firing : false}, aimX:mouse.x, aimY:mouse.y });
}
setInterval(sendInput, 1000/20);

const worldToScreen=(me,x,y)=>({x:x-me.x+W/2,y:y-me.y+H/2});
function drawGrid(me){ const size=72, ox=(( -me.x % size)+size)%size, oy=(( -me.y % size)+size)%size; ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=1; for(let x=ox;x<W;x+=size){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); } for(let y=oy;y<H;y+=size){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); } }
function drawWorldDecor(me){ const tile=144, ox=(( -me.x % tile)+tile)%tile, oy=(( -me.y % tile)+tile)%tile; for(let x=ox-tile;x<W+tile;x+=tile){ for(let y=oy-tile;y<H+tile;y+=tile){ const seed=Math.abs(Math.sin(x*0.01+y*0.013)); ctx.globalAlpha=.08+seed*.05; ctx.fillStyle= seed>.55 ? '#3f5f2b' : '#6d5938'; ctx.fillRect(x+22,y+22,10+seed*16,10+seed*16); } } ctx.globalAlpha=1; }

function drawPlayer(me,p){
  const pos=worldToScreen(me,p.x,p.y), bob=Math.sin((Date.now()/130)+(p.x+p.y)*0.01)*1.8;
  ctx.save();
  ctx.translate(pos.x, pos.y+bob);
  ctx.fillStyle='rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(0,16,14,6,0,0,Math.PI*2); ctx.fill();
  if(spritesReady){
    const state = getPlayerDrawState(p);
    const row = playerRow(p.cls, state);
    const moving = !!(p.input?.up || p.input?.down || p.input?.left || p.input?.right);
    const frame = state==='death' ? 3 : state==='attack' ? animFrame(10, (p.id||'').length) : moving ? animFrame(8, (p.id||'').length) : animFrame(2, (p.id||'').length);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spriteAssets.players, frame*32, row*32, 32, 32, -16, -18, 32, 32);
  } else {
    if(p.cls==='mage'){
      ctx.fillStyle='#6d7dff'; ctx.beginPath(); ctx.moveTo(-12,10); ctx.lineTo(0,-12); ctx.lineTo(12,10); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#9ec7ff'; ctx.fillRect(-10,-6,20,14); ctx.fillStyle='#edd2b0'; ctx.fillRect(-7,-18,14,12); ctx.fillStyle='#4f58a6'; ctx.fillRect(-11,-22,22,6);
      ctx.strokeStyle='#b8ecff'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(10,-6); ctx.lineTo(18,-16); ctx.stroke(); ctx.beginPath(); ctx.arc(20,-18,4,0,Math.PI*2); ctx.stroke();
    } else if(p.cls==='rogue'){
      ctx.fillStyle='#7b5a22'; ctx.fillRect(-10,-8,20,17); ctx.fillStyle='#ffd76d'; ctx.fillRect(-8,-18,16,12); ctx.fillStyle='#2f2614'; ctx.beginPath(); ctx.moveTo(-9,-18); ctx.lineTo(0,-26); ctx.lineTo(9,-18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#e9f4ff'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(7,-2); ctx.lineTo(18,-6); ctx.stroke();
    } else {
      ctx.strokeStyle='#dfe9f5'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(6,-2); ctx.lineTo(18,-12); ctx.stroke(); ctx.fillStyle='#ffce7c'; ctx.fillRect(5,-2,4,8);
      ctx.fillStyle='#78e7ac'; ctx.fillRect(-10,-8,20,18); ctx.fillStyle='#c8f5d8'; ctx.fillRect(-8,-18,16,12);
    }
    ctx.fillStyle='#162033'; ctx.fillRect(-4,-14,3,3); ctx.fillRect(1,-14,3,3);
  }
  if(!p.alive){ ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillRect(-12,-22,24,38); }
  ctx.restore();
}

// Original pixel-monster style; not using copyrighted Vampire Survivors sprites.
function drawEnemy(me,e){
  const pos=worldToScreen(me,e.x,e.y);
  if(spritesReady){
    const state = getEnemyDrawState(e);
    const frame = state==='death' ? 3 : state==='attack' ? animFrame(9, e.seed||0) : state==='walk' ? animFrame(10, e.seed||0) : animFrame(4, e.seed||0);
    const row = enemyRow(e.sprite, state);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle='rgba(0,0,0,.2)';
    ctx.beginPath(); ctx.ellipse(0, e.r*0.9, e.r*0.8, e.r*0.35, 0, 0, Math.PI*2); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    const size = e.kind==='boss' ? 56 : 40;
    ctx.drawImage(spriteAssets.enemies, frame*32, row*32, 32, 32, -size/2, -size/2, size, size);
    ctx.restore();
  } else {
    const t = Date.now()/170 + e.seed;
    const bob = Math.sin(t)*1.6;
    ctx.save();
    ctx.translate(pos.x, pos.y + bob);
    ctx.fillStyle='rgba(0,0,0,.2)';
    ctx.beginPath(); ctx.ellipse(0, e.r*0.9, e.r*0.8, e.r*0.35, 0, 0, Math.PI*2); ctx.fill();
    if(e.sprite==='slime'){
      ctx.fillStyle='#5fd06f';
      ctx.beginPath();
      ctx.moveTo(-e.r*0.9, 2);
      ctx.quadraticCurveTo(-e.r*1.0, -e.r*0.8, 0, -e.r*0.9);
      ctx.quadraticCurveTo(e.r*1.0, -e.r*0.8, e.r*0.9, 2);
      ctx.quadraticCurveTo(e.r*0.8, e.r*0.9, 0, e.r*0.8);
      ctx.quadraticCurveTo(-e.r*0.8, e.r*0.9, -e.r*0.9, 2);
      ctx.fill();
      ctx.fillStyle='#163119'; ctx.fillRect(-4,-4,3,3); ctx.fillRect(1,-4,3,3);
      ctx.fillStyle='#8bf79a'; ctx.fillRect(-5,-9,10,4);
    } else if(e.sprite==='bat'){
      const wing = [0,2,0,-2][Math.floor(Date.now()/120)%4];
      ctx.fillStyle='#bca55a';
      ctx.beginPath();
      ctx.moveTo(0, -e.r*0.2);
      ctx.lineTo(e.r*1.3, -e.r*0.8 - wing);
      ctx.lineTo(e.r*0.7, 2);
      ctx.lineTo(0, e.r*0.35);
      ctx.lineTo(-e.r*0.7, 2);
      ctx.lineTo(-e.r*1.3, -e.r*0.8 + wing);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle='#4f3f13'; ctx.fillRect(-3,-3,2,2); ctx.fillRect(1,-3,2,2);
    } else if(e.sprite==='golem'){
      ctx.fillStyle='#8f7ad9';
      ctx.fillRect(-e.r*0.9,-e.r*0.65,e.r*1.8,e.r*1.4);
      ctx.fillStyle='#bfb0ff'; ctx.fillRect(-e.r*0.55,-e.r*0.35,e.r*1.1,6);
      ctx.fillStyle='#2b204b'; ctx.fillRect(-5,-3,4,4); ctx.fillRect(1,-3,4,4);
      ctx.strokeStyle='#e6deff'; ctx.lineWidth=3; ctx.strokeRect(-e.r*0.9,-e.r*0.65,e.r*1.8,e.r*1.4);
    } else if(e.sprite==='warlock'){
      ctx.fillStyle='#6ed6d7';
      ctx.beginPath(); ctx.moveTo(-e.r*0.75, e.r*0.8); ctx.lineTo(0,-e.r); ctx.lineTo(e.r*0.75, e.r*0.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#d7ffff'; ctx.fillRect(-6,-8,12,10);
      ctx.fillStyle='#1a4b4b'; ctx.fillRect(-4,-6,3,3); ctx.fillRect(1,-6,3,3);
      ctx.strokeStyle='#c8ffff'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(e.r*0.2,-e.r*0.2); ctx.lineTo(e.r*0.95,-e.r*0.95); ctx.stroke();
      ctx.beginPath(); ctx.arc(e.r*1.05,-e.r*1.05,4,0,Math.PI*2); ctx.stroke();
    } else {
      ctx.fillStyle='#d86f6f';
      ctx.fillRect(-e.r,-e.r*0.72,e.r*2,e.r*1.5);
      ctx.fillStyle='#ffb2b2'; ctx.fillRect(-e.r*0.4,-e.r*1.1,e.r*0.8,8);
      ctx.fillStyle='#4f1d1d'; ctx.fillRect(-6,-4,4,4); ctx.fillRect(2,-4,4,4);
      ctx.fillStyle='#f4d08a'; ctx.fillRect(-e.r*0.9,-e.r*0.95,6,12); ctx.fillRect(e.r*0.65,-e.r*0.95,6,12);
      ctx.strokeStyle='#ffd6d6'; ctx.lineWidth=3; ctx.strokeRect(-e.r,-e.r*0.72,e.r*2,e.r*1.5);
    }
    ctx.restore();
  }
  const w=Math.max(30,e.r*2.1);
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(pos.x-w/2,pos.y-e.r-14,w,5);
  ctx.fillStyle='#7ef0b2'; ctx.fillRect(pos.x-w/2,pos.y-e.r-14,w*(e.hp/e.maxHp),5);
}
function drawBullet(me,b,enemy=false){
  const pos=worldToScreen(me,b.x,b.y);
  ctx.beginPath(); ctx.fillStyle=enemy?'#ff8ca0':(b.kind==='knife'?'#ffd76f':'#9fd1ff'); ctx.arc(pos.x,pos.y,b.r,0,Math.PI*2); ctx.fill();
}
function drawGem(me,g){ const pos=worldToScreen(me,g.x,g.y); ctx.beginPath(); ctx.fillStyle='#6ac8ff'; ctx.arc(pos.x,pos.y,5,0,Math.PI*2); ctx.fill(); }
function render(){
  requestAnimationFrame(render); ctx.clearRect(0,0,W,H);
  if(!state || !state.players?.length) return;
  const me=state.players.find(p=>p.id===myId)||state.players[0]; if(!me) return;
  const bg=ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#22405f'); bg.addColorStop(.55,'#29462f'); bg.addColorStop(1,'#1b2a19'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  drawGrid(me); drawWorldDecor(me);
  for(const g of state.gems||[]) drawGem(me,g);
  for(const b of state.bullets||[]) drawBullet(me,b,false);
  for(const b of state.enemyBullets||[]) drawBullet(me,b,true);
  for(const e of state.enemies||[]) drawEnemy(me,e);
  for(const p of state.players||[]) drawPlayer(me,p);
}
render();

function updateUI(){
  if(!state) return;
  const me=state.players.find(p=>p.id===myId); const other=state.players.find(p=>p.id!==myId);
  roomCodeEl.textContent=state.code||'----'; roomInfo.textContent=`房间 ${state.code||'----'}`;
  roomDebug.textContent=`房间玩家数：${state.players.length} · 已开始：${state.started?'是':'否'}${state.started?'':' · 现在可自由活动'}${state.players.length===1 && !state.started ? ' · 单人可直接准备开始' : ''}`;
  waveText.textContent=`第 ${state.wave} 波`;
  playersList.innerHTML='';
  for(const p of state.players){
    const div=document.createElement('div'); div.className='playerItem';
    div.innerHTML=`<b style="color:${clsColor(p.cls)}">${p.name}</b> · ${clsName(p.cls)} · ${p.ready?'已准备':'未准备'}`;
    playersList.appendChild(div);
  }
  meInfo.textContent=me?`我：${me.name} Lv.${me.level} HP ${me.hp}/${me.maxHp} 击杀 ${me.kills}`:'我：-';
  teamInfo.textContent=other?`队友：${other.name} Lv.${other.level} HP ${other.hp}/${other.maxHp} 击杀 ${other.kills}`:'队友：等待加入';
  if(me){
    heroBadge.textContent=clsName(me.cls); heroBadge.style.color=clsColor(me.cls); levelText.textContent=`Lv.${me.level}`;
    hpText.textContent=`${me.hp}/${me.maxHp}`; xpText.textContent=`${me.xp}/${me.xpNeed}`;
    hpFill.style.width=`${Math.max(0,Math.min(100,me.hp/me.maxHp*100))}%`;
    xpFill.style.width=`${Math.max(0,Math.min(100,me.xp/me.xpNeed*100))}%`;
  }
  chatLog.innerHTML=(state.chat||[]).map(c=>`<div><b>${c.name}：</b>${c.text}</div>`).join(''); chatLog.scrollTop=chatLog.scrollHeight;
  leaderboardList.innerHTML=(state.leaderboard||[]).map((e,i)=>`<div class="leaderItem"><span>${i+1}. ${e.name} (${clsName(e.cls)})</span><span>${e.cleared?'通关':'第'+e.wave+'波'} · ${e.kills}杀</span></div>`).join('');
  if(me?.upgradesOpen){
    upgrades.classList.remove('hidden');
    upgradeList.innerHTML=me.upgradeOptions.map((u,idx)=>`<button class="upgradeBtn" onclick="pickUpgrade('${u.key}')">${idx+1}. ${u.title}</button>`).join('');
  } else upgrades.classList.add('hidden');
  if(state.ended&&state.overSummary){
    summary.classList.remove('hidden'); summaryTitle.textContent=state.overSummary.cleared?'通关成功':'对局失败';
    summaryBody.innerHTML=state.overSummary.players.map(p=>`<div>${p.name} · ${clsName(p.cls)} · Lv.${p.level} · ${p.kills} 击杀</div>`).join('');
  } else summary.classList.add('hidden');

  if(state.code){ roomPanel.classList.remove('hidden'); hud.classList.remove('hidden'); menu.classList.add('hidden'); }
}
window.pickUpgrade=function(key){ socket.emit('pickUpgrade',{key}); };

document.getElementById('createBtn').onclick=()=>{ if(!socket.connected) return setMessage('当前未连接服务器，请稍后重试','error'); setMessage('正在创建房间...','info'); socket.emit('createRoom',{name:document.getElementById('nameInput').value||'玩家',cls:document.getElementById('classInput').value}); };
document.getElementById('joinBtn').onclick=()=>{ if(!socket.connected) return setMessage('当前未连接服务器，请稍后重试','error'); const code=normalizedRoomCode(); document.getElementById('roomInput').value=code; setMessage(`正在加入房间：${code||'(空)'}`,'info'); socket.emit('joinRoom',{code,name:document.getElementById('nameInput').value||'玩家',cls:document.getElementById('classInput').value}); };
document.getElementById('readyBtn').onclick=()=>socket.emit('readyToggle');
document.getElementById('restartBtn').onclick=()=>socket.emit('restart');
document.getElementById('copyInviteBtn').onclick=async()=>{ if(!state?.code) return; const txt=`来玩联机肉鸽：${location.origin}\n房间码：${state.code}`; try{ await navigator.clipboard.writeText(txt); setMessage('邀请信息已复制','ok'); } catch { setMessage(txt,'info'); } };
document.getElementById('chatSendBtn').onclick=sendChat;
chatInput.addEventListener('keydown',e=>{ if(e.key==='Enter') sendChat(); });
function sendChat(){ const text=chatInput.value.trim(); if(!text) return; socket.emit('chat',{text}); chatInput.value=''; }

window.addEventListener('mousemove',e=>{ if(isTouchDevice || !canMove()) return; mouse.x=e.clientX-W/2; mouse.y=e.clientY-H/2; const len=Math.hypot(mouse.x,mouse.y)||1; mouse.x/=len; mouse.y/=len; });
window.addEventListener('mousedown',()=>{ if(isTouchDevice || !canAttack()) return; firing=true; });
window.addEventListener('mouseup',()=>{ if(isTouchDevice) return; firing=false; });

window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(k==='w'||e.key==='ArrowUp') keys.up=canMove();
  if(k==='s'||e.key==='ArrowDown') keys.down=canMove();
  if(k==='a'||e.key==='ArrowLeft') keys.left=canMove();
  if(k==='d'||e.key==='ArrowRight') keys.right=canMove();
  if(e.code==='Space' && canMove()) socket.emit('dash');
  if(k==='q' && canMove()) socket.emit('skill');
  if(k==='1'||k==='2'||k==='3'){
    const me=state?.players?.find(p=>p.id===myId);
    if(me?.upgradesOpen){
      const option=me.upgradeOptions[Number(k)-1];
      if(option) socket.emit('pickUpgrade',{key:option.key});
    }
  }
});
window.addEventListener('keyup',e=>{
  const k=e.key.toLowerCase();
  if(k==='w'||e.key==='ArrowUp') keys.up=false;
  if(k==='s'||e.key==='ArrowDown') keys.down=false;
  if(k==='a'||e.key==='ArrowLeft') keys.left=false;
  if(k==='d'||e.key==='ArrowRight') keys.right=false;
});

socket.on('connect',()=>{ myId=socket.id; setConnect('ok',`已连接服务器，Socket ID：${socket.id}`); setMessage('连接服务器成功','ok'); });
socket.on('disconnect',reason=>{ setConnect('err',`连接断开：${reason}`); setMessage(`连接断开：${reason}`,'error'); });
socket.on('connect_error',err=>{ setConnect('err',`连接失败：${err.message}`); setMessage(`连接失败：${err.message}`,'error'); });
socket.on('welcome',data=>{ myId=data.socketId||socket.id; if(data.leaderboard){ leaderboardList.innerHTML=data.leaderboard.map((e,i)=>`<div class="leaderItem"><span>${i+1}. ${e.name}</span><span>${e.cleared?'通关':'第'+e.wave+'波'}</span></div>`).join(''); } });
socket.on('actionResult',info=>{ setMessage(info.message, info.ok?'ok':'error'); });
socket.on('state',next=>{ state=next; updateUI(); });
socket.on('errorMessage',msg=>setMessage(msg,'error'));
