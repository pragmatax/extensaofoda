// Modos: 0 = parado (saco de pancada), 1 = anda aleatório, 2 = revida
export const botState = { mode: 0, timer: 0, dir: { x: 0, y: 0 } };

export function updateBot(foe, me, shoot, melee, canvas) {
  if (botState.mode === 0) return;                 // parado: só apanha

  // Movimento aleatório (testa esquiva e colisão)
  if (--botState.timer <= 0) {
    const a = Math.random() * Math.PI * 2;
    botState.dir = { x: Math.cos(a), y: Math.sin(a) };
    botState.timer = 60 + Math.random() * 60;
  }
  const sp = foe.sheet.speed || 3;
  foe.x = Math.max(20, Math.min(canvas.width - 20, foe.x + botState.dir.x * sp));
  foe.y = Math.max(20, Math.min(canvas.height - 20, foe.y + botState.dir.y * sp));

  if (botState.mode === 2 && Math.random() < 0.02) {
    foe.mouse = { x: me.x, y: me.y };              // mira em você
    shoot(foe, "dmgRanged", "#f80", 8);            // e atira de volta
  }
}