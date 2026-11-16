const MESSAGE = "chappe: network access is disabled";

let installed = false;

function refuse(): never {
  throw new Error(MESSAGE);
}

export function installNetworkGuard(): void {
  if (installed) return;
  installed = true;

  try {
    window.fetch = () => Promise.reject(new Error(MESSAGE));
  } catch {}

  try {
    XMLHttpRequest.prototype.open = refuse as typeof XMLHttpRequest.prototype.open;
  } catch {}

  try {
    window.WebSocket = refuse as unknown as typeof WebSocket;
  } catch {}

  try {
    navigator.sendBeacon = () => false;
  } catch {}
}
