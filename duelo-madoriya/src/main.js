import OBR from "@owlbear-rodeo/sdk";
import { createBars, clearBars, watchBars } from "../public/bars.js";

OBR.onReady(() => {
  watchBars();

  // Add Ficha
  OBR.contextMenu.create({
    id: "com.duelo-madoriya/add-ficha",
    icons: [{
      icon: "/icon.svg", label: "Add Ficha",
      filter: { every: [{ key: "layer", value: "CHARACTER" }] }
    }],
    onClick(context) {
      const id = context.items[0]?.id;
      if (!id) return;
      OBR.popover.open({
        id: "com.duelo-madoriya/ficha-popover",
        url: `/ficha.html?id=${id}`,
        height: 620, width: 420,
        anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
        transformOrigin: { horizontal: "CENTER", vertical: "CENTER" }
      });
    }
  });

  // Mostrar Barras
  OBR.contextMenu.create({
    id: "com.duelo-madoriya/show-bars",
    icons: [{
      icon: "/icon.svg", label: "Mostrar Barras",
      filter: { every: [{ key: "layer", value: "CHARACTER" }] }
    }],
    async onClick(context) {
      const ready = await OBR.scene.isReady();
      if (!ready) { OBR.notification.show("Abra uma cena primeiro!"); return; }
      const ids = context.items.map(i => i.id);
      await createBars(ids);
      OBR.notification.show(`Barras criadas em ${ids.length} token(s)`);
    }
  });

  // Limpar Barras
  OBR.contextMenu.create({
    id: "com.duelo-madoriya/clear-bars",
    icons: [{
      icon: "/icon.svg", label: "Limpar Barras",
      filter: { every: [{ key: "layer", value: "CHARACTER" }] }
    }],
    async onClick() {
      await clearBars();
      OBR.notification.show("Barras removidas");
    }
  });

  // Abrir Arena (provisório, pra testar a conexão da arena)
  OBR.contextMenu.create({
    id: "com.duelo-madoriya/open-arena",
    icons: [{
      icon: "/icon.svg", label: "Abrir Arena",
      filter: { every: [{ key: "layer", value: "CHARACTER" }] }
    }],
    onClick() {
      OBR.popover.open({
        id: "com.duelo-madoriya/arena",
        url: "/arena.html",
        width: 99999, height: 99999,
        anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" }
      });
    }
  });
});