import OBR, {
  buildShape,
  buildText,
  buildPath,
  Command,
} from "https://esm.sh/@owlbear-rodeo/sdk";

import { getSheet } from "./sheet.js";

const BAR_META = "com.duelo-madoriya/bar";

const BASE_HP_W = 138;
const BASE_HP_H = 18;
const BASE_DOT_R = 12;

const DOT_TEXT_NUDGE_X = -2;
const DOT_TEXT_NUDGE_Y = -2;

const HP_FILL = "#ff4f58"; // vermelho clarinho
const HP_BG = "#9e252d";   // vermelho escuro do fundo

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
      .position({ x: cx - r, y: cy - r })
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
  const fontSize = Math.max(13, r * 1.05);

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

// Barra arredondada em UMA peça só.
// Não usa mais círculo + retângulo, então não desalinha.
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

  // Barra de HP igual ao print 2: centralizada, curta e colada no token.
const hpW = Math.max(BASE_HP_W, r * 2.15);
const hpH = clamp(r * 0.2, BASE_HP_H, 24);

const hpX = cx - hpW / 2;
const hpY = cy + r - hpH * 0.28;
const hpCy = hpY + hpH / 2;

  const frac = clamp(s.hpMax ? s.hp / s.hpMax : 0, 0, 1);

  // Fundo da barra
  out.push(makePill(hpX, hpY, hpW, hpH, HP_BG, item.id));

  // Vida atual
  if (frac > 0) {
    const fillW = Math.max(hpH, hpW * frac);
    out.push(makePill(hpX, hpY, fillW, hpH, HP_FILL, item.id));
  }

  // Texto do HP por cima
  out.push(
    makeText(
      cx,
      hpCy,
      `${s.hp}/${s.hpMax}`,
      item.id,
      hpW,
      hpH + 6,
      Math.max(13, hpH * 0.8)
    )
  );

  // Bolinhas de identificação
  const dotR = clamp(r * 0.18, BASE_DOT_R, 18);
  const d = r * 0.78;

  // EP — canto superior esquerdo
  const epX = cx - d;
  const epY = cy - d;

  out.push(makeCircle(epX, epY, dotR, EP_COLOR, item.id));
  out.push(
    makeText(
      epX,
      epY,
      s.ep ?? 0,
      item.id,
      dotR * 2,
      dotR * 2,
      Math.max(13, dotR * 1.1)
    )
  );

  // Armor — canto inferior direito
  const arX = cx + d;
  const arY = cy + d;

  out.push(makeCircle(arX, arY, dotR, ARMOR_COLOR, item.id));
  out.push(
    makeText(
      arX,
      arY,
      s.armor ?? 0,
      item.id,
      dotR * 2,
      dotR * 2,
      Math.max(13, dotR * 1.1)
    )
  );

  return out;
}

export async function createBars(tokenIds) {
  await clearBars();

  const items = await OBR.scene.items.getItems(tokenIds);
  const built = [];

  for (const it of items) {
    built.push(...buildFor(it));
  }

  if (built.length) {
    await OBR.scene.items.addItems(built);
  }
}

export async function clearBars() {
  const all = await OBR.scene.items.getItems();
  const ids = all.filter((it) => it.metadata?.[BAR_META]).map((it) => it.id);

  if (ids.length) {
    await OBR.scene.items.deleteItems(ids);
  }
}

export async function refreshBars(tokenIds) {
  await createBars(tokenIds);
}