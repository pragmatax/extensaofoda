import OBR, { buildShape, buildText } from "https://esm.sh/@owlbear-rodeo/sdk";
import { getSheet } from "./sheet.js";

const BAR_META = "com.duelo-madoriya/bar";

const BASE_HP_W = 88;
const BASE_HP_H = 15;
const BASE_DOT_R = 12;

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

// x/y aqui são canto superior esquerdo.
// A shape do Owlbear posiciona pelo centro, por isso somamos w/2 e h/2.
function makeRect(x, y, w, h, color, parentId) {
  return buildShape()
    .shapeType("RECTANGLE")
    .width(Math.max(0.1, w))
    .height(h)
    .position({ x, y })
    .fillColor(color)
    .fillOpacity(FILL_OP)
    .strokeColor("#000000")
    .strokeOpacity(0)
    .strokeWidth(0)
    .attachedTo(parentId)
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } })
    .build();
}

// cx/cy aqui são o centro real da bolinha.
function makeCircleShape(
  cx,
  cy,
  diameter,
  color,
  parentId,
  strokeColor = "#000000",
  strokeOpacity = 0,
  strokeWidth = 0
) {
  return buildShape()
    .shapeType("CIRCLE")
    .width(diameter)
    .height(diameter)
    .position({ x: cx - diameter / 2, y: cy - diameter / 2 })
    .fillColor(color)
    .fillOpacity(FILL_OP)
    .strokeColor(strokeColor)
    .strokeOpacity(strokeOpacity)
    .strokeWidth(strokeWidth)
    .attachedTo(parentId)
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } })
    .build();
}

// Barra arredondada real, sem caps soltos.
function makePill(x, y, w, h, color, parentId) {
  const out = [];

  if (w <= 0) return out;

  if (w <= h) {
    out.push(makeCircleShape(x + w / 2, y + h / 2, w, color, parentId));
    return out;
  }

  const cy = y + h / 2;
  const radius = h / 2;
  const midW = w - h;

  out.push(makeCircleShape(x + radius, cy, h, color, parentId));
  out.push(makeRect(x + radius, y, midW, h, color, parentId));
  out.push(makeCircleShape(x + w - radius, cy, h, color, parentId));

  return out;
}

function makeCircle(cx, cy, radius, color, parentId) {
  return makeCircleShape(
    cx,
    cy,
    radius * 2,
    color,
    parentId,
    "#ffffff",
    STROKE_OP,
    1.5
  );
}

// Texto usa caixa com x/y no canto superior esquerdo.
function makeText(cx, cy, txt, parentId, boxW = BASE_DOT_R * 2, boxH = 22, fontSize = 13) {
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
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } })
    .build();
}

function buildFor(item) {
  const s = getSheet(item);
  const { w, h } = tokenSize(item);

  const cx = item.position.x;
  const cy = item.position.y;

  const r = Math.min(w, h) / 2;
  const out = [];

  // Tamanho dinâmico para ficar parecido com o print 2.
  const hpW = Math.max(BASE_HP_W, w * 1.14);
  const hpH = Math.max(BASE_HP_H, r * 0.2);
  const dotR = Math.max(BASE_DOT_R, r * 0.18);

// HP — barra arredondada embaixo do token
const hpW = Math.max(BASE_HP_W, w * 1.14);
const hpH = Math.max(BASE_HP_H, r * 0.2);

const hpX = cx - hpW / 2;
const hpY = cy + r - hpH * 0.18;
const hpCy = hpY + hpH / 2;

const frac = clamp(s.hpMax ? s.hp / s.hpMax : 0, 0, 1);

// Fundo da barra
out.push(...makePill(hpX, hpY, hpW, hpH, HP_BG, item.id));

// Preenchimento da vida
if (frac > 0) {
  const fillW = hpW * frac;
  out.push(...makePill(hpX, hpY, fillW, hpH, HP_FILL, item.id));
}

// Texto da vida
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
  // Bolinhas nas bordas do token, estilo print 2.
  const d = r * 0.78;

  // EP — canto superior esquerdo.
  const epX = cx - d;
  const epY = cy - d;

  // Verde igual ao print 2.
  // Para voltar ao amarelo antigo, troque por "#e0b020".
  out.push(makeCircle(epX, epY, dotR, "#2f8d73", item.id));
  out.push(
    makeText(
      epX,
      epY,
      s.ep ?? 0,
      item.id,
      dotR * 2,
      dotR * 2,
      Math.max(13, dotR * 1.15)
    )
  );

  // Armor — canto inferior direito.
  const arX = cx + d;
  const arY = cy + d;

  out.push(makeCircle(arX, arY, dotR, "#4b73bd", item.id));
  out.push(
    makeText(
      arX,
      arY,
      s.armor ?? 0,
      item.id,
      dotR * 2,
      dotR * 2,
      Math.max(13, dotR * 1.15)
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