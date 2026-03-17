const socket = io({ transports: ['websocket', 'polling'], timeout: 10000 });
const canvas = document.getElementById('game'); const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu'), roomPanel = document.getElementById('roomPanel'), hud = document.getElementById('hud');
const menuMsg = document.getElementById('menuMsg'), connectBadge = document.getElementById('connectBadge'), socketText = document.getElementById('socketText');
const playersList = document.getElementById('playersList'), roomCodeEl = document.getElementById('roomCode'), roomInfo = document.getElementById('roomInfo'), roomDebug = document.getElementById('roomDebug');
const waveText = document.getElementById('waveText'), meInfo = document.getElementById('meInfo'), teamInfo = document.getElementById('teamInfo');
const chatLog = document.getElementById('chatLog'), chatInput = document.getElementById('chatInput'), leaderboardList = document.getElementById('leaderboardList');
const upgrades = document.getElementById('upgrades'), upgradeList = document.getElementById('upgradeList');
const summary = document.getElementById('summary'), summaryTitle = document.getElementById('summaryTitle'), summaryBody = document.getElementById('summaryBody');
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
if (isTouchDevice) { document.body.classList.add('mobile-mode'); mobileControls.classList.remove('hidden'); setTimeout(()=>mobileHint.classList.add('hidden'), 6000); }
function resize(){ W=window.innerWidth; H=window.innerHeight; canvas.width=W*DPR; canvas.height=H*DPR; canvas.style.width=W+'px'; canvas.style.height=H+'px'; ctx.setTransform(DPR,0,0,DPR,0,0); }
window.addEventListener('resize', resize); resize();
function setMessage(text,type='info'){ menuMsg.textContent=text||''; menuMsg.style.color=type==='error'?'#ffb0ba':type==='ok'?'#93f1bd':'#aab6d6'; }
function setConnect(status,text){ connectBadge.className='badge '+(status==='ok'?'ok':status==='err'?'err':'warn'); connectBadge.textContent=status==='ok'?'已连接':status==='err'?'已断开':'连接中'; socketText.textContent=text; }
function normalizedRoomCode(){ return String(document.getElementById('roomInput').value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,''); }

function setMoveKeysFromVector(nx, ny) {
  const threshold = 0.2;
  keys.left = nx < -threshold; keys.right = nx > threshold;
  keys.up = ny < -threshold; keys.down = ny > threshold;
}
function releaseTouchMove() {
  touchState.active = false; touchState.id = null;
  setMoveKeysFromVector(0,0);
  joyBase.classList.add('hidden'); joyStick.classList.add('hidden');
}
function setAimFromClientPoint(x, y) {
  mouse.x = x - W / 2; mouse.y = y - H / 2;
  const len = Math.hypot(mouse.x, mouse.y) || 1;
  mouse.x /= len; mouse.y /= len;
}
if (isTouchDevice) {
  joystickZone.addEventListener('pointerdown', e => {
    touchState.active = true; touchState.id = e.pointerId; touchState.ox = e.clientX; touchState.oy = e.clientY;
    joyBase.classList.remove('hidden'); joyStick.classList.remove('hidden');
    joyBase.style.left = (e.clientX - 61) + 'px'; joyBase.style.top = (e.clientY - 61) + 'px';
    joyStick.style.left = (e.clientX - 29) + 'px'; joyStick.style.top = (e.clientY - 29) + 'px';
  });
  joystickZone.addEventListener('pointermove', e => {
    if (!touchState.active || e.pointerId !== touchState.id) return;
    const dx = e.clientX - touchState.ox, dy = e.clientY - touchState.oy;
    const max = 42, len = Math.hypot(dx, dy) || 1;
    const nx = len > max ? dx / len * max : dx, ny = len > max ? dy / len * max : dy;
    joyStick.style.left = (touchState.ox + nx - 29) + 'px';
    joyStick.style.top = (touchState.oy + ny - 29) + 'px';
    setMoveKeysFromVector(nx / max, ny / max);
  });
  const endJoy = e => { if (touchState.id !== null && e.pointerId !== touchState.id) return; releaseTouchMove(); };
  joystickZone.addEventListener('pointerup', endJoy);
  joystickZone.addEventListener('pointercancel', endJoy);

  canvas.addEventListener('pointerdown', e => {
    if (e.clientX < W * 0.45) return;
    touchState.attackId = e.pointerId;
    setAimFromClientPoint(e.clientX, e.clientY);
    firing = true;
  });
  canvas.addEventListener('pointermove', e => {
    if (touchState.attackId !== e.pointerId) return;
    setAimFromClientPoint(e.clientX, e.clientY);
    firing = true;
  });
  const endAttack = e => { if (touchState.attackId !== e.pointerId) return; touchState.attackId = null; firing = false; };
  canvas.addEventListener('pointerup', endAttack);
  canvas.addEventListener('pointercancel', endAttack);

  touchDashBtn.addEventListener('click', () => socket.emit('dash'));
  touchSkillBtn.addEventListener('click', () => socket.emit('skill'));
}

function sendInput(){ if(!socket.connected) return; socket.emit('input',{ input:{...keys,firing}, aimX:mouse.x, aimY:mouse.y }); }
setInterval(sendInput, 1000/20);
const clsName=cls=>cls==='mage'?'魔法师':cls==='rogue'?'盗贼':'剑士'; const clsColor=cls=>cls==='mage'?'#84b9ff':cls==='rogue'?'#ffd76f':'#78e7ac';
const worldToScreen=(me,x,y)=>({x:x-me.x+W/2,y:y-me.y+H/2});
function drawGrid(me){ const size=72, ox=(( -me.x % size)+size)%size, oy=(( -me.y % size)+size)%size; ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=1; for(let x=ox;x<W;x+=size){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); } for(let y=oy;y<H;y+=size){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); } }
function drawPlayer(me,p){ const pos=worldToScreen(me,p.x,p.y), c=clsColor(p.cls); ctx.save(); ctx.translate(pos.x,pos.y); ctx.fillStyle='rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0,16,13,6,0,0,Math.PI*2); ctx.fill(); ctx.fillStyle=c; ctx.fillRect(-10,-8,20,18); ctx.fillStyle='#f4d5b3'; ctx.fillRect(-8,-18,16,12); ctx.fillStyle='#162033'; ctx.fillRect(-4,-14,3,3); ctx.fillRect(1,-14,3,3); if(p.cls==='mage'){ ctx.strokeStyle='#bfe7ff'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(10,-2); ctx.lineTo(18,-16); ctx.stroke(); } else if(p.cls==='rogue'){ ctx.strokeStyle='#fff3b2'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(8,-2); ctx.lineTo(18,-6); ctx.stroke(); } else { ctx.strokeStyle='#dfe9f5'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(8,0); ctx.lineTo(18,-12); ctx.stroke(); } if(!p.alive){ ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillRect(-12,-22,24,38); } ctx.restore(); }
function drawEnemy(me,e){ const pos=worldToScreen(me,e.x,e.y); ctx.save(); ctx.translate(pos.x,pos.y); ctx.fillStyle=e.color; if(e.kind==='normal'){ ctx.beginPath(); ctx.arc(0,0,e.r,0,Math.PI*2); ctx.fill(); } else if(e.kind==='fast'){ ctx.fillRect(-e.r,-e.r,e.r*2,e.r*2); } else if(e.kind==='tank'){ ctx.fillRect(-e.r,-e.r*0.8,e.r*2,e.r*1.6); ctx.strokeStyle='#ffffff55'; ctx.lineWidth=3; ctx.strokeRect(-e.r,-e.r*0.8,e.r*2,e.r*1.6); } else if(e.kind==='elite'){ ctx.beginPath(); ctx.moveTo(0,-e.r); ctx.lineTo(e.r,0); ctx.lineTo(0,e.r); ctx.lineTo(-e.r,0); ctx.closePath(); ctx.fill(); } else { ctx.fillRect(-e.r,-e.r*0.85,e.r*2,e.r*1.7); ctx.strokeStyle='#fff0b8'; ctx.lineWidth=4; ctx.strokeRect(-e.r,-e.r*0.85,e.r*2,e.r*1.7); } ctx.restore(); const w=Math.max(30,e.r*2.1); ctx.fillStyle='rgba(0,0,0,.35)'; ctx.fillRect(pos.x-w/2,pos.y-e.r-14,w,5); ctx.fillStyle='#7ef0b2'; ctx.fillRect(pos.x-w/2,pos.y-e.r-14,w*(e.hp/e.maxHp),5); }
function drawBullet(me,b,enemy=false){ const pos=worldToScreen(me,b.x,b.y); ctx.beginPath(); ctx.fillStyle=enemy?'#ff8ca0':(b.kind==='knife'?'#ffd76f':'#9fd1ff'); ctx.arc(pos.x,pos.y,b.r,0,Math.PI*2); ctx.fill(); }
function drawGem(me,g){ const pos=worldToScreen(me,g.x,g.y); ctx.beginPath(); ctx.fillStyle='#6ac8ff'; ctx.arc(pos.x,pos.y,5,0,Math.PI*2); ctx.fill(); }
function render(){ requestAnimationFrame(render); ctx.clearRect(0,0,W,H); if(!state||!state.players?.length) return; const me=state.players.find(p=>p.id===myId)||state.players[0]; if(!me) return; const bg=ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#15233b'); bg.addColorStop(1,'#0c1320'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H); drawGrid(me); for(const g of state.gems||[]) drawGem(me,g); for(const b of state.bullets||[]) drawBullet(me,b,false); for(const b of state.enemyBullets||[]) drawBullet(me,b,true); for(const e of state.enemies||[]) drawEnemy(me,e); for(const p of state.players||[]) drawPlayer(me,p); }
render();
function updateUI(){ if(!state) return; roomCodeEl.textContent=state.code||'----'; roomInfo.textContent=`房间 ${state.code||'----'}`; roomDebug.textContent=`房间玩家数：${state.players.length} · 已开始：${state.started?'是':'否'}`; waveText.textContent=`第 ${state.wave} 波`; playersList.innerHTML=''; for(const p of state.players){ const div=document.createElement('div'); div.className='playerItem'; div.innerHTML=`<b style="color:${clsColor(p.cls)}">${p.name}</b> · ${clsName(p.cls)} · ${p.ready?'已准备':'未准备'}`; playersList.appendChild(div); } const me=state.players.find(p=>p.id===myId), other=state.players.find(p=>p.id!==myId); meInfo.textContent=me?`我：${me.name} Lv.${me.level} HP ${me.hp}/${me.maxHp} 击杀 ${me.kills}`:'我：-'; teamInfo.textContent=other?`队友：${other.name} Lv.${other.level} HP ${other.hp}/${other.maxHp} 击杀 ${other.kills}`:'队友：等待加入'; chatLog.innerHTML=(state.chat||[]).map(c=>`<div><b>${c.name}：</b>${c.text}</div>`).join(''); chatLog.scrollTop=chatLog.scrollHeight; leaderboardList.innerHTML=(state.leaderboard||[]).map((e,i)=>`<div class="leaderItem"><span>${i+1}. ${e.name} (${clsName(e.cls)})</span><span>${e.cleared?'通关':'第'+e.wave+'波'} · ${e.kills}杀</span></div>`).join(''); if(me?.upgradesOpen){ upgrades.classList.remove('hidden'); upgradeList.innerHTML=me.upgradeOptions.map((u,idx)=>`<button class="upgradeBtn" onclick="pickUpgrade('${u.key}')">${idx+1}. ${u.title}</button>`).join(''); } else upgrades.classList.add('hidden'); if(state.ended&&state.overSummary){ summary.classList.remove('hidden'); summaryTitle.textContent=state.overSummary.cleared?'通关成功':'对局失败'; summaryBody.innerHTML=state.overSummary.players.map(p=>`<div>${p.name} · ${clsName(p.cls)} · Lv.${p.level} · ${p.kills} 击杀</div>`).join(''); } else summary.classList.add('hidden'); if(state.code){ roomPanel.classList.remove('hidden'); hud.classList.remove('hidden'); menu.classList.add('hidden'); } }
window.pickUpgrade=function(key){ socket.emit('pickUpgrade',{key}); };
document.getElementById('createBtn').onclick=()=>{ if(!socket.connected) return setMessage('当前未连接服务器，请稍后重试','error'); setMessage('正在创建房间...','info'); socket.emit('createRoom',{name:document.getElementById('nameInput').value||'玩家',cls:document.getElementById('classInput').value}); };
document.getElementById('joinBtn').onclick=()=>{ if(!socket.connected) return setMessage('当前未连接服务器，请稍后重试','error'); const code=normalizedRoomCode(); document.getElementById('roomInput').value=code; setMessage(`正在加入房间：${code||'(空)'}`,'info'); socket.emit('joinRoom',{code,name:document.getElementById('nameInput').value||'玩家',cls:document.getElementById('classInput').value}); };
document.getElementById('readyBtn').onclick=()=>socket.emit('readyToggle'); document.getElementById('restartBtn').onclick=()=>socket.emit('restart'); document.getElementById('copyInviteBtn').onclick=async()=>{ if(!state?.code) return; const txt=`来玩联机肉鸽：${location.origin}\n房间码：${state.code}`; try{ await navigator.clipboard.writeText(txt); setMessage('邀请信息已复制','ok'); } catch { setMessage(txt,'info'); } };
document.getElementById('chatSendBtn').onclick=sendChat; chatInput.addEventListener('keydown',e=>{ if(e.key==='Enter') sendChat(); }); function sendChat(){ const text=chatInput.value.trim(); if(!text) return; socket.emit('chat',{text}); chatInput.value=''; }
window.addEventListener('mousemove',e=>{ if(isTouchDevice) return; mouse.x=e.clientX-W/2; mouse.y=e.clientY-H/2; const len=Math.hypot(mouse.x,mouse.y)||1; mouse.x/=len; mouse.y/=len; }); window.addEventListener('mousedown',()=>{ if(isTouchDevice) return; firing=true;}); window.addEventListener('mouseup',()=>{ if(isTouchDevice) return; firing=false;});
window.addEventListener('keydown',e=>{ const k=e.key.toLowerCase(); if(k==='w'||e.key==='ArrowUp') keys.up=true; if(k==='s'||e.key==='ArrowDown') keys.down=true; if(k==='a'||e.key==='ArrowLeft') keys.left=true; if(k==='d'||e.key==='ArrowRight') keys.right=true; if(e.code==='Space') socket.emit('dash'); if(k==='q') socket.emit('skill'); if(k==='1'||k==='2'||k==='3'){ const me=state?.players?.find(p=>p.id===myId); if(me?.upgradesOpen){ const option=me.upgradeOptions[Number(k)-1]; if(option) socket.emit('pickUpgrade',{key:option.key}); } } });
window.addEventListener('keyup',e=>{ const k=e.key.toLowerCase(); if(k==='w'||e.key==='ArrowUp') keys.up=false; if(k==='s'||e.key==='ArrowDown') keys.down=false; if(k==='a'||e.key==='ArrowLeft') keys.left=false; if(k==='d'||e.key==='ArrowRight') keys.right=false; });
socket.on('connect',()=>{ myId=socket.id; setConnect('ok',`已连接服务器，Socket ID：${socket.id}`); setMessage('连接服务器成功','ok'); });
socket.on('disconnect',reason=>{ setConnect('err',`连接断开：${reason}`); setMessage(`连接断开：${reason}`,'error'); });
socket.on('connect_error',err=>{ setConnect('err',`连接失败：${err.message}`); setMessage(`连接失败：${err.message}`,'error'); });
socket.on('welcome',data=>{ myId=data.socketId||socket.id; if(data.leaderboard){ leaderboardList.innerHTML=data.leaderboard.map((e,i)=>`<div class="leaderItem"><span>${i+1}. ${e.name}</span><span>${e.cleared?'通关':'第'+e.wave+'波'}</span></div>`).join(''); } });
socket.on('actionResult',info=>{ setMessage(info.message, info.ok?'ok':'error'); });
socket.on('state',next=>{ state=next; updateUI(); });
socket.on('errorMessage',msg=>setMessage(msg,'error'));
