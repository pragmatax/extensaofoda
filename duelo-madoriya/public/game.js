import OBR from "https://esm.sh/@owlbear-rodeo/sdk";
import { getSheet } from "./sheet.js";
import { rollHit, rollFormula } from "./dice.js";
import { lerp } from "./anim.js";
import { updateBot } from "./bot.js";
import {
  DUEL_META, CH, EVT, FIGHTER_COLORS, EP_DICE, EP_IGNORE_ARMOR,
  GLOBAL_COOLDOWN, DEFAULT_CONFIG,
} from "./duel.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
addEventListener("resize", resize);

/* ----------------------------- estado ----------------------------- */

let myId = "local";
let isHost = false;
let mySlot = -1;            // qual lutador EU controlo (-1 = espectador)
let config = { ...DEFAULT_CONFIG };
let round = 1;
let wins = [0, 0];
let roundStartedAt = 0;     // ms; base do timer do round atual
let roundOver = false;
let matchOver = false;
let needToWin = 1;

const fighters = [null, null];
const projectiles = [];
const melees = [];
const floats = [];
const keys = {};

const bgEl = document.querySelector("#bg");

function makeFighter(slot, conf) {
  const s = { ...getSheet({ metadata: {} }), ...(conf?.sheet || {}) };
  if (!s.epMax || s.epMax < 1) s.epMax = 5;
  if (s.ep == null) s.ep = s.epMax;
  const f = {
    slot,
    name: conf?.name || `Lutador ${slot + 1}`,
    color: conf?.color || FIGHTER_COLORS[slot],
    ownerId: conf?.ownerId,
    controllerId: conf?.controllerId || conf?.ownerId,
    sheet: s,
    x: 0, y: 0, tx: 0, ty: 0,
    mouse: { x: 0, y: 0 },
    scaleX: 1, scaleY: 1, flash: 0, shake: 0, charge: 0, kx: 0, ky: 0,
    epCharge: 0, iframes: 0, dashCd: 0, atkCd: 0,
    img: null, imgReady: false,
  };
  // Carrega a imagem do token (se houver) pra desenhar no lugar da bolinha.
  if (conf?.imageUrl) {
    const im = new Image();
    im.onload = () => { f.imgReady = true; };
    im.src = conf.imageUrl;
    f.img = im;
  }
  return f;
}

function arenaRect() {
  const wall = 36;
  return { left: wall, top: 80, right: canvas.width - wall, bottom: canvas.height - wall };
}

function spawnPositions() {
  const r = arenaRect();
  const midY = (r.top + r.bottom) / 2;
  return [
    { x: r.left + 70, y: midY },
    { x: r.right - 70, y: midY },
  ];
}

function placeFighters() {
  const pos = spawnPositions();
  for (let i = 0; i < 2; i++) {
    if (!fighters[i]) continue;
    fighters[i].x = fighters[i].tx = pos[i].x;
    fighters[i].y = fighters[i].ty = pos[i].y;
    const other = pos[1 - i];
    fighters[i].mouse = { x: other.x, y: other.y };
  }
}

/* --------------------------- inicialização ------------------------- */

OBR.onReady(async () => {
  myId = OBR.player.id;
  const md = await OBR.room.getMetadata();
  bootFromMetadata(md[DUEL_META]);

  OBR.room.onMetadataChange((m) => {
    const duel = m[DUEL_META];
    if (!duel?.active && !matchOver) {
      matchOver = true;
      showOverlay("Duelo encerrado", "Aguardando o mestre…");
    }
  });

  setupNet();
  requestAnimationFrame(loop);
});

function bootFromMetadata(duel) {
  if (!duel?.active || !Array.isArray(duel.fighters) || duel.fighters.length < 2) {
    showOverlay("Sem duelo ativo", "Aguardando o mestre iniciar…");
    matchOver = true;
    return;
  }
  config = { ...DEFAULT_CONFIG, ...(duel.config || {}) };
  isHost = duel.hostId === myId;
  round = duel.round || 1;
  roundStartedAt = duel.startedAt || nowMs();
  needToWin = Math.floor((config.rounds || 1) / 2) + 1;

  for (let i = 0; i < 2; i++) fighters[i] = makeFighter(i, duel.fighters[i]);

  // Qual lutador eu controlo? (atribuição feita pelo GM no painel)
  mySlot = fighters.findIndex((f) => f.controllerId && f.controllerId === myId);
  if (config.training && isHost) mySlot = 0; // GM testando sozinho

  placeFighters();

  if (config.bgUrl) {
    bgEl.src = config.bgUrl;
    bgEl.style.filter = `blur(${config.bgBlur ?? 6}px)`;
    bgEl.style.opacity = String(config.bgOpacity ?? 0.35);
  }

  const nameL = document.querySelector("#nameL");
  const nameR = document.querySelector("#nameR");
  nameL.textContent = fighters[0].name; nameL.style.color = fighters[0].color;
  nameR.textContent = fighters[1].name; nameR.style.color = fighters[1].color;

  updateRoundLabel();
  matchOver = false;
  roundOver = false;
}

function nowMs() { return Date.now(); }

/* ------------------------------- rede ------------------------------ */

function setupNet() {
  OBR.broadcast.onMessage(CH.INPUT, (ev) => {
    const d = ev.data;
    if (!d || d.slot === mySlot) return;
    const f = fighters[d.slot];
    if (!f) return;
    f.tx = d.x; f.ty = d.y;
    f.mouse = { x: d.mx, y: d.my };
  });

  OBR.broadcast.onMessage(CH.FIRE, (ev) => spawnFire(ev.data));
  OBR.broadcast.onMessage(CH.EVT, (ev) => applyEvt(ev.data));
}

function broadcast(channel, data, dest = "REMOTE") {
  try { OBR.broadcast.sendMessage(channel, data, { destination: dest }); } catch (e) {}
}

// Envia posição/mira no MÁXIMO ~18x/seg por lutador. Os outros clientes
// interpolam (lerp) entre os pacotes, então o movimento fica liso mesmo com
// poucas mensagens — bem menos tráfego, sem o lag de mandar 60x/seg.
const INPUT_INTERVAL = 55; // ms
const _inputAt = {};
function sendInput(slot) {
  const f = fighters[slot];
  if (!f) return;
  const t = nowMs();
  if (t - (_inputAt[slot] || 0) < INPUT_INTERVAL) return;
  _inputAt[slot] = t;
  broadcast(CH.INPUT, { slot, x: f.x, y: f.y, mx: f.mouse.x, my: f.mouse.y });
}

// Dispara um ataque: aplica localmente e avisa os outros.
function emitFire(data) {
  spawnFire(data);
  broadcast(CH.FIRE, data);
}

function spawnFire(d) {
  if (!d) return;
  const owner = fighters[d.slot];
  if (!owner) return;

  if (d.kind === "dash") {
    owner.kx = d.kx; owner.ky = d.ky;
    owner.iframes = d.iframes || 0;
    if (d.iframes) { owner.scaleX = 1.6; owner.scaleY = 0.5; }
    return;
  }
  if (d.kind === "melee") {
    playAttack(owner);
    melees.push({ owner, angle: d.angle, life: 9, range: 60 + (d.charge || 0) * 12, charge: d.charge || 0, hasHit: false });
    return;
  }
  // ranged / magic
  playAttack(owner);
  const c = d.charge || 0;
  projectiles.push({
    x: d.x, y: d.y,
    dx: Math.cos(d.angle) * d.speed, dy: Math.sin(d.angle) * d.speed,
    color: d.color, slot: d.slot, dmgKey: d.dmgKey, r: 8 + c * 5, charge: c,
  });
}

// Eventos do host -> todo mundo
function applyEvt(d) {
  if (!d) return;
  if (d.type === EVT.HIT) {
    const t = fighters[d.target];
    if (!t) return;
    t.sheet.hp = d.hp;
    if (d.ep != null && fighters[d.attacker]) fighters[d.attacker].sheet.ep = d.ep;
    playHurt(t, d.fromX, d.fromY);
    showText(t, d.text, d.color);
  } else if (d.type === EVT.MISS) {
    const t = fighters[d.target];
    if (t) showText(t, d.text, d.textColor || "#fff");
  } else if (d.type === EVT.SYNC) {
    for (let i = 0; i < 2; i++) {
      if (!fighters[i]) continue;
      if (d.hp?.[i] != null) fighters[i].sheet.hp = d.hp[i];
      if (d.ep?.[i] != null) fighters[i].sheet.ep = d.ep[i];
    }
    round = d.round ?? round;
    wins = d.wins || wins;
    if (d.roundStartedAt) roundStartedAt = d.roundStartedAt;
    updateRoundLabel();
  } else if (d.type === EVT.ROUND) {
    startRoundLocal(d.round, d.startedAt, d.hp, d.ep);
  } else if (d.type === EVT.END) {
    matchOver = true;
    wins = d.wins || wins;
    const w = fighters[d.winner];
    const mine = d.winner === mySlot;
    showOverlay(
      d.winner < 0 ? "Empate!" : `🏆 ${w?.name || "?"} venceu!`,
      d.winner < 0 ? "" : (mine ? "Você venceu o duelo." : `Placar ${wins[0]}–${wins[1]}`)
    );
  }
}

function broadcastEvt(d) { broadcast(CH.EVT, d); }

/* ---------------------------- controles ---------------------------- */

addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

addEventListener("mousemove", (e) => {
  if (mySlot < 0 || !fighters[mySlot]) return;
  fighters[mySlot].mouse = { x: e.clientX, y: e.clientY };
});

// Cada poder da ficha (dmgMelee / dmgRanged / dmgMagic) vira um projétil ou golpe.
function fireSpec(dmgKey) {
  if (dmgKey === "dmgMelee") return { kind: "melee" };
  if (dmgKey === "dmgMagic") return { kind: "magic", color: "#a0f", speed: 6 };
  return { kind: "ranged", color: "#ff0", speed: 9 }; // dmgRanged
}

function doAttack(dmgKey) {
  const p = fighters[mySlot];
  if (!p || p.atkCd > 0) return;
  const a = angleTo(p);
  const charge = p.epCharge || 0;
  emitFire({ slot: mySlot, dmgKey, angle: a, x: p.x, y: p.y, charge, ...fireSpec(dmgKey) });
  p.atkCd = GLOBAL_COOLDOWN;
  p.epCharge = 0;
}

function chargeEp() {
  const p = fighters[mySlot];
  if (!p) return;
  if (p.epCharge < 5 && p.epCharge < (p.sheet.ep || 0)) {
    p.epCharge++;
    showText(p, `EP ${p.epCharge}`, "#39f");
    p.flash = 0.5;
  } else if ((p.sheet.ep || 0) <= 0) {
    showText(p, "SEM EP", "#f55");
  }
}

// não deixa o menu do botão direito abrir dentro da arena
addEventListener("contextmenu", (e) => e.preventDefault());

addEventListener("mousedown", (e) => {
  if (mySlot < 0 || roundOver || matchOver) return;
  const p = fighters[mySlot];
  p.mouse = { x: e.clientX, y: e.clientY }; // mira no ponto do clique
  // botão esquerdo = poder 1 (atk1) · botão direito = poder 2 (atk2)
  const dmgKey = e.button === 2 ? (p.sheet.atk2 || "dmgMelee") : (p.sheet.atk1 || "dmgRanged");
  if (e.shiftKey) { chargeEp(); return; }   // Shift+clique carrega EP
  doAttack(dmgKey);
});

addEventListener("keydown", (e) => {
  if (e.code !== "Space" || mySlot < 0 || roundOver || matchOver) return;
  const p = fighters[mySlot];
  if (p.dashCd > 0) return;
  p.dashCd = 45;
  const a = angleTo(p);
  const kx = Math.cos(a) * 40, ky = Math.sin(a) * 40;
  const test = rollFormula("2d6").total + (p.sheet.agility || 0);
  const iframes = test >= 9 ? 18 : 0;
  showText(p, iframes ? "DASH!" : "dash", iframes ? "#0ff" : "#aaa");
  emitFire({ slot: mySlot, kind: "dash", kx, ky, iframes });
});

function angleTo(p) { return Math.atan2(p.mouse.y - p.y, p.mouse.x - p.x); }

// Slots que ESTE cliente move localmente (não devem ser suavizados pela rede):
// o meu lutador e, no modo treino do host, o lutador-bot (slot 1).
function isLocalSlot(i) {
  return i === mySlot || (config.training && isHost && i === 1);
}

/* ----------------------- combate (autoritativo) -------------------- */

// Só o host resolve dano. Os outros só removem o projétil (visual).
function resolveHit(attacker, target, dmgKey, charge = 0) {
  if (!isHost) return;
  if (target.iframes > 0) {
    const m = { type: EVT.MISS, target: target.slot, text: "DODGE", textColor: "#0ff" };
    applyEvt(m); broadcastEvt(m);
    return;
  }
  const hit = rollHit(attacker.sheet, target.sheet);
  if (!hit.hit) {
    const m = { type: EVT.MISS, target: target.slot, text: "MISS", textColor: "#fff" };
    applyEvt(m); broadcastEvt(m);
    return;
  }
  let dmg = rollFormula(attacker.sheet[dmgKey]).total;
  let ignoreArmor = 0;
  if (charge > 0) {
    dmg += rollFormula(EP_DICE[charge]).total;
    ignoreArmor = EP_IGNORE_ARMOR[charge] || 0;
    attacker.sheet.ep = Math.max(0, (attacker.sheet.ep || 0) - charge);
  }
  const armor = Math.max(0, (target.sheet.armor || 0) - ignoreArmor);
  const final = Math.max(0, dmg - armor);
  target.sheet.hp = Math.max(0, target.sheet.hp - final);

  const evt = {
    type: EVT.HIT, target: target.slot, attacker: attacker.slot,
    hp: target.sheet.hp, ep: attacker.sheet.ep,
    text: `-${final}`, color: charge >= 3 ? "#ff0" : "#f44",
    fromX: attacker.x, fromY: attacker.y,
  };
  applyEvt(evt); broadcastEvt(evt);

  if (target.sheet.hp <= 0) endRound(attacker.slot);
}

/* --------------------------- rounds / fim -------------------------- */

function endRound(winnerSlot) {
  if (!isHost || roundOver || matchOver) return;
  roundOver = true;
  if (winnerSlot >= 0) wins[winnerSlot]++;
  updateRoundLabel();

  const matchWon = (winnerSlot >= 0 && wins[winnerSlot] >= needToWin) || round >= (config.rounds || 1);
  setTimeout(() => {
    if (matchWon) endMatch();
    else startRoundHost(round + 1);
  }, 1400);
}

function endMatch() {
  let winner;
  if (wins[0] === wins[1]) winner = decideByHp();
  else winner = wins[0] > wins[1] ? 0 : 1;
  const evt = { type: EVT.END, winner, wins };
  applyEvt(evt); broadcastEvt(evt);
  // fecha a arena pra todos depois de mostrar o resultado
  setTimeout(() => { OBR.room.setMetadata({ [DUEL_META]: { active: false } }).catch(() => {}); }, 6000);
}

function decideByHp() {
  const f0 = fighters[0].sheet.hp / (fighters[0].sheet.hpMax || 1);
  const f1 = fighters[1].sheet.hp / (fighters[1].sheet.hpMax || 1);
  if (Math.abs(f0 - f1) < 1e-6) return -1;
  return f0 > f1 ? 0 : 1;
}

function startRoundHost(n) {
  const startedAt = nowMs();
  for (const f of fighters) { f.sheet.hp = f.sheet.hpMax; f.sheet.ep = f.sheet.epMax; }
  const hp = [fighters[0].sheet.hpMax, fighters[1].sheet.hpMax];
  const ep = [fighters[0].sheet.epMax, fighters[1].sheet.epMax];
  const evt = { type: EVT.ROUND, round: n, startedAt, hp, ep };
  applyEvt(evt); broadcastEvt(evt);
}

function startRoundLocal(n, startedAt, hp, ep) {
  round = n;
  roundStartedAt = startedAt;
  roundOver = false;
  for (let i = 0; i < 2; i++) {
    if (!fighters[i]) continue;
    if (hp?.[i] != null) fighters[i].sheet.hp = hp[i];
    if (ep?.[i] != null) fighters[i].sheet.ep = ep[i];
    fighters[i].iframes = 0; fighters[i].atkCd = 0; fighters[i].dashCd = 0; fighters[i].epCharge = 0;
  }
  projectiles.length = 0; melees.length = 0; floats.length = 0;
  placeFighters();
  updateRoundLabel();
  flashRoundBanner(`ROUND ${n}`);
}

function updateRoundLabel() {
  const total = config.rounds || 1;
  document.querySelector("#round").textContent =
    total > 1 ? `Round ${round} / ${total}   ·   ${wins[0]} – ${wins[1]}` : "";
}

function flashRoundBanner(text) {
  showOverlay(text, "");
  setTimeout(hideOverlay, 900);
}

/* --------------------------- timer / loop -------------------------- */

function remainingSeconds() {
  if (!config.minutes) return Infinity;
  const total = config.minutes * 60;
  const elapsed = (nowMs() - roundStartedAt) / 1000;
  return Math.max(0, total - elapsed);
}

function formatTimer(sec) {
  if (sec === Infinity) return "∞";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function loop() {
  if (!matchOver) update();
  draw();
  requestAnimationFrame(loop);
}

function update() {
  if (mySlot >= 0 && !roundOver) {
    const me = fighters[mySlot];
    const s = me.sheet.speed || 3;
    if (keys.w) me.y -= s;
    if (keys.s) me.y += s;
    if (keys.a) me.x -= s;
    if (keys.d) me.x += s;
    clampToArena(me);
    sendInput(mySlot);
  }

  // bot de treino: host controla o lutador 1
  if (config.training && isHost && !roundOver && fighters[1]) {
    runBot(fighters[1], fighters[0]);
  }

  for (let i = 0; i < 2; i++) {
    const f = fighters[i];
    if (!f) continue;
    if (!isLocalSlot(i)) {
      // lutadores que não controlo localmente vêm suavizados da rede.
      // fator menor = glide mais contínuo entre os pacotes (que agora são ~18/s)
      f.x = lerp(f.x, f.tx, 0.22);
      f.y = lerp(f.y, f.ty, 0.22);
    }
  }

  updateProjectiles();
  updateMelees();
  updateAnims();

  if (isHost && !roundOver && !matchOver && remainingSeconds() <= 0) {
    endRound(decideByHp());
  }

  if (isHost && !matchOver) maybeSync();

  drawHud();
}

let _lastSync = 0;
function maybeSync() {
  const t = nowMs();
  if (t - _lastSync < 1000) return;
  _lastSync = t;
  broadcastEvt({
    type: EVT.SYNC,
    hp: [fighters[0].sheet.hp, fighters[1].sheet.hp],
    ep: [fighters[0].sheet.ep, fighters[1].sheet.ep],
    round, wins, roundStartedAt,
  });
}

function clampToArena(f) {
  const r = arenaRect();
  f.x = Math.max(r.left + 18, Math.min(r.right - 18, f.x));
  f.y = Math.max(r.top + 18, Math.min(r.bottom - 18, f.y));
}

function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.x += pr.dx; pr.y += pr.dy;
    const target = fighters[1 - pr.slot];
    if (!target) { projectiles.splice(i, 1); continue; }
    const dist = Math.hypot(pr.x - target.x, pr.y - target.y);
    const r = arenaRect();
    if (dist < 24) {
      resolveHit(fighters[pr.slot], target, pr.dmgKey, pr.charge || 0);
      projectiles.splice(i, 1);
    } else if (pr.x < r.left || pr.y < r.top || pr.x > r.right || pr.y > r.bottom) {
      projectiles.splice(i, 1);
    }
  }
}

function updateMelees() {
  for (let i = melees.length - 1; i >= 0; i--) {
    const m = melees[i];
    const target = fighters[1 - m.owner.slot];
    if (target && !m.hasHit) {
      const dist = Math.hypot(target.x - m.owner.x, target.y - m.owner.y);
      if (dist < m.range) {
        m.hasHit = true;
        resolveHit(m.owner, target, "dmgMelee", m.charge || 0);
      }
    }
    if (--m.life <= 0) melees.splice(i, 1);
  }
}

function runBot(foe, me) {
  const shoot = (p, dmgKey, color, speed) => {
    const a = Math.atan2(p.mouse.y - p.y, p.mouse.x - p.x);
    emitFire({ slot: p.slot, kind: dmgKey === "dmgMagic" ? "magic" : "ranged", dmgKey, color, speed, angle: a, x: p.x, y: p.y, charge: 0 });
  };
  const melee = (p) => {
    const a = Math.atan2(p.mouse.y - p.y, p.mouse.x - p.x);
    emitFire({ slot: p.slot, kind: "melee", dmgKey: "dmgMelee", angle: a, charge: 0 });
  };
  const r = arenaRect();
  updateBot(foe, me, shoot, melee, { width: r.right, height: r.bottom });
  clampToArena(foe);
  sendInput(foe.slot);
}

/* ------------------------------ anim ------------------------------- */

function playHurt(target, fromX, fromY) {
  target.flash = 1; target.shake = 12;
  target.scaleX = 1.4; target.scaleY = 0.6;
  const a = Math.atan2(target.y - fromY, target.x - fromX);
  target.kx = Math.cos(a) * 18; target.ky = Math.sin(a) * 18;
}

function playAttack(p) { p.charge = 1; p.scaleX = 0.7; p.scaleY = 1.3; }

function updateAnims() {
  for (const p of fighters) {
    if (!p) continue;
    p.scaleX = lerp(p.scaleX, 1, 0.2);
    p.scaleY = lerp(p.scaleY, 1, 0.2);
    p.flash = lerp(p.flash, 0, 0.15);
    p.shake = lerp(p.shake, 0, 0.2);
    p.charge = lerp(p.charge, 0, 0.25);
    p.x += p.kx; p.y += p.ky;
    p.kx = lerp(p.kx, 0, 0.3);
    p.ky = lerp(p.ky, 0, 0.3);
    if (isLocalSlot(p.slot)) clampToArena(p);
    if (p.dashCd > 0) p.dashCd--;
    if (p.iframes > 0) p.iframes--;
    if (p.atkCd > 0) p.atkCd--;
  }
}

function showText(p, text, color) {
  floats.push({ x: p.x, y: p.y - 30, text, color, life: 40 });
}

/* ------------------------------ desenho ---------------------------- */

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawArena();

  for (const pr of projectiles) {
    ctx.save();
    ctx.shadowColor = pr.color; ctx.shadowBlur = 15;
    ctx.fillStyle = pr.color;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, 7); ctx.fill();
    ctx.restore();
  }

  for (const m of melees) {
    const o = m.owner, prog = 1 - m.life / 9;
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(m.angle);
    ctx.strokeStyle = `rgba(255,255,255,${1 - prog})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(20, 0, m.range, -1 + prog * 2, 1 + prog * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const p of fighters) {
    if (!p) continue;
    const sx = (Math.random() - 0.5) * p.shake;
    const sy = (Math.random() - 0.5) * p.shake;
    ctx.save();
    ctx.globalAlpha = p.iframes > 0 ? 0.4 + 0.3 * Math.sin(nowMs() / 40) : 1;
    ctx.translate(p.x + sx, p.y + sy);
    ctx.scale(p.scaleX, p.scaleY);
    const R = 18;
    if (p.imgReady && p.img) {
      // imagem do token recortada num círculo
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.clip();
      // "cover": preenche o círculo sem esticar (mantém a proporção)
      const iw = p.img.naturalWidth || R * 2, ih = p.img.naturalHeight || R * 2;
      const sc = Math.max((R * 2) / iw, (R * 2) / ih);
      const dw = iw * sc, dh = ih * sc;
      ctx.drawImage(p.img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      // fallback: bolinha colorida enquanto a imagem não carrega / não existe
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    }
    // anel da cor do lutador (identifica os lados)
    ctx.strokeStyle = p.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    if (p.flash > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${p.flash})`;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    if (p.epCharge > 0) {
      ctx.strokeStyle = "#39f"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 20 + p.epCharge * 4, 0, 7); ctx.stroke();
      ctx.fillStyle = "#39f"; ctx.font = "bold 18px sans-serif";
      ctx.fillText(`⚡ ${p.epCharge}`, p.x - 16, p.y - 44);
    }

    drawBars(p);
  }

  if (mySlot >= 0 && fighters[mySlot]) {
    const me = fighters[mySlot], a = angleTo(me);
    ctx.fillStyle = me.atkCd > 0 ? "#888" : "#fff";
    ctx.beginPath(); ctx.arc(me.x + Math.cos(a) * 34, me.y + Math.sin(a) * 34, 5, 0, 7); ctx.fill();
  }

  drawFloats();
  drawTimer();
}

function drawArena() {
  const r = arenaRect();
  ctx.save();
  ctx.strokeStyle = "#ffffff55";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#000"; ctx.shadowBlur = 12;
  ctx.strokeRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
  ctx.restore();
}

function drawBars(p) {
  const s = p.sheet, W = 44, x = p.x - W / 2, y = p.y - 40;
  const bar = (yy, frac, col) => {
    ctx.fillStyle = "#0008"; ctx.fillRect(x, yy, W, 5);
    ctx.fillStyle = col; ctx.fillRect(x, yy, W * Math.max(0, Math.min(1, frac)), 5);
  };
  bar(y, s.hpMax ? s.hp / s.hpMax : 0, "#e33");
  bar(y + 7, (s.armor || 0) / 5, "#999");
  bar(y + 14, s.epMax ? s.ep / s.epMax : 0, "#39f");
}

function drawFloats() {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.y -= 1; f.life--;
    ctx.fillStyle = f.color;
    ctx.globalAlpha = f.life / 40;
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
    if (f.life <= 0) floats.splice(i, 1);
  }
}

function drawTimer() {
  document.querySelector("#timer").textContent = formatTimer(remainingSeconds());
}

function drawHud() {
  const me = mySlot >= 0 ? fighters[mySlot] : null;
  const roleTxt = mySlot < 0 ? "👁️ Espectador" : `🎮 ${me.name}`;
  const host = isHost ? " · host" : "";
  let extra = "";
  if (me) {
    extra = `HP ${me.sheet.hp}/${me.sheet.hpMax} · EP ${me.sheet.ep} · carga ${me.epCharge} · ${me.atkCd > 0 ? "🔴" : "🟢"}`;
  }
  document.querySelector("#hud").innerHTML = `
    <b>${roleTxt}</b>${host}<br>
    ${extra}<br>
    <small>${mySlot >= 0 ? "WASD mover · Mouse mirar · Clique ESQ/DIR = poderes da ficha · Shift+clique carrega EP · Espaço dash" : "Assistindo em tempo real"}</small>
  `;
}

/* ----------------------------- overlay ----------------------------- */

function showOverlay(big, sub) {
  const ov = document.querySelector("#overlay");
  document.querySelector("#ovBig").textContent = big;
  document.querySelector("#ovSub").textContent = sub || "";
  ov.style.display = "flex";
}
function hideOverlay() { document.querySelector("#overlay").style.display = "none"; }
