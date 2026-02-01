import { ipcMain } from "electron";
import { PrinterConfig } from "./store";
import IpConnection from "./PrinterConnections/IpConnection";
import COMConnection from "./PrinterConnections/COMConnection";
import { ZPL_TEST_LABEL } from "../renderer/src/zpl_templates/Test_Print_label";

export default function TestPrinterConnection(): void {
  ipcMain.handle(
    "test-printer-connection",
    async (_event, config: PrinterConfig) => {
      switch (config.type) {
        case "IP":
          return IpConnection(config, ZPL_TEST_LABEL);
        case "COM":
          return COMConnection(config, ZPL_TEST_LABEL);
      }
    },
  );
}
