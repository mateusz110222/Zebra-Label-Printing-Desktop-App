import { ipcMain } from "electron";
import { PrinterConfig, store } from "./store";

export default function SavePrinterConfig() {
  ipcMain.handle("save-printer-config", async (_event, config: PrinterConfig) => {
    try {
      if (config.type === "IP" && (!config.ip || !config.port)) {
        return { status: false, message: "Błędny adres IP lub port." };
      }
      if (config.type === "COM" && !config.comPort) {
        return { status: false, message: "Nie wybrano portu COM." };
      }

      store.set("printer", config);

      return { status: true, message: "Konfiguracja zapisana pomyślnie." };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Błąd zapisu konfiguracji";
      return { status: false, message: errorMsg || "Błąd zapisu pliku konfiguracyjnego." };
    }
  });
}
