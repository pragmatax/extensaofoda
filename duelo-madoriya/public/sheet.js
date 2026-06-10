import OBR from "@owlbear-rodeo/sdk";

const META_KEY = "com.duelo-madoriya/sheet";

export const defaultSheet = {
  name: "Duelista",
  hp: 14, hpMax: 14,
  armor: 2,
  ep: 5, epMax: 5,
  speed: 3,
  // 8 atributos do Madoriya
  combate: 1, agility: 1, mira: 1, eloquencia: 1,
  deducao: 1, inteligencia: 1, vontade: 1, resistencia: 1,
  // 3 fórmulas de dano (livres)
  dmgMelee: "1d8+1",   // Físico
  dmgRanged: "1d8+2",  // Tiro
  dmgMagic: "1d6+2",   // Magia
  // Quais 2 ataques o jogador leva pro duelo (slot1 = clique esq, slot2 = dir)
  atk1: "dmgRanged",
  atk2: "dmgMelee",
  // Acerto/esquiva (modo dado)
  hitBonus: 2,
  dodge: 9,
  // Counters e barras extras (só no token, não vão pra arena)
  counters: [],   // ex: [{label:"EP", value:5, color:"#39f"}]
  bars: []        // ex: [{label:"Mana", value:8, max:10, color:"#0af"}]
};

export function getSheet(item) {
  return { ...defaultSheet, ...(item?.metadata?.[META_KEY] || {}) };
}

export async function saveSheet(itemId, sheet) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) it.metadata[META_KEY] = sheet;
  });
}

export { META_KEY };