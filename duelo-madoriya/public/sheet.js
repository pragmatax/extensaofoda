const META_KEY = "com.duelo-madoriya/sheet";

// Stats padrão de um duelista novo, baseados no Madoriya 1.5
export const defaultSheet = {
  name: "Duelista",
  hp: 14, hpMax: 14,        // Vida (10 + 1d6 na criação)
  armor: 2,                 // Redução de dano
  ep: 5, epMax: 5,          // Espaços de Poder (nitro)
  speed: 3,                 // Velocidade = base + Agilidade
  agility: 1,               // Atributo: chance de dash perfeito
  // As 3 fórmulas de ataque que VOCÊ pediu (cada um é editável):
  dmgRanged: "1d8+2",       // Tiro: dado da arma + Mira
  dmgMagic: "1d6+2",        // Magia: 1d6 + Força de Vontade
  dmgMelee: "1d8+1",        // Físico: dado da arma + Combate
  // Teste de acerto e esquiva (modo dado):
  hitBonus: 2,              // somado ao 2d6 do acerto (Mira/Combate)
  dodge: 9                  // número-alvo do alvo (8 + Agilidade)
};

// Lê a ficha de um item (token). Se não tiver, devolve a padrão.
export function getSheet(item) {
  return { ...defaultSheet, ...(item.metadata[META_KEY] || {}) };
}

// Salva a ficha dentro do token, na cena do Owlbear.
export async function saveSheet(itemId, sheet) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) it.metadata[META_KEY] = sheet;
  });
}