import OBR from "@owlbear-rodeo/sdk";
import { getSheet, saveSheet, defaultSheet } from "./sheet.js";

let selectedId = null;   // token selecionado agora
let duelists = [];       // os 2 tokens escolhidos pro duelo {id, name}

OBR.onReady(async () => {
  renderPanel();
  // Detecta quando o GM clica num token na cena:
  OBR.player.onChange((p) => {
    selectedId = p.selection?.[0] || null;
    renderPanel();
  });
});

async function renderPanel() {
  const app = document.querySelector("#app");
  let sheetForm = `<p>Selecione um token na cena para editar a ficha.</p>`;

  if (selectedId) {
    const items = await OBR.scene.items.getItems([selectedId]);
    const item = items[0];
    const s = getSheet(item);
    sheetForm = `
      <h3>Ficha: ${item?.name || "Token"}</h3>
      <label>HP <input id="hp" type="number" value="${s.hpMax}"></label>
      <label>Armor <input id="armor" type="number" value="${s.armor}"></label>
      <label>EP <input id="ep" type="number" value="${s.epMax}"></label>
      <label>Velocidade <input id="speed" type="number" value="${s.speed}"></label>
      <label>Agilidade <input id="agility" type="number" value="${s.agility}"></label>
      <hr>
      <label>Dano Tiro <input id="dmgRanged" value="${s.dmgRanged}"></label>
      <label>Dano Magia <input id="dmgMagic" value="${s.dmgMagic}"></label>
      <label>Dano Físico <input id="dmgMelee" value="${s.dmgMelee}"></label>
      <hr>
      <label>Bônus Acerto <input id="hitBonus" type="number" value="${s.hitBonus}"></label>
      <label>Esquiva (alvo) <input id="dodge" type="number" value="${s.dodge}"></label>
      <button id="save">Salvar Ficha</button>
      <button id="addDuelist">Adicionar ao Duelo</button>
    `;
  }

  app.innerHTML = `
    <h2>Duelo Madoriya</h2>
    ${sheetForm}
    <hr>
    <h3>Duelistas (${duelists.length}/2)</h3>
    <ol>${duelists.map(d => `<li>${d.name}</li>`).join("")}</ol>
    ${duelists.length === 2 ? `<button id="startDuel">⚔️ Iniciar Duelo</button>` : ""}
  `;

  // Liga os botões:
  document.querySelector("#save")?.addEventListener("click", saveCurrent);
  document.querySelector("#addDuelist")?.addEventListener("click", addDuelist);
  document.querySelector("#startDuel")?.addEventListener("click", startDuel);
}

function readForm() {
  const v = (id) => document.querySelector(`#${id}`).value;
  return {
    ...defaultSheet,
    hp: +v("hp"), hpMax: +v("hp"),
    armor: +v("armor"),
    ep: +v("ep"), epMax: +v("ep"),
    speed: +v("speed"), agility: +v("agility"),
    dmgRanged: v("dmgRanged"), dmgMagic: v("dmgMagic"), dmgMelee: v("dmgMelee"),
    hitBonus: +v("hitBonus"), dodge: +v("dodge")
  };
}

async function saveCurrent() {
  await saveSheet(selectedId, readForm());
  OBR.notification.show("Ficha salva!");
}

async function addDuelist() {
  await saveCurrent();
  const items = await OBR.scene.items.getItems([selectedId]);
  if (duelists.find(d => d.id === selectedId)) return;
  duelists.push({ id: selectedId, name: items[0]?.name || "Token" });
  if (duelists.length > 2) duelists = duelists.slice(-2);
  renderPanel();
}

let arena = null; // {minX, minY, maxX, maxY}

async function startDuel() {
  OBR.notification.show("Clique e arraste na cena para definir a arena.");

  // Captura 2 cliques no mapa via interaction para definir o retângulo:
  const stop = OBR.scene.onReadyChange(() => {}); // placeholder

  // Forma simples: pede dois pontos usando o cursor do Owlbear.
  // Aqui usamos a tool de interação para ler posições do mapa:
  let firstPoint = null;
  const handler = await OBR.interaction.startItemInteraction(makeRectItem(0,0,0,0));
  // (na prática você captura pointermove/pointerdown do overlay — ver nota abaixo)
}

// Cria o item visual do retângulo da arena na cena:
function makeRectItem(x, y, w, h) {
  return {
    id: "duelo-arena-rect",
    type: "SHAPE",
    shapeType: "RECTANGLE",
    width: w, height: h,
    position: { x, y },
    style: {
      fillColor: "#ff0000", fillOpacity: 0.08,
      strokeColor: "#ff0000", strokeOpacity: 0.9, strokeWidth: 4
    },
    layer: "DRAWING",
    locked: true,
    name: "Arena"
  };
}

// Checa se uma posição está dentro da arena (usado no loop de colisão):
export function insideArena(pos) {
  if (!arena) return true;
  return pos.x >= arena.minX && pos.x <= arena.maxX &&
         pos.y >= arena.minY && pos.y <= arena.maxY;
}