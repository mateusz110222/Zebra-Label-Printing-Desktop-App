import { ipcMain } from "electron";
import { PrinterConfig, store } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { getTemplatesPath } from "./TemplatePaths";

export default function TestPrinterConnection(): void {
  ipcMain.handle("test-printer-connection", async () => {
    const config: PrinterConfig = store.get("printer");
    const fullPath = path.join(getTemplatesPath(), "Test_Print_label.zpl");
    const template = await readFile(fullPath, "utf-8");

    switch (config.type) {
      case "IP":
        return await IpConnection(config, template);
      case "COM":
        return await COMConnection(config, template);
    }
  });
}
