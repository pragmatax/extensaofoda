import OBR from "https://esm.sh/@owlbear-rodeo/sdk";
import { getSheet } from "./sheet.js";

const BAR_META = "com.duelo-madoriya/bar";
const HP_W = 100, HP_H = 26;
const DOT_R = 22;

function tokenSize(item) {
  const w = (item.image?.image?.width || 150) * (item.scale?.x || 1);
  const h = (item.image?.image?.height || 150) * (item.scale?.y || 1);
  return { w, h };
}

function circle(cx, cy, color, parentId) {
  return {
    type: "SHAPE", shapeType: "CIRCLE",
    width: DOT_R * 2, height: DOT_R * 2,
    position: { x: cx - DOT_R, y: cy - DOT_R },
    style: { fillColor: color, fillOpacity: 1, strokeColor: "#0008", strokeOpacity: 1, strokeWidth: 2 },
    attachedTo: parentId, layer: "ATTACHMENT", locked: true, disableHit: true,
    metadata: { [BAR_META]: { parent: parentId } },
  };
}

function rect(x, y, w, h, color, parentId, opacity = 1) {
  return {
    type: "SHAPE", shapeType: "RECTANGLE",
    width: Math.max(0.1, w), height: h,
    position: { x, y },
    style: { fillColor: color, fillOpacity: opacity, strokeColor: "#0008", strokeOpacity: 1, strokeWidth: 2 },
    attachedTo: parentId, layer: "ATTACHMENT", locked: true, disableHit: true,
    metadata: { [BAR_META]: { parent: parentId } },
  };
}

function label(cx, cy, text, size, parentId) {
  return {
    type: "TEXT",
    text: { type: "PLAIN", plainText: String(text),
      style: { fillColor: "#fff", fontSize: size, fontWeight: 700, textAlign: "CENTER", textAlignVertical: "MIDDLE" } },
    position: { x: cx, y: cy }, attachedTo: parentId,
    layer: "ATTACHMENT", locked: true, disableHit: true,
    metadata: { [BAR_META]: { parent: parentId } },
  };
}

function buildFor(item) {
  const s = getSheet(item);
  const { w, h } = tokenSize(item);
  const cx = item.position.x, cy = item.position.y;
  const out = [];

  // Barra de HP (vermelha) embaixo
  const hpX = cx - HP_W / 2, hpY = cy + h / 2 - 6;
  const frac = Math.max(0, Math.min(1, s.hpMax ? s.hp / s.hpMax : 0));
  out.push(rect(hpX, hpY, HP_W, HP_H, "#5a0000", item.id));
  out.push(rect(hpX, hpY, HP_W * frac, HP_H, "#e23b3b", item.id));
  out.push(label(cx, hpY + HP_H / 2, `${s.hp}/${s.hpMax}`, 16, item.id));

  // Bolinha Armor (azul) canto inferior direito
  const arX = cx + w / 2 - 6, arY = cy + h / 2 - 18;
  out.push(circle(arX, arY, "#2e6fdb", item.id));
  out.push(label(arX, arY, s.armor ?? 0, 16, item.id));

  // Bolinha EP (amarela) canto superior esquerdo
  const epX = cx - w / 2 + 6, epY = cy - h / 2 + 18;
  out.push(circle(epX, epY, "#e0b020", item.id));
  out.push(label(epX, epY, s.ep ?? 0, 16, item.id));

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