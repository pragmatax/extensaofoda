const META_KEY = "com.duelo-madoriya/sheet";

export const defaultSheet = {
  name: "Duelista",
  hp: 14, hpMax: 14,
  armor: 2,
  ep: 5, epMax: 5,
  speed: 3,
  combate: 1, agility: 1, mira: 1, eloquencia: 1,
  deducao: 1, inteligencia: 1, vontade: 1, resistencia: 1,
  dmgMelee: "1d8+1", dmgRanged: "1d8+2", dmgMagic: "1d6+2",
  atk1: "dmgRanged", atk2: "dmgMelee",
  hitBonus: 2, dodge: 9,
  counters: [], bars: []
};

export function getSheet(item) {
  return { ...defaultSheet, ...(item?.metadata?.[META_KEY] || {}) };
}

export { META_KEY };