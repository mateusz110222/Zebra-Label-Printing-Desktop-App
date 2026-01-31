import { ipcMain } from "electron";
import { SerialPort } from "serialport";

export default function GetSerialPorts() {
  ipcMain.handle("get-serialPorts", async () => {
    try {
      const SerialPortsList = (await SerialPort.list()).map(({ path }) => path);
      return {
        status: true,
        message: "Successfully retrieved Serial Ports",
        data: SerialPortsList
      };
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : "Failed to retrieve Serial Ports";

      return {
        status: false,
        message: errorMsg,
        data: []
      };
    }
  });
}
