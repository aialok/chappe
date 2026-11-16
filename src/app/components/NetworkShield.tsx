import { useEffect, useState } from "react";
import { onNetworkAttempt } from "../../trust/network-guard.ts";

export function NetworkShield() {
  const [count, setCount] = useState(0);
  useEffect(() => onNetworkAttempt(setCount), []);

  const blocked = count > 0;
  return (
    <span
      className={`status${blocked ? " is-bad" : ""}`}
      title="ScanDrop blocks every network request. Your data only leaves through the screen."
    >
      <span className="status-dot" />
      {blocked ? `${count} request${count > 1 ? "s" : ""} blocked` : "Offline · 0 requests"}
    </span>
  );
}
