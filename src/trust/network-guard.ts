let attempts = 0;
let installed = false;
const listeners = new Set<(count: number) => void>();

function bump(): void {
  attempts += 1;
  for (const listener of listeners) listener(attempts);
}

export function onNetworkAttempt(cb: (count: number) => void): () => void {
  listeners.add(cb);
  cb(attempts);
  return () => listeners.delete(cb);
}

export function networkAttempts(): number {
  return attempts;
}

export function installNetworkGuard(): void {
  if (installed) return;
  installed = true;

  try {
    window.fetch = () => {
      bump();
      return Promise.reject(new Error("scandrop: network access is disabled"));
    };
  } catch {}

  try {
    XMLHttpRequest.prototype.open = function () {
      bump();
      throw new Error("scandrop: network access is disabled");
    } as typeof XMLHttpRequest.prototype.open;
  } catch {}

  try {
    window.WebSocket = function () {
      bump();
      throw new Error("scandrop: network access is disabled");
    } as unknown as typeof WebSocket;
  } catch {}

  try {
    navigator.sendBeacon = () => {
      bump();
      return false;
    };
  } catch {}
}
