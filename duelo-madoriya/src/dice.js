// Interpreta uma fórmula tipo "1d8+3", "2d6", "1d12-1" e rola de verdade.
export function rollFormula(formula) {
  const m = String(formula).replace(/\s/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return { total: Number(formula) || 0, rolls: [] };
  const count = +m[1], sides = +m[2], mod = m[3] ? +m[3] : 0;
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + mod;
  return { total, rolls, mod };
}

// O teste de ACERTO que você pediu: mesmo colidindo, pode errar.
// 2d6 + hitBonus do atacante vs dodge do alvo.
export function rollHit(attacker, defender) {
  const r = rollFormula("2d6");
  const value = r.total + (attacker.hitBonus || 0);
  return { hit: value >= (defender.dodge || 9), value, dice: r.rolls };
}