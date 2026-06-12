// Constantes compartilhadas entre o painel (src/main.js) e a arena (public/game.js).
// Sem import de OBR de propósito: cada lado usa a sua própria instância do SDK.

export const DUEL_META = "com.duelo-madoriya/duel";
export const ARENA_POPOVER = "com.duelo-madoriya/arena";

// Canais de broadcast da partida.
export const CH = {
  INPUT: "madoriya/input", // controlador -> posição/mira do seu lutador
  FIRE: "madoriya/fire",   // controlador -> ataque (todos spawnam o mesmo visual)
  EVT: "madoriya/evt",     // HOST -> dano/HP/round/fim (fonte da verdade)
};

// Tipos de evento no canal EVT (mandados só pelo host).
export const EVT = {
  HIT: "hit",
  MISS: "miss",
  SYNC: "sync",   // reconciliação periódica + entrada de espectadores atrasados
  ROUND: "round", // começou um novo round
  END: "end",     // fim da partida
};

// Cores dos dois lutadores.
export const FIGHTER_COLORS = ["#4af", "#f55"];

// Dados de EP por nível de carga e quanto de armadura ele ignora.
export const EP_DICE = { 1: "1d8", 2: "1d10", 3: "1d12", 4: "1d15", 5: "1d18" };
export const EP_IGNORE_ARMOR = { 5: 3 };
export const GLOBAL_COOLDOWN = 28;

// Config padrão da partida (o GM ajusta no painel).
export const DEFAULT_CONFIG = {
  minutes: 3,
  rounds: 1,
  bgUrl: "",
  bgBlur: 6,
  bgOpacity: 0.35,
  training: false,
  scale: 1, // multiplicador de tamanho dos tokens/combate + zoom do mapa
};

// Escalas disponíveis (a atual, 1×, é o mínimo; as outras dão mais zoom).
export const SCALES = [
  { value: 1, label: "1× (mínimo)" },
  { value: 1.5, label: "1.5× — médio" },
  { value: 2, label: "2× — grande" },
  { value: 2.5, label: "2.5× — máximo" },
];
