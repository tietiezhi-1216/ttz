type PanelListener = (open: boolean) => void;

/** Multiple composer tracks may mount the same pill. Only one can own its modal. */
export class PillPanelController {
  private listeners = new Set<PanelListener>();
  private owner: PanelListener | null = null;

  get size() { return this.listeners.size; }

  register(listener: PanelListener): () => void {
    this.listeners.add(listener);
    listener(false);
    return () => {
      this.listeners.delete(listener);
      if (this.owner === listener) this.owner = null;
    };
  }

  open(): void {
    // Idempotent: bubbled presses or rapid clicks must not open a second modal.
    if (this.owner) return;
    const target = [...this.listeners].at(-1);
    if (!target) return;
    this.owner = target;
    for (const listener of this.listeners) listener(listener === target);
  }

  close(): void {
    this.owner = null;
    for (const listener of this.listeners) listener(false);
  }
}
