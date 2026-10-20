import { BrowserWindow } from "electron";

export function notifyTemplatesChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    // A window may close while a template is being saved. The save still succeeded.
    try {
      window.webContents.send("templates-changed");
    } catch {
      // Other windows should still receive the notification.
    }
  }
}
