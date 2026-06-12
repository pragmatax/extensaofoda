import OBR from "https://esm.sh/@owlbear-rodeo/sdk";
import { getSheet } from "./sheet.js";

const META_KEY = "com.duelo-madoriya/sheet";
const id = new URLSearchParams(location.search).get("id");

const NUM = ["hp","hpMax","armor","speed","ep","epMax",
  "combate","agility","mira","eloquencia","deducao","inteligencia","vontade","resistencia"];
const TXT = ["dmgMelee","dmgRanged","dmgMagic"];
const ATKS = ["dmgMelee","dmgRanged","dmgMagic"];

async function saveSheet(itemId, sheet) {
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const it of items) it.metadata[META_KEY] = sheet;
  });
}

OBR.onReady(async () => {
  const items = await OBR.scene.items.getItems([id]);
  const item = items[0];
  const s = getSheet(item);

  document.querySelector("#title").textContent = `Ficha: ${item?.name || "Token"}`;
  for (const k of NUM) document.querySelector(`#${k}`).value = s[k] ?? 0;
  for (const k of TXT) document.querySelector(`#${k}`).value = s[k] ?? "";
  if (s.atk1) { const e = document.querySelector(`#ck_${s.atk1}`); if (e) e.checked = true; }
  if (s.atk2) { const e = document.querySelector(`#ck_${s.atk2}`); if (e) e.checked = true; }

  document.querySelector("#save").addEventListener("click", save);
});

function getChecked() {
  return ATKS.filter(a => document.querySelector(`#ck_${a}`).checked);
}

async function save() {
  const checked = getChecked();
  if (checked.length !== 2) {
    document.querySelector("#atkWarn").textContent = "Marque exatamente 2 ataques.";
    return;
  }
  const items = await OBR.scene.items.getItems([id]);
  const s = getSheet(items[0]);
  for (const k of NUM) s[k] = +document.querySelector(`#${k}`).value;
  for (const k of TXT) s[k] = document.querySelector(`#${k}`).value;
  s.atk1 = checked[0];
  s.atk2 = checked[1];
  s.name = items[0]?.name || s.name;

  await saveSheet(id, s);
  OBR.notification.show("Ficha salva!");
  OBR.popover.close("com.duelo-madoriya/ficha-popover");
}