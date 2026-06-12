import OBR, { buildShape, buildText } from "https://esm.sh/@owlbear-rodeo/sdk";
import { getSheet } from "./sheet.js";

const BAR_META = "com.duelo-madoriya/bar";
const HP_W = 100, HP_H = 26, DOT_R = 22;

function tokenSize(item) {
  const w = (item.image?.image?.width || 150) * (item.scale?.x || 1);
  const h = (item.image?.image?.height || 150) * (item.scale?.y || 1);
  return { w, h };
}

function makeRect(x, y, w, h, color, parentId) {
  return buildShape()
    .shapeType("RECTANGLE")
    .width(Math.max(0.1, w)).height(h)
    .position({ x, y })
    .fillColor(color).fillOpacity(1)
    .strokeColor("#000000").strokeOpacity(0.6).strokeWidth(1)
    .attachedTo(parentId).layer("ATTACHMENT")
    .locked(true).disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } })
    .build();
}

function makeCircle(cx, cy, color, parentId) {
  return buildShape()
    .shapeType("CIRCLE")
    .width(DOT_R * 2).height(DOT_R * 2)
    .position({ x: cx - DOT_R, y: cy - DOT_R })
    .fillColor(color).fillOpacity(1)
    .strokeColor("#000000").strokeOpacity(0.7).strokeWidth(2)
    .attachedTo(parentId).layer("ATTACHMENT")
    .locked(true).disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } })
    .build();
}

function makeText(cx, cy, txt, parentId) {
  return buildText()
    .plainText(String(txt))
    .fontSize(16).fontWeight(700)
    .fillColor("#ffffff")
    .textAlign("CENTER").textAlignVertical("MIDDLE")
    .width(60).height(24)
    .position({ x: cx - 30, y: cy - 12 })
    .attachedTo(parentId).layer("ATTACHMENT")
    .locked(true).disableHit(true)
    .metadata({ [BAR_META]: { parent: parentId } })
    .build();
}

function buildFor(item) {
  const s = getSheet(item);
  const { w, h } = tokenSize(item);
  const cx = item.position.x, cy = item.position.y;
  const out = [];

  // HP — barra vermelha embaixo
  const hpX = cx - HP_W / 2, hpY = cy + h / 2 - 6;
  const frac = Math.max(0, Math.min(1, s.hpMax ? s.hp / s.hpMax : 0));
  out.push(makeRect(hpX, hpY, HP_W, HP_H, "#5a0000", item.id));
  out.push(makeRect(hpX, hpY, HP_W * frac, HP_H, "#e23b3b", item.id));
  out.push(makeText(cx, hpY + HP_H / 2, `${s.hp}/${s.hpMax}`, item.id));

  // Armor — bolinha AZUL (canto inf. direito)
  const arX = cx + w / 2 - 4, arY = cy + h / 2 - 18;
  out.push(makeCircle(arX, arY, "#2e6fdb", item.id));
  out.push(makeText(arX, arY, s.armor ?? 0, item.id));

  // EP — bolinha AMARELA (canto sup. esquerdo)
  const epX = cx - w / 2 + 4, epY = cy - h / 2 + 18;
  out.push(makeCircle(epX, epY, "#e0b020", item.id));
  out.push(makeText(epX, epY, s.ep ?? 0, item.id));

  return out;
}

export async function createBars(tokenIds) {
  await clearBars();
  const items = await OBR.scene.items.getItems(tokenIds);
  const built = [];
  for (const it of items) built.push(...buildFor(it));
  if (built.length) await OBR.scene.items.addItems(built);
}

export async function clearBars() {
  const all = await OBR.scene.items.getItems();
  const ids = all.filter(it => it.metadata?.[BAR_META]).map(it => it.id);
  if (ids.length) await OBR.scene.items.deleteItems(ids);
}

export async function refreshBars(tokenIds) {
  await createBars(tokenIds);
}