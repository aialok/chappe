import { useEffect, useEffectEvent, useRef, useState } from "react";
import { QrReceiver } from "../channel/qr/receiver.ts";
import type { DecodeError, DecodeState, Manifest, Payload } from "../core/types.ts";
import type { AssembleResult } from "../transport/transfer.ts";
import { TransferSink } from "../transport/transfer.ts";
import { CheckIcon, FileIcon } from "./components/icons.tsx";
import { formatRate, formatSize } from "./format.ts";
import { canShareFiles, downloadFile, shareFile } from "./save.ts";

type Phase = "idle" | "scanning" | "passphrase" | "done" | "error";

const MODULES = 64;

function errorText(reason: DecodeError): string {
  switch (reason) {
    case "decrypt-failed":
      return "That passphrase is wrong. Check with the sender and try again.";
    case "passphrase-required":
      return "This transfer is encrypted. Enter the sender's passphrase.";
    case "integrity-mismatch":
      return "The file arrived damaged. Ask the sender to start again.";
    case "decompress-failed":
      return "The data could not be unpacked. Ask the sender to start again.";
    case "malformed-cargo":
      return "The transfer stopped before it finished. Scan again.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

async function safeAssemble(sink: TransferSink): Promise<AssembleResult> {
  try {
    return await sink.assemble();
  } catch {
    return { ok: false, reason: "malformed-cargo" };
  }
}

function ModuleProgress({ ratio }: { ratio: number }) {
  const lit = Math.round(ratio * MODULES);
  return (
    <div className="modules" aria-hidden="true">
      {Array.from({ length: MODULES }, (_, i) => (
        <i key={i} className={i < lit ? "on" : ""} />
      ))}
    </div>
  );
}

function describe(manifest: Manifest): string {
  if (manifest.flags.encrypted) return "Encrypted · name hidden until unlocked";
  const what = manifest.kind === "text" ? "Text" : manifest.name;
  return `${what} · not encrypted`;
}

export function Receive() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [state, setState] = useState<DecodeState>({ kind: "idle" });
  const [incoming, setIncoming] = useState<Manifest | null>(null);
  const [rate, setRate] = useState(0);
  const [passphrase, setPassphrase] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [torch, setTorch] = useState(false);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const receiverRef = useRef<QrReceiver | null>(null);
  const sinkRef = useRef<TransferSink | null>(null);

  const onReady = useEffectEvent(() => void finalize());

  useEffect(() => {
    if (phase !== "scanning") return;
    const video = videoRef.current;
    const sink = sinkRef.current;
    if (!video || !sink) return;
    const receiver = new QrReceiver(video, sink, {
      onState: (next) => {
        setState(next);
        setIncoming(sink.currentManifest);
      },
      onReady,
    });
    receiverRef.current = receiver;
    receiver.start().catch(() => {
      setErrorMsg("The camera did not open. Allow camera access for this site and try again.");
      setPhase("error");
    });
    const id = window.setInterval(() => setRate(receiver.stats.bytesPerSec), 1000);
    return () => {
      window.clearInterval(id);
      receiver.stop();
    };
  }, [phase]);

  function startScan() {
    if (!window.isSecureContext || !navigator.mediaDevices) {
      setErrorMsg("The camera only works over https. Open the https address of this page.");
      setPhase("error");
      return;
    }
    sinkRef.current = new TransferSink(passphrase || undefined);
    setErrorMsg("");
    setPayload(null);
    setIncoming(null);
    setRate(0);
    setTorch(false);
    setState({ kind: "idle" });
    setPhase("scanning");
  }

  function succeed(result: Payload) {
    setPayload(result);
    setPhase("done");
    navigator.vibrate?.(120);
  }

  function fail(reason: DecodeError) {
    setErrorMsg(errorText(reason));
    setPhase(reason === "passphrase-required" || reason === "decrypt-failed" ? "passphrase" : "error");
  }

  async function finalize() {
    const sink = sinkRef.current;
    if (!sink) return;
    if (sink.currentManifest?.flags.encrypted && !passphrase) {
      setPhase("passphrase");
      return;
    }
    const result = await safeAssemble(sink);
    if (result.ok) succeed(result.payload);
    else fail(result.reason);
  }

  async function submitPassphrase() {
    const sink = sinkRef.current;
    if (!sink || !passphrase) return;
    sink.setPassphrase(passphrase);
    const result = await safeAssemble(sink);
    if (result.ok) succeed(result.payload);
    else setErrorMsg(errorText(result.reason));
  }

  async function toggleTorch() {
    const next = !torch;
    if (await receiverRef.current?.setTorch(next)) setTorch(next);
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function reset() {
    setPhase("idle");
    setPayload(null);
    setIncoming(null);
    setErrorMsg("");
    setState({ kind: "idle" });
  }

  if (phase === "scanning") {
    const collecting = state.kind === "collecting";
    const ratio = collecting ? state.ratio : state.kind === "assembling" ? 1 : 0;
    const status = collecting
      ? `${Math.round(ratio * 100)}%`
      : state.kind === "assembling"
        ? "Checking"
        : incoming
          ? "Waiting for blocks"
          : "Looking for codes";
    return (
      <div className="stack">
        <div className="scanner">
          <video ref={videoRef} playsInline muted />
          <div className="viewfinder">
            <span className="corner tl" />
            <span className="corner tr" />
            <span className="corner bl" />
            <span className="corner br" />
          </div>
          {incoming && (
            <div className="scanner-chip">
              {describe(incoming)} · {formatSize(incoming.cargoBytes)}
            </div>
          )}
        </div>
        <ModuleProgress ratio={ratio} />
        <div className="progress-label">
          <span>{status}</span>
          <span>
            {collecting ? `${state.received} / ${state.needed} blocks` : ""}
            {collecting && rate > 0 ? ` · ${formatRate(rate)}` : ""}
          </span>
        </div>
        <div className="row">
          <button className="btn" onClick={toggleTorch}>
            {torch ? "Light off" : "Light on"}
          </button>
          <button className="btn" onClick={reset}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === "passphrase") {
    return (
      <div className="stack">
        <div>
          <h2 className="heading">Enter the passphrase</h2>
          <p className="sub">
            Everything arrived. The contents and the file name stay locked until you enter the
            sender's passphrase.
          </p>
        </div>
        <div className="field">
          <label className="label" htmlFor="recv-unlock">
            Passphrase
          </label>
          <input
            id="recv-unlock"
            className="input"
            type="password"
            value={passphrase}
            autoFocus
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submitPassphrase()}
          />
        </div>
        {errorMsg && (
          <div className="error" role="alert">
            {errorMsg}
          </div>
        )}
        <button
          className="btn btn-primary btn-wide"
          onClick={() => void submitPassphrase()}
          disabled={!passphrase}
        >
          Unlock
        </button>
      </div>
    );
  }

  if (phase === "done" && payload) {
    return (
      <div className="stack">
        <div className="done">
          <span className="done-mark">
            <CheckIcon />
          </span>
          <h2 className="heading">Received</h2>
          <p className="sub">Checked against the sender's SHA-256 fingerprint.</p>
          {payload.kind === "file" && (
            <div className="file-chip">
              <FileIcon />
              <div>
                <strong>{payload.name}</strong>
                <span>{formatSize(payload.bytes.length)}</span>
              </div>
            </div>
          )}
        </div>
        {payload.kind === "text" ? (
          <>
            <textarea className="input" rows={5} readOnly value={payload.text} />
            <div className="row">
              <button className="btn btn-primary" onClick={() => void copyText(payload.text)}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button className="btn" onClick={reset}>
                Receive another
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <button
                className="btn btn-primary"
                onClick={() => downloadFile(payload.name, payload.mime, payload.bytes)}
              >
                Save file
              </button>
              {canShareFiles() && (
                <button
                  className="btn"
                  onClick={() => void shareFile(payload.name, payload.mime, payload.bytes)}
                >
                  Share
                </button>
              )}
            </div>
            <button className="btn btn-wide" onClick={reset}>
              Receive another
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <h2 className="heading">Receive</h2>
        <p className="sub">
          Point your camera at the codes on the sender's screen. Decoding happens on this device.
        </p>
      </div>
      <div className="field">
        <label className="label" htmlFor="recv-pass">
          Passphrase <small>only if the sender set one</small>
        </label>
        <input
          id="recv-pass"
          className="input"
          type="password"
          value={passphrase}
          placeholder="You can also enter it at the end"
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>
      {errorMsg && (
        <div className="error" role="alert">
          {errorMsg}
        </div>
      )}
      <button className="btn btn-primary btn-wide" onClick={startScan}>
        Open camera
      </button>
    </div>
  );
}
