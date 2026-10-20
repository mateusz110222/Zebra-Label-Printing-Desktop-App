import { ipcMain } from "electron";
import { SerialPort } from "serialport";
import { isMainRendererAuthorized } from "../auth/IsAutorized";

interface SerialPortsResponse {
  status: boolean;
  message: string;
  data: string[] | [];
}
export default function GetSerialPorts(): void {
  ipcMain.handle(
    "get-serialPorts",
    async (event): Promise<SerialPortsResponse> => {
      if (event?.sender && !isMainRendererAuthorized(event)) {
        return {
          status: false,
          message: "backend.audit.unauthorized",
          data: [],
        };
      }
      try {
        const SerialPortsList = (await SerialPort.list()).map(
          ({ path }) => path,
        );
        return {
          status: true,
          message: "backend.printer.GET_SERIAL_PORTS_SUCCESS",
          data: SerialPortsList,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : String(error) || "Failed to retrieve Serial Ports";

        return {
          status: false,
          message: errorMsg,
          data: [],
        };
      }
    },
  );
}
