import { getSheet } from "./sheet.js";
import { rollHit, rollFormula } from "./dice.js";
import { lerp } from "./anim.js";
import { botState, updateBot } from "./bot.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
canvas.width = innerWidth; canvas.height = innerHeight;

function makeFighter(x, y, color) {
  const s = { ...getSheet({ metadata: {} }) };
  // MODO TESTE: garante EP pra testar o nitro mesmo se a ficha vier zerada
  if (!s.epMax || s.epMax < 5) { s.epMax = 5; s.ep = 5; }
  return {
    x, y, color, sheet: s, mouse: { x, y },
    scaleX: 1, scaleY: 1, flash: 0, shake: 0, charge: 0, kx: 0, ky: 0,
    epCharge: 0, iframes: 0, dashCd: 0, atkCd: 0   // atkCd = cooldown GLOBAL
  };
}
const players = {
  me:  makeFighter(300, 400, "#4af"),
  foe: makeFighter(900, 400, "#f55")
};
const projectiles = [];
const melees = [];
const keys = {};
const floats = [];
let gameOver = false;

const EP_DICE = { 1: "1d8", 2: "1d10", 3: "1d12", 4: "1d15", 5: "1d18" };
const EP_IGNORE_ARMOR = { 5: 3 };

// COOLDOWN GLOBAL: um só pra todos os ataques (em frames; 60 = 1s)
const GLOBAL_COOLDOWN = 28;

addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
addEventListener("keyup",   e => keys[e.key.toLowerCase()] = false);

addEventListener("mousemove", e => {
  players.me.mouse = { x: e.clientX, y: e.clientY };
});

addEventListener("keydown", e => {
  const p = players.me;

  // NITRO: Shift + 1/2/3 carrega EP (só dano + visual, sem velocidade)
  if (e.shiftKey && ["1", "2", "3"].includes(e.key)) {
    if (p.epCharge < 5 && p.epCharge < p.sheet.ep) {
      p.epCharge++;
      showText(p, `EP CARREGADO: ${p.epCharge}`, "#39f");
      p.flash = 0.5;
    } else if (p.sheet.ep <= 0) {
      showText(p, "SEM EP", "#f55");
    }
    return;
  }

  // Ataques agora usam UM cooldown global compartilhado
  if (p.atkCd > 0) return;
  if (e.key === "1") { playAttack(p); shoot(p, "dmgRanged", "#ff0", 9); p.atkCd = GLOBAL_COOLDOWN; }
  if (e.key === "2") { playAttack(p); shoot(p, "dmgMagic",  "#a0f", 6); p.atkCd = GLOBAL_COOLDOWN; }
  if (e.key === "3") { playAttack(p); melee(p);                          p.atkCd = GLOBAL_COOLDOWN; }
});

addEventListener("keydown", e => {
  if (e.code !== "Space") return;
  const p = players.me;
  if (p.dashCd > 0) return;
  p.dashCd = 45;
  const a = angleTo(p);
  p.kx = Math.cos(a) * 40;
  p.ky = Math.sin(a) * 40;
  const test = rollFormula("2d6").total + (p.sheet.agility || 0);
  if (test >= 9) {
    p.iframes = 18;
    showText(p, "DASH!", "#0ff");
    p.scaleX = 1.6; p.scaleY = 0.5;
  } else {
    showText(p, "dash", "#aaa");
  }
});

addEventListener("keydown", e => {
  if (e.key.toLowerCase() === "b") {
    botState.mode = (botState.mode + 1) % 3;
    const nomes = ["PARADO", "ANDANDO", "REVIDA"];
    showText(players.foe, `BOT: ${nomes[botState.mode]}`, "#0ff");
  }
  if (e.key.toLowerCase() === "r") resetDuel();
});

function angleTo(p) { return Math.atan2(p.mouse.y - p.y, p.mouse.x - p.x); }

function shoot(p, dmgKey, color, speed) {
  const a = angleTo(p);
  const charge = p.epCharge || 0;
  projectiles.push({
    x: p.x, y: p.y, dx: Math.cos(a) * speed, dy: Math.sin(a) * speed,
    color, owner: p, dmgKey, r: 8 + charge * 5, charge
  });
  if (charge > 0) { p.sheet.ep -= charge; p.epCharge = 0; }
}

function melee(p) {
  const a = angleTo(p);
  const charge = p.epCharge || 0;
  melees.push({ owner: p, angle: a, life: 9, range: 60 + charge * 12, charge });
  if (charge > 0) { p.sheet.ep -= charge; p.epCharge = 0; }
}

function playHurt(target, fromX, fromY) {
  target.flash = 1;
  target.shake = 12;
  target.scaleX = 1.4; target.scaleY = 0.6;
  const a = Math.atan2(target.y - fromY, target.x - fromX);
  target.kx = Math.cos(a) * 18;
  target.ky = Math.sin(a) * 18;
}

function playAttack(p) {
  p.charge = 1;
  p.scaleX = 0.7; p.scaleY = 1.3;
}

function updateAnims() {
  for (const id in players) {
    const p = players[id];
    p.scaleX = lerp(p.scaleX, 1, 0.2);
    p.scaleY = lerp(p.scaleY, 1, 0.2);
    p.flash  = lerp(p.flash,  0, 0.15);
    p.shake  = lerp(p.shake,  0, 0.2);
    p.charge = lerp(p.charge, 0, 0.25);
    p.x += p.kx; p.y += p.ky;
    p.kx = lerp(p.kx, 0, 0.3);
    p.ky = lerp(p.ky, 0, 0.3);
    if (p.dashCd > 0) p.dashCd--;
    if (p.iframes > 0) p.iframes--;
    if (p.atkCd > 0) p.atkCd--; // decrementa o cooldown global
  }
}

function showText(p, text, color) {
  floats.push({ x: p.x, y: p.y - 30, text, color, life: 40 });
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

function resolveHit(attacker, target, dmgKey, charge = 0) {
  if (target.iframes > 0) { showText(target, "DODGE", "#0ff"); return; }
  const hit = rollHit(attacker.sheet, target.sheet);
  if (!hit.hit) { showText(target, "MISS", "#fff"); return; }

  let dmg = rollFormula(attacker.sheet[dmgKey]).total;
  let ignoreArmor = 0;
  if (charge > 0) {
    dmg += rollFormula(EP_DICE[charge]).total;
    ignoreArmor = EP_IGNORE_ARMOR[charge] || 0;
  }
  const armor = Math.max(0, (target.sheet.armor || 0) - ignoreArmor);
  const final = Math.max(0, dmg - armor);
  target.sheet.hp -= final;
  playHurt(target, attacker.x, attacker.y);
  showText(target, `-${final}`, charge >= 3 ? "#ff0" : "#f44");
  if (target.sheet.hp <= 0) endDuel(attacker);
}

function endDuel(winner) {
  if (gameOver) return;
  gameOver = true;
  const name = winner === players.me ? "VOCÊ" : "RIVAL";
  if (typeof OBR !== "undefined") OBR.notification?.show?.(`${name} venceu o duelo!`);
  const div = document.createElement("div");
  div.className = "victory";
  div.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;
    justify-content:center;background:#000a;color:#fff;font-size:48px;
    font-family:sans-serif;`;
  div.textContent = `🏆 ${name} venceu!  (R para reiniciar)`;
  document.body.appendChild(div);
}

function resetDuel() {
  gameOver = false;
  document.querySelectorAll(".victory").forEach(d => d.remove());
  for (const id in players) {
    const p = players[id];
    p.sheet.hp = p.sheet.hpMax;
    p.sheet.ep = p.sheet.epMax;
    p.epCharge = 0; p.iframes = 0; p.dashCd = 0; p.atkCd = 0;
  }
  players.me.x = 300; players.me.y = 400;
  players.foe.x = 900; players.foe.y = 400;
  projectiles.length = 0; melees.length = 0; floats.length = 0;
  loop();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  for (const id in players) {
    const p = players[id];
    const sx = (Math.random() - 0.5) * p.shake;
    const sy = (Math.random() - 0.5) * p.shake;
    ctx.save();
    ctx.globalAlpha = p.iframes > 0 ? 0.4 + 0.3 * Math.sin(Date.now() / 40) : 1;
    ctx.translate(p.x + sx, p.y + sy);
    ctx.scale(p.scaleX, p.scaleY);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill();
    if (p.flash > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${p.flash})`;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    if (p.epCharge > 0) {
      ctx.strokeStyle = "#39f"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 20 + p.epCharge * 4, 0, 7); ctx.stroke();
      ctx.fillStyle = "#39f"; ctx.font = "bold 22px sans-serif";
      ctx.fillText(`⚡ EP ${p.epCharge}`, p.x - 28, p.y - 48);
    }

    drawBars(p);
  }

  const me = players.me, a = angleTo(me);
  // mira muda de cor quando o ataque está em cooldown (feedback visual)
  ctx.fillStyle = me.atkCd > 0 ? "#888" : "#fff";
  ctx.beginPath(); ctx.arc(me.x + Math.cos(a) * 34, me.y + Math.sin(a) * 34, 5, 0, 7); ctx.fill();

  drawFloats();
}

function drawBars(p) {
  const s = p.sheet, W = 44, x = p.x - W / 2, y = p.y - 40;
  const bar = (yy, frac, col) => {
    ctx.fillStyle = "#0008"; ctx.fillRect(x, yy, W, 5);
    ctx.fillStyle = col;     ctx.fillRect(x, yy, W * Math.max(0, frac), 5);
  };
  bar(y,      s.hp / s.hpMax,     "#e33");
  bar(y + 7,  (s.armor || 0) / 5, "#999");
  bar(y + 14, s.ep / s.epMax,     "#39f");
}

function drawDebugHud() {
  const me = players.me, foe = players.foe;
  document.querySelector("#hud").innerHTML = `
    <b>MODO TESTE</b><br>
    Você: HP ${me.sheet.hp}/${me.sheet.hpMax} | EP total ${me.sheet.ep} | <span style="color:#6cf">EP carregado: ${me.epCharge}</span> | CD ${me.atkCd > 0 ? "🔴" : "🟢"}<br>
    Bot: HP ${foe.sheet.hp}/${foe.sheet.hpMax} | Modo ${botState.mode}<br>
    <small>WASD mover · Mouse mirar · 1/2/3 atacar (cooldown único) · Shift+ataque carrega EP</small><br>
    <small>Espaço dash · B troca bot · R reseta</small>
  `;
}

function loop() {
  if (gameOver) return;

  const s = players.me.sheet.speed || 3;
  const me = players.me;
  if (keys.w) me.y -= s;
  if (keys.s) me.y += s;
  if (keys.a) me.x -= s;
  if (keys.d) me.x += s;
  me.x = Math.max(18, Math.min(canvas.width - 18, me.x));
  me.y = Math.max(18, Math.min(canvas.height - 18, me.y));

  updateBot(players.foe, players.me, shoot, melee, canvas);

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.x += pr.dx; pr.y += pr.dy;
    const target = pr.owner === players.me ? players.foe : players.me;
    const dist = Math.hypot(pr.x - target.x, pr.y - target.y);
    if (dist < 24) {
      resolveHit(pr.owner, target, pr.dmgKey, pr.charge || 0);
      projectiles.splice(i, 1);
    } else if (pr.x < 0 || pr.y < 0 || pr.x > canvas.width || pr.y > canvas.height) {
      projectiles.splice(i, 1);
    }
  }

  for (let i = melees.length - 1; i >= 0; i--) {
    const mlee = melees[i];
    const target = mlee.owner === players.me ? players.foe : players.me;
    const dist = Math.hypot(target.x - mlee.owner.x, target.y - mlee.owner.y);
    if (dist < mlee.range) {
      resolveHit(mlee.owner, target, "dmgMelee", mlee.charge || 0);
      mlee.charge = 0;
    }
    if (--mlee.life <= 0) melees.splice(i, 1);
  }

  updateAnims();
  drawDebugHud();
  draw();
  requestAnimationFrame(loop);
}

loop();