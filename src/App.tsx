import { useState } from "react";
import { FinderMark } from "./app/components/icons.tsx";
import { NetworkShield } from "./app/components/NetworkShield.tsx";
import { Receive } from "./app/Receive.tsx";
import { Send } from "./app/Send.tsx";

type Tab = "send" | "receive";

const FACTS = [
  {
    title: "No network",
    body: "Works with wifi off. The page blocks every outgoing request, so the file can only leave through the screen.",
  },
  {
    title: "Encrypted",
    body: "Add a passphrase and the file is sealed with AES-256-GCM before the first code is drawn.",
  },
  {
    title: "Loss-tolerant",
    body: "Fountain codes let the receiver rebuild the file from whatever frames it catches, in any order.",
  },
  {
    title: "Up to 5 MB",
    body: "Text, links, PDFs, images. Small files finish in seconds; bigger ones take a minute or two.",
  },
];

export function App() {
  const [tab, setTab] = useState<Tab>("send");
  const [focus, setFocus] = useState(false);

  return (
    <div className={`shell${focus ? " is-focus" : ""}`}>
      <header className="topbar">
        <span className="logo">
          <FinderMark />
          ScanDrop
        </span>
        <NetworkShield />
      </header>

      <div className="layout">
        {!focus && (
          <section className="intro">
            <h1>Share files by pointing a camera.</h1>
            <p>
              ScanDrop turns a file into a stream of QR codes. The other device
              reads them with its camera. Nothing touches the internet.
            </p>
          </section>
        )}

        <main className="tool">
          {!focus && (
            <div className="tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "send"}
                onClick={() => setTab("send")}
              >
                Send
              </button>
              <button
                role="tab"
                aria-selected={tab === "receive"}
                onClick={() => setTab("receive")}
              >
                Receive
              </button>
            </div>
          )}
          {tab === "send" ? <Send onFocusChange={setFocus} /> : <Receive />}
        </main>

        {!focus && (
          <dl className="facts">
            {FACTS.map((fact) => (
              <div className="fact" key={fact.title}>
                <dt>{fact.title}</dt>
                <dd>{fact.body}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <footer className="foot">
        <span>Open source · runs entirely in your browser</span>
        <span>No accounts · no uploads · no tracking</span>
      </footer>
    </div>
  );
}
