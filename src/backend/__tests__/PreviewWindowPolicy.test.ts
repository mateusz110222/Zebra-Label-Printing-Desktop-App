import { describe, expect, it } from "vitest";
import {
  getRendererEntryUrl,
  isAllowedExternalUrl,
  isAllowedPreviewUrl,
  isRendererDocumentUrl
} from "../PreviewWindowPolicy";

describe("preview window URL policy", () => {
  const developmentEntry = "http://localhost:5173/";
  const packagedEntry =
    "file:///C:/Program%20Files/MATZ/resources/app.asar/out/renderer/index.html";

  it("allows only the exact preview hash route on the development renderer", () => {
    expect(
      isAllowedPreviewUrl("http://localhost:5173/#/preview", developmentEntry),
    ).toBe(true);
    expect(
      isAllowedPreviewUrl(
        "http://localhost:5173/#/preview?name=Lower%20AC.zpl",
        developmentEntry,
      ),
    ).toBe(true);
    expect(
      isAllowedPreviewUrl(
        "http://localhost:5173/#/preview-extra",
        developmentEntry,
      ),
    ).toBe(false);
    expect(
      isAllowedPreviewUrl(
        "http://localhost:5173/other#/preview",
        developmentEntry,
      ),
    ).toBe(false);
  });

  it("rejects an external origin even when it uses the preview hash", () => {
    expect(
      isAllowedPreviewUrl("https://example.com/#/preview", developmentEntry),
    ).toBe(false);
    expect(
      isAllowedPreviewUrl("http://localhost:5174/#/preview", developmentEntry),
    ).toBe(false);
  });

  it("allows only the packaged renderer file", () => {
    expect(
      isAllowedPreviewUrl(`${packagedEntry}#/preview?new=true`, packagedEntry),
    ).toBe(true);
    expect(
      isAllowedPreviewUrl(
        "file:///C:/Users/Public/index.html#/preview?new=true",
        packagedEntry,
      ),
    ).toBe(false);
  });

  it("recognizes the renderer document independently of its local hash route", () => {
    expect(
      isRendererDocumentUrl("http://localhost:5173/#/config", developmentEntry),
    ).toBe(true);
    expect(
      isRendererDocumentUrl("https://example.com/#/config", developmentEntry),
    ).toBe(false);
  });

  it("resolves the renderer entry for development and packaged builds", () => {
    expect(getRendererEntryUrl(false, developmentEntry, "C:/ignored")).toBe(
      developmentEntry,
    );
    expect(getRendererEntryUrl(true, developmentEntry, "C:/app/out/main")).toBe(
      "file:///C:/app/out/renderer/index.html",
    );
  });

  it("opens only HTTP(S) URLs outside the privileged window", () => {
    expect(isAllowedExternalUrl("https://example.com/help")).toBe(true);
    expect(isAllowedExternalUrl("http://example.com/help")).toBe(true);
    expect(isAllowedExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(
      false,
    );
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("not a URL")).toBe(false);
  });
});
