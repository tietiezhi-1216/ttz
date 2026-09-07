type PanelListener = (open: boolean) => void;

export type PillPanelController = {
  readonly size: number;
  register: (listener: PanelListener) => () => void;
  open: () => void;
  close: () => void;
};

/** Multiple composer tracks may mount the same pill. Only one can own its modal. */
export function createPillPanelController(): PillPanelController {
  const listeners = new Set<PanelListener>();
  let owner: PanelListener | null = null;
  return {
    get size() { return listeners.size; },
    register(listener) {
      listeners.add(listener);
      listener(false);
      return () => {
        listeners.delete(listener);
        if (owner === listener) owner = null;
      };
    },
    open() {
      // Idempotent: bubbled presses or rapid clicks must not open a second modal.
      if (owner) return;
      const target = Array.from(listeners).pop();
      if (!target) return;
      owner = target;
      listeners.forEach((listener) => listener(listener === target));
    },
    close() {
      owner = null;
      listeners.forEach((listener) => listener(false));
    },
  };
}
