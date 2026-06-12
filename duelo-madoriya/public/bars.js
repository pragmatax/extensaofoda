import OBR, {
  buildShape,
  buildText,
  buildPath,
  Command,
} from "@owlbear-rodeo/sdk";

import { getSheet, META_KEY } from "./sheet.js";

const BAR_META = "com.duelo-madoriya/bar";

const BASE_HP_W = 138;
const BASE_HP_H = 18;
const BASE_DOT_R = 12;

const DOT_TEXT_NUDGE_X = 0;
const DOT_TEXT_NUDGE_Y = -1;

const HP_FILL = "#ff4f58";
const HP_BG = "#9e252d";

const EP_COLOR = "#2f8d73";
const ARMOR_COLOR = "#4b73bd";

const FILL_OP = 0.9;
const STROKE_OP = 0.55;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function tokenSize(item) {
  const w = (item.image?.image?.width || 150) * (item.scale?.x || 1);
  const h = (item.image?.image?.height || 150) * (item.scale?.y || 1);
  return { w, h };
}

function withMeta(builder, parentId) {
  return builder
    .attachedTo(parentId)
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } });
}

function makeCircle(cx, cy, r, color, parentId) {
  return withMeta(
    buildShape()
      .shapeType("CIRCLE")
      .width(r * 2)
      .height(r * 2)

      // Aqui o position é tratado como centro da bolinha
      .position({ x: cx, y: cy })

      .fillColor(color)
      .fillOpacity(FILL_OP)
      .strokeColor("#ffffff")
      .strokeOpacity(STROKE_OP)
      .strokeWidth(1.5),
    parentId
  ).build();
}

function makeText(cx, cy, txt, parentId, boxW, boxH = 22, fontSize = 13) {
  return buildText()
    .richText([
      {
        type: "paragraph",
        children: [{ text: String(txt), bold: true }],
      },
    ])
    .fontSize(fontSize)
    .fontWeight(700)
    .fillColor("#ffffff")
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .width(boxW)
    .height(boxH)

    // Texto usa posição no canto superior esquerdo da caixa
    .position({ x: cx - boxW / 2, y: cy - boxH / 2 })

    .attachedTo(parentId)
    .layer("TEXT")
    .locked(true)
    .disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } })
    .build();
}

function makeBadgeText(cx, cy, txt, parentId, r) {
  const box = r * 2 + 4;
  const fontSize = Math.max(15, r * 1.25);

  return buildText()
    .richText([
      {
        type: "paragraph",
        children: [{ text: String(txt), bold: true }],
      },
    ])
    .fontSize(fontSize)
    .fontWeight(700)
    .fillColor("#ffffff")
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .width(box)
    .height(box)
    .position({
      x: cx - box / 2 + DOT_TEXT_NUDGE_X,
      y: cy - box / 2 + DOT_TEXT_NUDGE_Y,
    })
    .attachedTo(parentId)
    .layer("TEXT")
    .locked(true)
    .disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } })
    .build();
}

function makePill(x, y, w, h, color, parentId) {
  const r = h / 2;
  const right = x + w;
  const bottom = y + h;
  const cy = y + r;

  return withMeta(
    buildPath()
      .commands([
        [Command.MOVE, x + r, y],
        [Command.LINE, right - r, y],
        [Command.QUAD, right, y, right, cy],
        [Command.QUAD, right, bottom, right - r, bottom],
        [Command.LINE, x + r, bottom],
        [Command.QUAD, x, bottom, x, cy],
        [Command.QUAD, x, y, x + r, y],
        [Command.CLOSE],
      ])
      .fillColor(color)
      .fillOpacity(FILL_OP)
      .strokeColor("#000000")
      .strokeOpacity(0)
      .strokeWidth(0),
    parentId
  ).build();
}

function buildFor(item) {
  const s = getSheet(item);
  const { w, h } = tokenSize(item);

  const cx = item.position.x;
  const cy = item.position.y;

  const r = Math.min(w, h) / 2;
  const out = [];

  // Barra de HP
  const hpW = Math.max(BASE_HP_W, r * 2.15);
  const hpH = clamp(r * 0.2, BASE_HP_H, 24);

  const hpX = cx - hpW / 2;
  const hpY = cy + r - hpH * 0.28;
  const hpCy = hpY + hpH / 2;

  const frac = clamp(s.hpMax ? s.hp / s.hpMax : 0, 0, 1);

  out.push(makePill(hpX, hpY, hpW, hpH, HP_BG, item.id));

  if (frac > 0) {
    const fillW = Math.max(hpH, hpW * frac);
    out.push(makePill(hpX, hpY, fillW, hpH, HP_FILL, item.id));
  }

  out.push(
    makeText(
      cx,
      hpCy,
      `${s.hp}/${s.hpMax}`,
      item.id,
      hpW,
      hpH + 6,
      Math.max(15, hpH * 0.95)
    )
  );

  // Bolinhas
  const dotR = clamp(r * 0.18, BASE_DOT_R, 18);

  // Distância do centro do token.
  // 0.72 deixa mais parecido com o print 2, grudado na borda.
  const d = r * 0.72;

  const epX = cx - d;
  const epY = cy - d;

  const arX = cx + d;
  const arY = cy + d;

  // EP — canto superior esquerdo
  out.push(makeCircle(epX, epY, dotR, EP_COLOR, item.id));
  out.push(makeBadgeText(epX, epY, s.ep ?? 0, item.id, dotR));

  // Armor — canto inferior direito
  out.push(makeCircle(arX, arY, dotR, ARMOR_COLOR, item.id));
  out.push(makeBadgeText(arX, arY, s.armor ?? 0, item.id, dotR));

  return out;
}

// Ids das barras que NÓS criamos no último build. Guardar isso evita ter de
// varrer a cena toda e, principalmente, deixa a gente adicionar as novas antes
// de apagar as antigas (sem o "frame vazio" que causava a piscada).
let _ownedBarIds = [];

// Enquanto estamos mexendo na cena (add/delete das barras), o próprio OBR dispara
// onChange. Sem essa trava, o watcher reagia às nossas próprias mudanças e entrava
// num loop de delete+recreate -> barras piscando sem parar.
let _busy = false;

export async function createBars(tokenIds) {
  if (_busy) return;
  _busy = true;
  try {
    const items = await OBR.scene.items.getItems(tokenIds);
    const built = [];
    for (const it of items) built.push(...buildFor(it));

    const oldIds = _ownedBarIds;

    // Adiciona as novas ANTES de remover as velhas: nunca há um instante sem barra.
    if (built.length) await OBR.scene.items.addItems(built);
    _ownedBarIds = built.map((b) => b.id);

    if (oldIds.length) await OBR.scene.items.deleteItems(oldIds);
  } finally {
    // Pequeno respiro pra absorver o onChange gerado pelo nosso próprio add/delete.
    setTimeout(() => { _busy = false; }, 60);
  }
}

export async function clearBars() {
  const wasBusy = _busy;
  _busy = true;
  try {
    const all = await OBR.scene.items.getItems();
    const ids = all.filter((it) => it.metadata?.[BAR_META]).map((it) => it.id);
    if (ids.length) await OBR.scene.items.deleteItems(ids);
    _ownedBarIds = [];
  } finally {
    if (!wasBusy) setTimeout(() => { _busy = false; }, 60);
  }
}

export async function refreshBars(tokenIds) {
  await createBars(tokenIds);
}

// Gera uma "assinatura" do que importa pra desenhar a barra (posição, escala e
// ficha de cada token-pai). Só reconstruímos quando essa assinatura muda — assim
// mover a câmera, selecionar, ou qualquer mudança irrelevante não repinta nada.
function signatureFromItems(items) {
  const parents = new Map();
  for (const it of items) {
    const parent = it.metadata?.[BAR_META]?.parent;
    if (parent) parents.set(parent, true);
  }
  const sig = [];
  for (const it of items) {
    if (!parents.has(it.id)) continue;
    const s = it.metadata?.[META_KEY] || {};
    sig.push([
      it.id,
      Math.round(it.position?.x ?? 0),
      Math.round(it.position?.y ?? 0),
      it.scale?.x ?? 1,
      it.scale?.y ?? 1,
      s.hp, s.hpMax, s.ep, s.epMax, s.armor,
    ].join(":"));
  }
  return { ids: [...parents.keys()], sig: sig.sort().join("|") };
}

let _watching = false;
let _refreshTimer = null;
let _lastSig = "";

export function watchBars() {
  if (_watching) return;
  _watching = true;

  OBR.scene.items.onChange((items) => {
    if (_busy) return;
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(async () => {
      if (_busy) return;
      const { ids, sig } = signatureFromItems(items);
      if (!ids.length) { _lastSig = ""; return; }
      if (sig === _lastSig) return; // nada relevante mudou -> não repinta
      _lastSig = sig;
      await createBars(ids);
    }, 150);
  });
}