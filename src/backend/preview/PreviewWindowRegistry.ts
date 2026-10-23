interface PreviewWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  close(): void;
  once(event: "closed", listener: () => void): unknown;
}

export class PreviewWindowRegistry {
  private windows = new Map<
    string,
    { window: PreviewWindow; dirty: boolean }
  >();

  focusExisting(url: string): boolean {
    const window = this.windows.get(url)?.window;
    if (!window || window.isDestroyed()) {
      this.windows.delete(url);
      return false;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return true;
  }

  register(url: string, window: PreviewWindow): void {
    // Until the renderer reports its state, it may still be loading a document.
    this.windows.set(url, { window, dirty: true });
    window.once("closed", () => {
      if (this.windows.get(url)?.window === window) this.windows.delete(url);
    });
  }

  setDirty(window: PreviewWindow, dirty: boolean): void {
    for (const entry of this.windows.values()) {
      if (entry.window === window) entry.dirty = dirty;
    }
  }

  closeCleanExcept(url: string): void {
    for (const [key, entry] of this.windows) {
      if (entry.window.isDestroyed()) {
        this.windows.delete(key);
      } else if (key !== url && !entry.dirty) {
        // Use close(), not destroy(): beforeunload still protects edits made
        // just before a dirty-state IPC update reaches the main process.
        entry.window.close();
      }
    }
  }
}
