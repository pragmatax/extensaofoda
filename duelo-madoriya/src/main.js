import OBR from "@owlbear-rodeo/sdk";
import { createBars, clearBars, watchBars } from "../public/bars.js";
import { getSheet } from "../public/sheet.js";
import { DUEL_META, ARENA_POPOVER, FIGHTER_COLORS, DEFAULT_CONFIG, SCALES } from "../public/duel.js";

const $ = (sel) => document.querySelector(sel);

let myId = "local";
let role = "PLAYER";
let selection = [];
let bgUrl = "";
let arenaOpen = false;
let partyPlayers = [];        // jogadores conectados (pra atribuir controle)
let assignment = ["", ""];    // playerId que controla cada lutador

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

  // Mantém a seleção e a lista de jogadores atualizadas.
  if (role === "GM") {
    OBR.player.onChange(refreshSelection);
    OBR.party.onChange((players) => { partyPlayers = players; refreshSelection(); });
    partyPlayers = await OBR.party.getPlayers();
    refreshSelection();
  }
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
  // popula o seletor de escala
  $("#scale").innerHTML = SCALES
    .map((s) => `<option value="${s.value}">${s.label}</option>`)
    .join("");

  $("#pickBg").addEventListener("click", async () => {
    try {
      const imgs = await OBR.assets.downloadImages(false);
      const img = imgs?.[0];
      if (img?.image?.url) setBg(img.image.url);
    } catch (e) {
      OBR.notification.show("Picker indisponível — cole a URL do mapa no campo abaixo.");
    }
  });

  $("#bgUrlInput").addEventListener("change", (e) => {
    const url = e.target.value.trim();
    if (url) setBg(url);
  });

  $("#start").addEventListener("click", startDuel);
  $("#stop").addEventListener("click", stopDuel);
}

function setBg(url) {
  bgUrl = url;
  const prev = $("#bgPreview");
  prev.src = url;
  prev.style.display = "block";
  $("#bgUrlInput").value = url;
}

function playerName(id) {
  if (id === myId) return "Você (mestre)";
  const p = partyPlayers.find((x) => x.id === id);
  return p ? p.name : "—";
}

// Monta os dois <select> de "quem controla cada lutador".
function renderAssignment(chars) {
  const box = $("#assign");
  if (chars.length !== 2) { box.innerHTML = ""; return; }

  // candidatos: o GM (você) + todos os jogadores conectados
  const candidates = [{ id: myId, name: "Você (mestre)" }];
  for (const p of partyPlayers) {
    if (p.id !== myId) candidates.push({ id: p.id, name: p.name });
  }

  box.innerHTML = chars.map((it, i) => {
    // padrão: quem criou o token, se estiver conectado; senão o mestre
    const def = candidates.some((c) => c.id === it.createdUserId) ? it.createdUserId : myId;
    if (!assignment[i]) assignment[i] = def;
    const opts = candidates.map((c) =>
      `<option value="${c.id}" ${c.id === assignment[i] ? "selected" : ""}>${c.name}</option>`
    ).join("");
    return `<div class="assignRow">
      <span class="who" style="color:${FIGHTER_COLORS[i]}">${it.name || "Token"}</span>
      <select data-slot="${i}">${opts}</select>
    </div>`;
  }).join("");

  box.querySelectorAll("select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      assignment[+e.target.dataset.slot] = e.target.value;
    });
  });
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
  refreshSelection._chars = chars;
  renderAssignment(chars);
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
    scale: clampNum($("#scale").value, 1, 4, 1),
  };

  const fighters = chars.map((it, i) => ({
    tokenId: it.id,
    name: it.name || `Lutador ${i + 1}`,
    ownerId: it.createdUserId,
    controllerId: assignment[i] || it.createdUserId, // quem joga com este lutador
    color: FIGHTER_COLORS[i],
    imageUrl: it.image?.url || "",                   // imagem do token na arena
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
