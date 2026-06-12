import OBR from "@owlbear-rodeo/sdk";
import { createBars, clearBars } from "../public/bars.js";

OBR.onReady(() => {
  // Registra o "Add Ficha" no menu de botão direito de qualquer token
  OBR.contextMenu.create({
    id: "com.duelo-madoriya/add-ficha",
    icons: [{
      icon: "/icon.svg",
      label: "Add Ficha",
      filter: { every: [{ key: "layer", value: "CHARACTER" }] }
    }],
    // Abre a janela da ficha como popover
    onClick(context) {
      const id = context.items[0]?.id;
      if (!id) return;
      OBR.popover.open({
        id: "com.duelo-madoriya/ficha-popover",
        url: `/ficha.html?id=${id}`,
        height: 620,
        width: 420,
        anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
        transformOrigin: { horizontal: "CENTER", vertical: "CENTER" }
      });
    }
  });
});