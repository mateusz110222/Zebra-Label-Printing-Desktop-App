import { describe, expect, it, vi } from "vitest";
import { PreviewWindowRegistry } from "../preview/PreviewWindowRegistry";

interface MockPreviewWindow {
  isDestroyed: ReturnType<typeof vi.fn<() => boolean>>;
  isMinimized: () => boolean;
  restore: ReturnType<typeof vi.fn<() => void>>;
  show: ReturnType<typeof vi.fn<() => void>>;
  focus: ReturnType<typeof vi.fn<() => void>>;
  once: (event: "closed", callback: () => void) => void;
  close: ReturnType<typeof vi.fn<() => void>>;
}

function makeWindow(minimized = false): MockPreviewWindow {
  let closed = (): void => undefined;
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: () => minimized,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    once: (_event: "closed", callback: () => void): void => {
      closed = callback;
    },
    close: vi.fn((): void => closed()),
  };
}

describe("opening an existing editor", () => {
  it("shows and focuses an editor that is behind the main window", () => {
    const registry = new PreviewWindowRegistry();
    const window = makeWindow();
    registry.register("preview?name=label.zpl", window);
    expect(registry.focusExisting("preview?name=label.zpl")).toBe(true);
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(window.restore).not.toHaveBeenCalled();
  });
  it("restores a minimized editor and allows reopening after closing it", () => {
    const registry = new PreviewWindowRegistry();
    const window = makeWindow(true);
    registry.register("label", window);
    expect(registry.focusExisting("label")).toBe(true);
    expect(window.restore).toHaveBeenCalledOnce();
    window.close();
    expect(registry.focusExisting("label")).toBe(false);
  });
  it("does not reuse a destroyed window or an editor for another template", () => {
    const registry = new PreviewWindowRegistry();
    const window = makeWindow();
    registry.register("label", window);
    expect(registry.focusExisting("other")).toBe(false);
    window.isDestroyed.mockReturnValue(true);
    expect(registry.focusExisting("label")).toBe(false);
    expect(window.focus).not.toHaveBeenCalled();
  });

  it("closes a clean editor when a different template is opened", () => {
    const registry = new PreviewWindowRegistry();
    const old = makeWindow();
    registry.register("old", old);
    registry.setDirty(old, false);
    registry.closeCleanExcept("new");
    expect(old.close).toHaveBeenCalledOnce();
    expect(registry.focusExisting("old")).toBe(false);
  });

  it("keeps unsaved and still-loading editors open", () => {
    const registry = new PreviewWindowRegistry();
    const unsaved = makeWindow();
    const loading = makeWindow();
    registry.register("unsaved", unsaved);
    registry.register("loading", loading);
    registry.setDirty(unsaved, true);
    registry.closeCleanExcept("new");
    expect(unsaved.close).not.toHaveBeenCalled();
    expect(loading.close).not.toHaveBeenCalled();
  });

  it("keeps the requested template open and closes a saved editor after saving", () => {
    const registry = new PreviewWindowRegistry();
    const current = makeWindow();
    const saved = makeWindow();
    registry.register("current", current);
    registry.setDirty(current, false);
    registry.register("saved", saved);
    registry.setDirty(saved, true);
    registry.closeCleanExcept("current");
    expect(saved.close).not.toHaveBeenCalled();
    registry.setDirty(saved, false);
    registry.closeCleanExcept("current");
    expect(saved.close).toHaveBeenCalledOnce();
    expect(current.close).not.toHaveBeenCalled();
    expect(registry.focusExisting("current")).toBe(true);
  });

  it("lets beforeunload veto closing when the reported clean state is stale", () => {
    const registry = new PreviewWindowRegistry();
    const old = makeWindow();
    old.close.mockImplementation(() => undefined);
    registry.register("old", old);
    registry.setDirty(old, false);
    registry.closeCleanExcept("new");
    expect(old.close).toHaveBeenCalledOnce();
    expect(registry.focusExisting("old")).toBe(true);
  });
});
