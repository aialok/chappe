import { useEffect, useRef, useState, type DragEvent } from "react";
import { requestWakeLock } from "../camera/wake-lock.ts";
import { QrSender } from "../channel/qr/sender.ts";
import { PacketScheduler } from "../channel/scheduler.ts";
import { MAX_PAYLOAD_BYTES } from "../core/limits.ts";
import type { Payload } from "../core/types.ts";
import { TransferSource } from "../transport/transfer.ts";
import { FileIcon } from "./components/icons.tsx";
import { formatDuration, formatSize } from "./format.ts";

const DENSITY = { small: 400, medium: 650, large: 1000 } as const;
type Density = keyof typeof DENSITY;
type Phase = "compose" | "preparing" | "sending";

interface SendProps {
  onFocusChange: (focused: boolean) => void;
}

function estimateSeconds(bytes: number, symbolSize: number, codeRate: number, slots: number) {
  const blocks = Math.max(1, Math.ceil(bytes / symbolSize));
  return (blocks * 1.15) / (codeRate * slots);
}

export function Send({ onFocusChange }: SendProps) {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [slots, setSlots] = useState(4);
  const [codeRate, setCodeRate] = useState(8);
  const [density, setDensity] = useState<Density>("medium");
  const [phase, setPhase] = useState<Phase>("compose");
  const [error, setError] = useState("");
  const [symbolCount, setSymbolCount] = useState(0);
  const [packetsShown, setPacketsShown] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<TransferSource | null>(null);

  useEffect(() => {
    onFocusChange(phase === "sending");
  }, [phase, onFocusChange]);

  useEffect(() => () => onFocusChange(false), [onFocusChange]);

  useEffect(() => {
    if (phase !== "sending") return;
    const stage = stageRef.current;
    const source = sourceRef.current;
    if (!stage || !source) return;
    const sender = new QrSender(stage, new PacketScheduler(source), {
      slots,
      codeRate,
      errorCorrectionLevel: "M",
    });
    sender.start();
    let release: (() => void) | null = null;
    let cancelled = false;
    void requestWakeLock().then((fn) => {
      if (cancelled) fn();
      else release = fn;
    });
    const id = window.setInterval(() => {
      setPacketsShown(sender.stats.packetsShown);
      setElapsed(sender.stats.elapsedMs / 1000);
    }, 500);
    return () => {
      cancelled = true;
      sender.stop();
      release?.();
      window.clearInterval(id);
    };
  }, [phase, slots, codeRate]);

  const payloadBytes = mode === "text" ? new TextEncoder().encode(text).length : (file?.size ?? 0);
  const estimate = estimateSeconds(payloadBytes, DENSITY[density], codeRate, slots);

  function pickFile(next: File | null) {
    setError("");
    if (next && next.size > MAX_PAYLOAD_BYTES) {
      setError(`${next.name} is ${formatSize(next.size)}. The limit is 5 MB.`);
      return;
    }
    setFile(next);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files[0] ?? null);
  }

  async function start() {
    if (phase !== "compose") return;
    setError("");
    if (!window.isSecureContext || !crypto.subtle) {
      setError("Chappe needs https (or localhost) to run. Open the https address instead.");
      return;
    }

    let payload: Payload;
    if (mode === "text") {
      if (!text.trim()) {
        setError("Type or paste something first.");
        return;
      }
      payload = { kind: "text", text };
    } else {
      if (!file) {
        setError("Choose a file first.");
        return;
      }
      payload = {
        kind: "file",
        name: file.name,
        mime: file.type || "application/octet-stream",
        bytes: new Uint8Array(await file.arrayBuffer()),
      };
    }

    setPhase("preparing");
    try {
      const source = await TransferSource.create(payload, {
        symbolSize: DENSITY[density],
        ...(passphrase ? { passphrase } : {}),
      });
      sourceRef.current = source;
      setSymbolCount(source.symbolCount);
      setPacketsShown(0);
      setElapsed(0);
      setPhase("sending");
    } catch {
      setError("Could not prepare this transfer. Try again, or pick a different file.");
      setPhase("compose");
    }
  }

  function stop() {
    sourceRef.current = null;
    setPhase("compose");
  }

  if (phase === "sending") {
    return (
      <div className="beam">
        <div ref={stageRef} className="stage" />
        <div className="beam-meta">
          <span className="live">Sending</span>
          <span>
            <b>{symbolCount}</b> blocks
          </span>
          <span>
            <b>{packetsShown}</b> codes shown
          </span>
          <span>
            <b>{formatDuration(elapsed)}</b> elapsed
          </span>
          <span>{passphrase ? "Encrypted" : "Not encrypted"}</span>
        </div>
        <p className="beam-hint">
          On the other device, open Chappe, tap Receive and fit all the codes
          inside the frame. Keep this screen bright and still.
        </p>
        <div className="beam-actions">
          <button className="btn btn-wide" onClick={stop}>
            Stop sending
          </button>
        </div>
      </div>
    );
  }

  const preparing = phase === "preparing";

  return (
    <div className="stack">
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")}>
          Text or link
        </button>
        <button role="tab" aria-selected={mode === "file"} onClick={() => setMode("file")}>
          File
        </button>
      </div>

      {mode === "text" ? (
        <div className="field">
          <label className="label" htmlFor="send-text">
            Message
          </label>
          <textarea
            id="send-text"
            className="input"
            rows={4}
            value={text}
            placeholder="Paste a link, a note, a password…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void start();
            }}
          />
        </div>
      ) : (
        <div className="field">
          <span className="label">
            File <small>up to 5 MB</small>
          </span>
          <label
            className={`drop${dragging ? " is-dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="drop-icon">
              <FileIcon />
            </span>
            <span className="drop-text">
              <strong>{file ? file.name : "Choose or drop a file"}</strong>
              <span>{file ? `${formatSize(file.size)} · tap to change` : "Stays on this device"}</span>
            </span>
            <input
              id="send-file"
              type="file"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="send-pass">
          Passphrase <small>optional</small>
        </label>
        <input
          id="send-pass"
          className="input"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          placeholder="Tell the receiver in person, not by message"
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>

      <details className="more">
        <summary>Transfer settings</summary>
        <div className="more-body">
          <div className="field">
            <span className="label">Codes on screen</span>
            <div className="seg">
              {[1, 4, 9].map((n) => (
                <button key={n} aria-pressed={slots === n} onClick={() => setSlots(n)}>
                  {n === 1 ? "1" : `${Math.sqrt(n)} × ${Math.sqrt(n)}`}
                </button>
              ))}
            </div>
            <span className="hint">More codes are faster. 3 × 3 needs Chrome on Android to receive.</span>
          </div>
          <div className="field">
            <span className="label">Code density</span>
            <div className="seg">
              {(Object.keys(DENSITY) as Density[]).map((d) => (
                <button key={d} aria-pressed={density === d} onClick={() => setDensity(d)}>
                  {d}
                </button>
              ))}
            </div>
            <span className="hint">Denser codes carry more but need a sharper camera.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="send-rate">
              Speed <small>each code changes {codeRate}× a second</small>
            </label>
            <input
              id="send-rate"
              className="range"
              type="range"
              min={3}
              max={15}
              value={codeRate}
              onChange={(e) => setCodeRate(Number(e.target.value))}
            />
          </div>
        </div>
      </details>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="cta">
        <button className="btn btn-primary btn-wide" onClick={() => void start()} disabled={preparing}>
          {preparing ? "Preparing…" : "Start sending"}
        </button>
        {payloadBytes > 0 && (
          <span className="hint center">
            {formatSize(payloadBytes)} · about {formatDuration(estimate)} in good light
          </span>
        )}
      </div>
    </div>
  );
}
