import { app } from "electron";
import {
  isPrintQueueBusy,
  pausePrintsForUpdate,
  waitForPrintQueueIdle,
} from "../backend/printer/PrinterActivity";

export function registerGracefulShutdown(
  stopServices: () => Promise<void>,
): (install: () => void) => void {
  let resumePrints: (() => void) | undefined;
  let installUpdate: (() => void) | undefined;
  let drained = false;
  let finalizing = false;
  let complete = false;

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-prevent-unload", () => {
      if (!resumePrints || !drained || finalizing) return;
      resumePrints();
      resumePrints = undefined;
      installUpdate = undefined;
      drained = false;
    });
  });

  app.on("before-quit", (event) => {
    if (drained || complete) return;
    if (resumePrints) {
      event.preventDefault();
      return;
    }
    resumePrints = pausePrintsForUpdate();
    if (!isPrintQueueBusy()) {
      drained = true;
      return;
    }
    event.preventDefault();
    void (async () => {
      while (!(await waitForPrintQueueIdle())) {
        console.warn("Shutdown deferred while the print queue is busy");
      }
      drained = true;
      app.quit();
    })();
  });

  app.on("will-quit", (event) => {
    if (complete) return;
    event.preventDefault();
    if (finalizing) return;
    finalizing = true;
    void (async () => {
      try {
        await stopServices();
      } catch (error) {
        console.error("Error during graceful shutdown:", error);
      }
      complete = true;
      try {
        installUpdate?.();
      } catch (error) {
        console.error("Update installation failed:", error);
      } finally {
        app.quit();
      }
    })();
  });

  return (install) => {
    if (resumePrints) return;
    installUpdate = install;
    app.quit();
  };
}
