import path from "node:path";
import { pathToFileURL } from "node:url";

const PREVIEW_ROUTE = "/preview";

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const getRendererEntryUrl = (
  isPackaged: boolean,
  developmentUrl: string | undefined,
  mainDirectory: string,
): string => {
  if (!isPackaged && developmentUrl) {
    return new URL(developmentUrl).href;
  }

  return pathToFileURL(path.join(mainDirectory, "../renderer/index.html")).href;
};

export const isAllowedPreviewUrl = (
  candidateUrl: string,
  rendererEntryUrl: string,
): boolean => {
  const candidate = parseUrl(candidateUrl);
  const rendererEntry = parseUrl(rendererEntryUrl);
  if (!candidate || !rendererEntry) return false;

  if (!isRendererDocumentUrl(candidateUrl, rendererEntryUrl)) return false;

  const hashContent = candidate.hash.slice(1);
  const queryStart = hashContent.indexOf("?");
  const route =
    queryStart === -1 ? hashContent : hashContent.slice(0, queryStart);

  return route === PREVIEW_ROUTE;
};

export const isRendererDocumentUrl = (
  candidateUrl: string,
  rendererEntryUrl: string,
): boolean => {
  const candidate = parseUrl(candidateUrl);
  const rendererEntry = parseUrl(rendererEntryUrl);
  if (!candidate || !rendererEntry) return false;

  return (
    candidate.protocol === rendererEntry.protocol &&
    candidate.username === rendererEntry.username &&
    candidate.password === rendererEntry.password &&
    candidate.host === rendererEntry.host &&
    candidate.pathname === rendererEntry.pathname &&
    candidate.search === rendererEntry.search
  );
};

export const isAllowedExternalUrl = (candidateUrl: string): boolean => {
  const candidate = parseUrl(candidateUrl);
  return candidate?.protocol === "https:" || candidate?.protocol === "http:";
};
