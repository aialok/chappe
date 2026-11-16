import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { requestWakeLock } from "../camera/wake-lock.ts";
import { QrSender } from "../channel/qr/sender.ts";
import { PacketScheduler } from "../channel/scheduler.ts";
import { MAX_PAYLOAD_BYTES } from "../core/limits.ts";
import type { Payload } from "../core/types.ts";
import { TransferSource } from "../transport/transfer.ts";
import { CloseIcon, FileIcon } from "./components/icons.tsx";
import { formatDuration, formatSize } from "./format.ts";
import { DENSITY, loadPrefs, savePrefs, type Density } from "./prefs.ts";

type Phase = "compose" | "preparing" | "sending";

function estimateSeconds(bytes: number, symbolSize: number, codeRate: number): number {
  const blocks = Math.max(1, Math.ceil(bytes / symbolSize));
  return (blocks * 1.15) / codeRate;
}

export function Send() {
  const [initial] = useState(loadPrefs);
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [codeRate, setCodeRate] = useState(initial.codeRate);
  const [density, setDensity] = useState<Density>(initial.density);
  const [phase, setPhase] = useState<Phase>("compose");
  const [error, setError] = useState("");
  const [symbolCount, setSymbolCount] = useState(0);
  const [packetsShown, setPacketsShown] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<TransferSource | null>(null);
  const runRef = useRef(0);

  useEffect(() => savePrefs({ density, codeRate }), [density, codeRate]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (phase === "compose") {
      if (dialog.open) dialog.close();
    } else if (!dialog.open) {
      dialog.showModal();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "sending") return;
    const stage = stageRef.current;
    const source = sourceRef.current;
    if (!stage || !source) return;
    const sender = new QrSender(stage, new PacketScheduler(source), {
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
      window.clearInterval(id);
      sender.destroy();
      release?.();
    };
  }, [phase, codeRate]);

  const payloadBytes = mode === "text" ? new TextEncoder().encode(text).length : (file?.size ?? 0);
  const estimate = estimateSeconds(payloadBytes, DENSITY[density], codeRate);
  const subject = mode === "file" && file ? file.name : "Text";

  function pickFile(next: File | null) {
    setError("");
    if (next && next.size > MAX_PAYLOAD_BYTES) {
      setError(`${next.name} is ${formatSize(next.size)}. The limit is 5 MB.`);
      return;
    }
    setFile(next);
    if (next) setMode("file");
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files[0] ?? null);
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    const pasted = event.clipboardData.files[0];
    if (!pasted) return;
    event.preventDefault();
    pickFile(pasted);
  }

  async function start() {
    if (phase !== "compose") return;
    setError("");
    if (!window.isSecureContext || !crypto.subtle) {
      setError("Chappe needs https (or localhost) to run. Open the https address instead.");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setError("Type or paste something first.");
      return;
    }
    if (mode === "file" && !file) {
      setError("Choose a file first.");
      return;
    }

    const run = ++runRef.current;
    setPhase("preparing");
    try {
      const payload: Payload =
        mode === "file" && file
          ? {
              kind: "file",
              name: file.name,
              mime: file.type || "application/octet-stream",
              bytes: new Uint8Array(await file.arrayBuffer()),
            }
          : { kind: "text", text };
      const source = await TransferSource.create(payload, {
        symbolSize: DENSITY[density],
        ...(passphrase ? { passphrase } : {}),
      });
      if (runRef.current !== run) return;
      sourceRef.current = source;
      setSymbolCount(source.symbolCount);
      setPacketsShown(0);
      setElapsed(0);
      setPhase("sending");
    } catch {
      if (runRef.current !== run) return;
      setError("Could not prepare this transfer. Try again, or pick a different file.");
      setPhase("compose");
    }
  }

  function stop() {
    runRef.current += 1;
    sourceRef.current = null;
    setPhase("compose");
  }

  return (
    <div className="stack" onPaste={onPaste}>
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
            placeholder="Paste a link, a note, or a file"
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
              <strong>{file ? file.name : "Choose, drop or paste a file"}</strong>
              <span>{file ? `${formatSize(file.size)} · tap to change` : "It stays on this device"}</span>
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
          Passphrase <small>optional, encrypts the transfer</small>
        </label>
        <input
          id="send-pass"
          className="input"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          placeholder="Tell the receiver in person"
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>

      <details className="more">
        <summary>Transfer settings</summary>
        <div className="more-body">
          <div className="field">
            <span className="label">Code density</span>
            <div className="seg">
              {(Object.keys(DENSITY) as Density[]).map((d) => (
                <button key={d} aria-pressed={density === d} onClick={() => setDensity(d)}>
                  {d}
                </button>
              ))}
            </div>
            <span className="hint">Denser codes carry more per frame but need a sharper camera.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="send-rate">
              Speed <small>{codeRate} codes per second</small>
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
            <span className="hint">Lower it if the receiver keeps missing codes.</span>
          </div>
        </div>
      </details>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="cta">
        <button className="btn btn-primary btn-wide" onClick={() => void start()}>
          Show QR code
        </button>
        {payloadBytes > 0 && (
          <span className="hint center">
            {formatSize(payloadBytes)} · about {formatDuration(estimate)} in good light
          </span>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="sheet"
        aria-labelledby="sheet-title"
        onClose={stop}
        onClick={(e) => {
          if (e.target === e.currentTarget) stop();
        }}
      >
        <div className="sheet-body">
          <span className="sheet-handle" aria-hidden="true" />
          <div className="sheet-head">
            <div className="sheet-title">
              <h2 id="sheet-title" className="heading">
                {phase === "sending" ? "Scan this with the other device" : "Preparing…"}
              </h2>
              <p className="sub">
                {subject} · {formatSize(payloadBytes)}
                {passphrase ? " · encrypted" : ""}
              </p>
            </div>
            <button className="icon-btn" aria-label="Stop sending" onClick={stop}>
              <CloseIcon />
            </button>
          </div>

          {phase === "sending" ? (
            <div key="stage" ref={stageRef} className="stage" />
          ) : (
            <div key="placeholder" className="stage stage-placeholder" aria-hidden="true">
              <span className="spinner" />
            </div>
          )}

          <div className="beam-meta">
            <span className="live">{phase === "sending" ? "Live" : "Encoding"}</span>
            <span>
              <b>{symbolCount || "–"}</b> blocks
            </span>
            <span>
              <b>{packetsShown}</b> shown
            </span>
            <span>
              <b>{phase === "sending" ? formatDuration(elapsed) : "–"}</b>
            </span>
          </div>
          <p className="beam-hint">
            On the other device, open Chappe and tap Receive. Keep this screen bright and the phone
            steady. It finishes on its own.
          </p>
          <button className="btn btn-wide" onClick={stop}>
            Stop
          </button>
        </div>
      </dialog>
    </div>
  );
}
