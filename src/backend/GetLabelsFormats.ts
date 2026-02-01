import { ipcMain } from "electron";

export default function GetLabelsFormats(): void {
  ipcMain.handle("GetLabelsFormats", async () => {
    return { status: true };
  });
}
