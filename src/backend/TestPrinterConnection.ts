import { ipcMain } from "electron";
import { PrinterConfig, store } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";

export default function TestPrinterConnection(): void {
  ipcMain.handle("test-printer-connection", async () => {
    const config: PrinterConfig = store.get("printer");
    const module = await import("../../zpl_templates/Test_Print_label");
    const template = Object.values(module)[0];

    switch (config.type) {
      case "IP":
        return await IpConnection(config, template);
      case "COM":
        return await COMConnection(config, template);
    }
  });
}
