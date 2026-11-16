export async function requestWakeLock(): Promise<() => void> {
  try {
    const sentinel = await navigator.wakeLock.request("screen");
    const reacquire = () => {
      if (document.visibilityState === "visible") {
        navigator.wakeLock.request("screen").catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", reacquire);
    return () => {
      document.removeEventListener("visibilitychange", reacquire);
      sentinel.release().catch(() => {});
    };
  } catch {
    return () => {};
  }
}
