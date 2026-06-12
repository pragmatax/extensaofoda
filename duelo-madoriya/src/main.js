import OBR from "@owlbear-rodeo/sdk";
import { createBars, clearBars, watchBars } from "../public/bars.js";
import { getSheet } from "../public/sheet.js";
import { DUEL_META, ARENA_POPOVER, FIGHTER_COLORS, DEFAULT_CONFIG } from "../public/duel.js";

const $ = (sel) => document.querySelector(sel);

let myId = "local";
let role = "PLAYER";
let selection = [];
let bgUrl = "";
let arenaOpen = false;

OBR.onReady(async () => {
  myId = OBR.player.id;
  watchBars();
  registerContextMenus();

  role = await OBR.player.getRole();
  $("#status").textContent =
    role === "GM" ? "Você é o Mestre. Monte o duelo abaixo." : "Conectado como jogador.";
  $("#gm").classList.toggle("hidden", role !== "GM");
  $("#player").classList.toggle("hidden", role === "GM");

  if (role === "GM") wireGmPanel();
  else wirePlayerPanel();

  // Abre/fecha a arena pra ESTE cliente conforme o estado da sala.
  OBR.room.onMetadataChange((md) => syncArena(md[DUEL_META]));
  syncArena((await OBR.room.getMetadata())[DUEL_META]);

  // Mantém a seleção atualizada (habilita/desabilita "Iniciar Duelo").
  OBR.player.onChange(refreshSelection);
  refreshSelection();
});

/* ------------------------------------------------------------------ */
/* Abrir/fechar a arena em tela cheia                                  */
/* ------------------------------------------------------------------ */

async function syncArena(duel) {
  const active = !!duel?.active;
  if (active && !arenaOpen) {
    arenaOpen = true;
    try {
      await OBR.popover.open({
        id: ARENA_POPOVER,
        url: "/arena.html",
        width: 99999,
        height: 99999,
        anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
        transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
      });
    } catch (e) {}
  } else if (!active && arenaOpen) {
    arenaOpen = false;
    try { await OBR.popover.close(ARENA_POPOVER); } catch (e) {}
  }

  if (role === "GM") {
    $("#start").classList.toggle("hidden", active);
    $("#stop").classList.toggle("hidden", !active);
    $("#liveInfo").textContent = active
      ? `Duelo em andamento — round ${duel.round}/${duel.config?.rounds}.`
      : "";
  } else {
    $("#playerMsg").textContent = active
      ? "Duelo em andamento! A arena está aberta."
      : "Aguardando o mestre iniciar um duelo…";
    $("#watch").classList.toggle("hidden", !active);
  }
}

/* ------------------------------------------------------------------ */
/* Painel do jogador                                                   */
/* ------------------------------------------------------------------ */

function wirePlayerPanel() {
  $("#watch").addEventListener("click", async () => {
    const duel = (await OBR.room.getMetadata())[DUEL_META];
    arenaOpen = false; // força reabrir
    syncArena(duel);
  });
}

/* ------------------------------------------------------------------ */
/* Painel do GM                                                        */
/* ------------------------------------------------------------------ */

function wireGmPanel() {
  $("#pickBg").addEventListener("click", async () => {
    try {
      const imgs = await OBR.assets.downloadImages(false, "", "MAP");
      const img = imgs?.[0];
      if (img?.image?.url) {
        bgUrl = img.image.url;
        const prev = $("#bgPreview");
        prev.src = bgUrl;
        prev.style.display = "block";
      }
    } catch (e) {
      OBR.notification.show("Não foi possível escolher o mapa.");
    }
  });

  $("#start").addEventListener("click", startDuel);
  $("#stop").addEventListener("click", stopDuel);
}

async function refreshSelection() {
  if (role !== "GM") return;
  selection = (await OBR.player.getSelection()) || [];

  // Só consideramos tokens de personagem.
  const items = selection.length ? await OBR.scene.items.getItems(selection) : [];
  const chars = items.filter((it) => it.layer === "CHARACTER");

  const n = chars.length;
  const badge = $("#selBadge");
  badge.textContent = `${n} / 2`;
  badge.className = "badge " + (n === 2 ? "ok" : "warn");

  $("#selNames").textContent = n
    ? chars.map((it) => it.name || "Token").join("  ×  ")
    : "Selecione exatamente 2 tokens no mapa.";

  $("#start").disabled = n !== 2;
  // guarda os tokens válidos pro start
  refreshSelection._chars = chars;
}

async function startDuel() {
  const chars = refreshSelection._chars || [];
  if (chars.length !== 2) return;

  const ready = await OBR.scene.isReady();
  if (!ready) { OBR.notification.show("Abra uma cena primeiro!"); return; }

  const config = {
    ...DEFAULT_CONFIG,
    minutes: clampNum($("#minutes").value, 0, 60, 3),
    rounds: clampNum($("#rounds").value, 1, 9, 1),
    bgUrl,
    bgBlur: clampNum($("#blur").value, 0, 20, 6),
    bgOpacity: clampNum($("#opacity").value, 0, 100, 35) / 100,
    training: $("#training").checked,
  };

  const fighters = chars.map((it, i) => ({
    tokenId: it.id,
    name: it.name || `Lutador ${i + 1}`,
    ownerId: it.createdUserId,
    color: FIGHTER_COLORS[i],
    sheet: getSheet(it),
  }));

  await OBR.room.setMetadata({
    [DUEL_META]: {
      active: true,
      round: 1,
      startedAt: Date.now(),
      hostId: myId,
      config,
      fighters,
    },
  });
  OBR.notification.show("Duelo iniciado!");
}

async function stopDuel() {
  await OBR.room.setMetadata({ [DUEL_META]: { active: false } });
  OBR.notification.show("Duelo encerrado.");
}

function clampNum(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

/* ------------------------------------------------------------------ */
/* Menus de contexto (ficha + barras)                                  */
/* ------------------------------------------------------------------ */

function registerContextMenus() {
  OBR.contextMenu.create({
    id: "com.duelo-madoriya/add-ficha",
    icons: [{
      icon: "/icon.svg", label: "Add Ficha",
      filter: { every: [{ key: "layer", value: "CHARACTER" }] },
    }],
    onClick(context) {
      const id = context.items[0]?.id;
      if (!id) return;
      OBR.popover.open({
        id: "com.duelo-madoriya/ficha-popover",
        url: `/ficha.html?id=${id}`,
        height: 620, width: 420,
        anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
        transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
      });
    },
  });

  OBR.contextMenu.create({
    id: "com.duelo-madoriya/show-bars",
    icons: [{
      icon: "/icon.svg", label: "Mostrar Barras",
      filter: { every: [{ key: "layer", value: "CHARACTER" }] },
    }],
    async onClick(context) {
      const ready = await OBR.scene.isReady();
      if (!ready) { OBR.notification.show("Abra uma cena primeiro!"); return; }
      const ids = context.items.map((i) => i.id);
      await createBars(ids);
      OBR.notification.show(`Barras criadas em ${ids.length} token(s)`);
    },
  });

  OBR.contextMenu.create({
    id: "com.duelo-madoriya/clear-bars",
    icons: [{
      icon: "/icon.svg", label: "Limpar Barras",
      filter: { every: [{ key: "layer", value: "CHARACTER" }] },
    }],
    async onClick() {
      await clearBars();
      OBR.notification.show("Barras removidas");
    },
  });
}
