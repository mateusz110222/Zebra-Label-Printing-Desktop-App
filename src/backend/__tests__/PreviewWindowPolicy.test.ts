import { describe, expect, it } from "vitest";

import {
  getRendererEntryUrl,
  isAllowedExternalUrl,
  isAllowedPreviewUrl,
  isRendererDocumentUrl
} from "../preview/PreviewWindowPolicy";

describe("PreviewWindowPolicy", () => {
  const developmentEntry = "http://localhost:5173/";

  const packagedEntry =
    "file:///C:/Program%20Files/MATZ/resources/app.asar/out/renderer/index.html";

  describe("isAllowedPreviewUrl", () => {
    it("allows the exact preview route in development", () => {
      expect(
        isAllowedPreviewUrl(
          "http://localhost:5173/#/preview",
          developmentEntry,
        ),
      ).toBe(true);
    });

    it("allows query parameters inside the preview hash", () => {
      expect(
        isAllowedPreviewUrl(
          "http://localhost:5173/#/preview?name=Lower%20AC.zpl",
          developmentEntry,
        ),
      ).toBe(true);

      expect(
        isAllowedPreviewUrl(
          "http://localhost:5173/#/preview?new=true&name=16x13.zpl",
          developmentEntry,
        ),
      ).toBe(true);
    });

    it.each([
      "http://localhost:5173/#/preview-extra",
      "http://localhost:5173/#/preview/",
      "http://localhost:5173/#/Preview",
      "http://localhost:5173/#preview",
      "http://localhost:5173/#/",
      "http://localhost:5173/",
      "http://localhost:5173/#",
    ])(
      "rejects a hash route different from exact /preview: %s",
      (candidate) => {
        expect(
          isAllowedPreviewUrl(
            candidate,
            developmentEntry,
          ),
        ).toBe(false);
      },
    );

    it("rejects preview when the document pathname differs", () => {
      expect(
        isAllowedPreviewUrl(
          "http://localhost:5173/other#/preview",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects preview from another origin", () => {
      expect(
        isAllowedPreviewUrl(
          "https://example.com/#/preview",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects preview from another port", () => {
      expect(
        isAllowedPreviewUrl(
          "http://localhost:5174/#/preview",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects preview when protocol differs", () => {
      expect(
        isAllowedPreviewUrl(
          "https://localhost:5173/#/preview",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects preview when hostname differs", () => {
      expect(
        isAllowedPreviewUrl(
          "http://127.0.0.1:5173/#/preview",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects preview when URL search differs from renderer entry", () => {
      expect(
        isAllowedPreviewUrl(
          "http://localhost:5173/?foo=bar#/preview",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("allows preview when candidate and renderer entry have the same search", () => {
      const rendererEntry =
        "http://localhost:5173/?mode=test";

      expect(
        isAllowedPreviewUrl(
          "http://localhost:5173/?mode=test#/preview",
          rendererEntry,
        ),
      ).toBe(true);
    });

    it("rejects preview when credentials differ", () => {
      const rendererEntry =
        "http://user:password@localhost:5173/";

      expect(
        isAllowedPreviewUrl(
          "http://localhost:5173/#/preview",
          rendererEntry,
        ),
      ).toBe(false);

      expect(
        isAllowedPreviewUrl(
          "http://user:password@localhost:5173/#/preview",
          rendererEntry,
        ),
      ).toBe(true);
    });

    it("allows only the configured packaged renderer file", () => {
      expect(
        isAllowedPreviewUrl(
          `${packagedEntry}#/preview?new=true`,
          packagedEntry,
        ),
      ).toBe(true);
    });

    it("rejects another local file in packaged mode", () => {
      expect(
        isAllowedPreviewUrl(
          "file:///C:/Users/Public/index.html#/preview?new=true",
          packagedEntry,
        ),
      ).toBe(false);
    });

    it("rejects another renderer file with the same filename", () => {
      expect(
        isAllowedPreviewUrl(
          "file:///C:/Temp/index.html#/preview",
          packagedEntry,
        ),
      ).toBe(false);
    });

    it("rejects malformed candidate URL", () => {
      expect(
        isAllowedPreviewUrl(
          "not a URL",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects malformed renderer entry URL", () => {
      expect(
        isAllowedPreviewUrl(
          "http://localhost:5173/#/preview",
          "not a URL",
        ),
      ).toBe(false);
    });

    it("rejects when both URLs are invalid", () => {
      expect(
        isAllowedPreviewUrl(
          "invalid candidate",
          "invalid renderer",
        ),
      ).toBe(false);
    });
  });

  describe("isRendererDocumentUrl", () => {
    it("recognizes the renderer document independently of hash route", () => {
      expect(
        isRendererDocumentUrl(
          "http://localhost:5173/#/config",
          developmentEntry,
        ),
      ).toBe(true);

      expect(
        isRendererDocumentUrl(
          "http://localhost:5173/#/preview",
          developmentEntry,
        ),
      ).toBe(true);

      expect(
        isRendererDocumentUrl(
          "http://localhost:5173/#/anything",
          developmentEntry,
        ),
      ).toBe(true);
    });

    it("ignores hash differences when comparing renderer documents", () => {
      const rendererEntry =
        "http://localhost:5173/#/home";

      expect(
        isRendererDocumentUrl(
          "http://localhost:5173/#/settings",
          rendererEntry,
        ),
      ).toBe(true);
    });

    it("rejects an external origin", () => {
      expect(
        isRendererDocumentUrl(
          "https://example.com/#/config",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects a different port", () => {
      expect(
        isRendererDocumentUrl(
          "http://localhost:5174/#/config",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects a different pathname", () => {
      expect(
        isRendererDocumentUrl(
          "http://localhost:5173/index.html#/config",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects a different search query", () => {
      expect(
        isRendererDocumentUrl(
          "http://localhost:5173/?test=1#/config",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("requires matching search query when renderer entry contains one", () => {
      const rendererEntry =
        "http://localhost:5173/?mode=test";

      expect(
        isRendererDocumentUrl(
          "http://localhost:5173/?mode=test#/config",
          rendererEntry,
        ),
      ).toBe(true);

      expect(
        isRendererDocumentUrl(
          "http://localhost:5173/?mode=other#/config",
          rendererEntry,
        ),
      ).toBe(false);
    });

    it("requires matching username and password", () => {
      const rendererEntry =
        "http://user:secret@localhost:5173/";

      expect(
        isRendererDocumentUrl(
          "http://user:secret@localhost:5173/#/config",
          rendererEntry,
        ),
      ).toBe(true);

      expect(
        isRendererDocumentUrl(
          "http://other:secret@localhost:5173/#/config",
          rendererEntry,
        ),
      ).toBe(false);

      expect(
        isRendererDocumentUrl(
          "http://user:other@localhost:5173/#/config",
          rendererEntry,
        ),
      ).toBe(false);
    });

    it("recognizes the exact packaged renderer document", () => {
      expect(
        isRendererDocumentUrl(
          `${packagedEntry}#/settings`,
          packagedEntry,
        ),
      ).toBe(true);
    });

    it("rejects another packaged file", () => {
      expect(
        isRendererDocumentUrl(
          "file:///C:/Temp/index.html#/settings",
          packagedEntry,
        ),
      ).toBe(false);
    });

    it("rejects malformed candidate URL", () => {
      expect(
        isRendererDocumentUrl(
          "not a URL",
          developmentEntry,
        ),
      ).toBe(false);
    });

    it("rejects malformed renderer entry URL", () => {
      expect(
        isRendererDocumentUrl(
          developmentEntry,
          "not a URL",
        ),
      ).toBe(false);
    });
  });

  describe("getRendererEntryUrl", () => {
    it("returns the development renderer URL", () => {
      expect(
        getRendererEntryUrl(
          false,
          developmentEntry,
          "C:/ignored",
        ),
      ).toBe(developmentEntry);
    });

    it("normalizes the development renderer URL", () => {
      expect(
        getRendererEntryUrl(
          false,
          "http://localhost:5173",
          "C:/ignored",
        ),
      ).toBe("http://localhost:5173/");
    });

    it("preserves development URL search and path", () => {
      expect(
        getRendererEntryUrl(
          false,
          "http://localhost:5173/app?mode=test",
          "C:/ignored",
        ),
      ).toBe(
        "http://localhost:5173/app?mode=test",
      );
    });

    it("resolves packaged renderer relative to main directory", () => {
      expect(
        getRendererEntryUrl(
          true,
          developmentEntry,
          "C:/app/out/main",
        ),
      ).toBe(
        "file:///C:/app/out/renderer/index.html",
      );
    });

    it("ignores development URL when application is packaged", () => {
      expect(
        getRendererEntryUrl(
          true,
          "https://evil.example/",
          "C:/app/out/main",
        ),
      ).toBe(
        "file:///C:/app/out/renderer/index.html",
      );
    });

    it("falls back to packaged-style renderer path when development URL is undefined", () => {
      expect(
        getRendererEntryUrl(
          false,
          undefined,
          "C:/app/out/main",
        ),
      ).toBe(
        "file:///C:/app/out/renderer/index.html",
      );
    });
  });

  describe("isAllowedExternalUrl", () => {
    it.each([
      "https://example.com/help",
      "http://example.com/help",
      "https://example.com/",
      "http://localhost:3000/",
      "https://127.0.0.1/test",
    ])(
      "allows HTTP(S) URL: %s",
      (candidate) => {
        expect(
          isAllowedExternalUrl(candidate),
        ).toBe(true);
      },
    );

    it.each([
      "file:///C:/Windows/System32/calc.exe",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://example.com/file.txt",
      "mailto:test@example.com",
      "ws://example.com/socket",
      "wss://example.com/socket",
      "about:blank",
    ])(
      "rejects non-HTTP(S) URL: %s",
      (candidate) => {
        expect(
          isAllowedExternalUrl(candidate),
        ).toBe(false);
      },
    );

    it.each([
      "",
      "not a URL",
      "example",
      "://invalid",
    ])(
      "rejects malformed URL: %s",
      (candidate) => {
        expect(
          isAllowedExternalUrl(candidate),
        ).toBe(false);
      },
    );

    it("is case-insensitive for HTTP protocol parsing", () => {
      expect(
        isAllowedExternalUrl(
          "HTTPS://example.com/help",
        ),
      ).toBe(true);

      expect(
        isAllowedExternalUrl(
          "HTTP://example.com/help",
        ),
      ).toBe(true);
    });

    it("allows HTTP URLs containing search and hash", () => {
      expect(
        isAllowedExternalUrl(
          "https://example.com/help?page=2#section",
        ),
      ).toBe(true);
    });
  });
});
