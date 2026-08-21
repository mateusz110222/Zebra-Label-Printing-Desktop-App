import { app, IpcMainEvent, IpcMainInvokeEvent } from "electron";

import { getRendererEntryUrl, isAllowedPreviewUrl, isRendererDocumentUrl } from "../preview/PreviewWindowPolicy";

const getRendererUrl = (): string =>
  getRendererEntryUrl(
    app.isPackaged,
    process.env["ELECTRON_RENDERER_URL"],
    __dirname,
  );

export const isMainRendererAuthorized = (
  event: IpcMainInvokeEvent | IpcMainEvent,
): boolean => {
  const rendererEntryUrl = getRendererUrl();

  const senderUrl = event.sender.getURL();
  const frameUrl = event.senderFrame?.url;

  return (
    isRendererDocumentUrl(senderUrl, rendererEntryUrl) &&
    typeof frameUrl === "string" &&
    isRendererDocumentUrl(frameUrl, rendererEntryUrl)
  );
};

export const isPreviewAuthorized = (
  event: IpcMainInvokeEvent | IpcMainEvent,
): boolean => {
  const rendererEntryUrl = getRendererUrl();

  const senderUrl = event.sender.getURL();
  const frameUrl = event.senderFrame?.url;

  return (
    isAllowedPreviewUrl(senderUrl, rendererEntryUrl) &&
    typeof frameUrl === "string" &&
    isAllowedPreviewUrl(frameUrl, rendererEntryUrl)
  );
};
