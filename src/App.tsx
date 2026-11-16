import { useEffect, useState } from "react";
import { FinderMark, GitHubIcon, StarIcon } from "./app/components/icons.tsx";
import { Receive } from "./app/Receive.tsx";
import { Send } from "./app/Send.tsx";

type Tab = "send" | "receive";

const REPO_URL = "https://github.com/aialok/chappe";
const AUTHOR_URL = "https://github.com/aialok";

const STEPS = [
  {
    title: "Open Chappe on both devices",
    body: "Same link on each. No install, no account, no pairing.",
  },
  {
    title: "Add a file or text and tap Show QR code",
    body: "Optionally set a passphrase to encrypt it first.",
  },
  {
    title: "On the other device, tap Receive",
    body: "Point the camera at the screen. The file arrives and is checked automatically.",
  },
];

const FACTS = [
  {
    title: "No network",
    body: "The page blocks every outgoing request, so the file can only leave through the screen.",
  },
  {
    title: "Encrypted",
    body: "With a passphrase, the file is sealed with AES-256-GCM before the first code is drawn.",
  },
  {
    title: "Loss-tolerant",
    body: "Fountain codes rebuild the file from whatever codes the camera catches, in any order.",
  },
  {
    title: "Up to 5 MB",
    body: "Text, links, PDFs, images. Small files finish in seconds, bigger ones in a minute or two.",
  },
];

const FAQ = [
  {
    q: "Is my file uploaded anywhere?",
    a: "No. Chappe has no server. The file is encoded in your browser, shown as QR codes, and decoded by the other device's camera. The page refuses all network requests while it runs.",
  },
  {
    q: "Does it work without internet?",
    a: "Yes. Once the page has loaded, you can turn wifi off and transfers still work. Install it from your browser menu and it opens offline too.",
  },
  {
    q: "Is it safe for sensitive files?",
    a: "Set a passphrase. The file is then encrypted with AES-256-GCM, so anyone who films the screen without the passphrase gets nothing readable. Without one, anyone who can see the screen could record the codes.",
  },
  {
    q: "Which devices does it work on?",
    a: "Any recent browser with a camera: Chrome, Safari, Edge or Firefox, on iPhone, Android, Mac, Windows or Linux. The receiving device needs camera permission.",
  },
  {
    q: "Why is it called Chappe?",
    a: "After Claude Chappe, who built the optical telegraph in 1792: towers that passed messages along by sight. Chappe does the same with a screen and a camera.",
  },
];

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

function useInstallPrompt(): (() => void) | null {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!deferred) return null;
  return () => {
    void deferred.prompt().finally(() => setDeferred(null));
  };
}

export function App() {
  const [tab, setTab] = useState<Tab>("send");
  const install = useInstallPrompt();

  return (
    <div className="shell">
      <header className="topbar">
        <a className="logo" href="/" aria-label="Chappe home">
          <FinderMark />
          Chappe
        </a>
        <nav className="top-actions">
          {install && (
            <button className="top-link" onClick={install}>
              Install app
            </button>
          )}
          <a className="top-link gh" href={REPO_URL} target="_blank" rel="noreferrer">
            <GitHubIcon />
            <span>Star</span>
            <StarIcon />
          </a>
        </nav>
      </header>

      <div className="layout">
        <section className="intro">
          <h1>File transfer at the speed of sight.</h1>
          <p>
            Chappe turns a file into a stream of QR codes. The other device reads them with its
            camera. No internet, no server, no upload.
          </p>
        </section>

        <main className="tool" id="app">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "send"} onClick={() => setTab("send")}>
              Send
            </button>
            <button role="tab" aria-selected={tab === "receive"} onClick={() => setTab("receive")}>
              Receive
            </button>
          </div>
          {tab === "send" ? <Send /> : <Receive />}
        </main>

        <section className="steps" aria-labelledby="steps-title">
          <h2 id="steps-title" className="section-title">
            How to use it
          </h2>
          <ol>
            {STEPS.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <dl className="facts">
          {FACTS.map((fact) => (
            <div className="fact" key={fact.title}>
              <dt>{fact.title}</dt>
              <dd>{fact.body}</dd>
            </div>
          ))}
        </dl>

        <section className="faq" aria-labelledby="faq-title">
          <h2 id="faq-title" className="section-title">
            Questions
          </h2>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      </div>

      <footer className="foot">
        <span>
          Made with <span className="heart">♥</span> by{" "}
          <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
            aialok
          </a>
        </span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Open source on GitHub
        </a>
      </footer>
    </div>
  );
}
