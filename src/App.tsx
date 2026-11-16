import { useEffect, useState, type ReactNode } from "react";
import { FinderMark, GitHubIcon, StarIcon } from "./app/components/icons.tsx";
import { Receive } from "./app/Receive.tsx";
import { Send } from "./app/Send.tsx";

type Tab = "send" | "receive";

const REPO_URL = "https://github.com/aialok/chappe";
const AUTHOR_URL = "https://github.com/aialok";
const RELEASE_URL = `${REPO_URL}/releases/latest`;
const OFFLINE_FILE_URL = `${REPO_URL}/releases/latest/download/chappe.html`;
const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`;
const IS_OFFLINE_COPY = location.protocol === "file:";

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

const PROTECTS = [
  "Your file never goes to a server. The page refuses network requests while it runs.",
  "With a passphrase, the contents and the file name are encrypted with AES-256-GCM.",
  "Damaged or altered transfers are detected and refused.",
  "Nothing is stored. No accounts, no history, no analytics.",
];

const DOES_NOT_PROTECT = [
  "Anyone who can see the screen can record the codes. Without a passphrase, they can read them.",
  "People nearby can see that a transfer is happening.",
  "A phone that is taken and unlocked gives up any files saved on it.",
  "A weak passphrase can be guessed from a recording. Use four or more random words.",
  "Chappe has not had an independent security audit yet.",
];

function OfflineAnswer() {
  if (IS_OFFLINE_COPY) {
    return (
      <p>
        You are running the offline copy, so this page needs no internet at all. To pass it on,
        share this same file over Bluetooth, a USB stick or a memory card.
      </p>
    );
  }
  return (
    <>
      <p>
        Yes. Once the page has loaded, transfers work with wifi off. On a phone, use Install app or
        Add to Home Screen and it opens offline too. On a computer, you can also download Chappe as
        a single file and pass it on over Bluetooth, a USB stick or a memory card.
      </p>
      <p>
        <a className="text-link" href={OFFLINE_FILE_URL}>
          Download chappe.html
        </a>
        . Check that its SHA-256 matches the one on the{" "}
        <a className="text-link" href={RELEASE_URL} target="_blank" rel="noreferrer">
          release page
        </a>{" "}
        with <code>shasum -a 256 chappe.html</code>.
      </p>
    </>
  );
}

function SecurityAnswer() {
  return (
    <>
      <div className="security-lists">
        <div>
          <h3>Protects</h3>
          <ul className="is-yes">
            {PROTECTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Does not protect</h3>
          <ul className="is-no">
            {DOES_NOT_PROTECT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p>
        <a className="text-link" href={SECURITY_URL} target="_blank" rel="noreferrer">
          Read the full threat model
        </a>
      </p>
    </>
  );
}

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Is my file uploaded anywhere?",
    a: (
      <p>
        No. Chappe has no server. The file is encoded in your browser, shown as QR codes, and
        decoded by the other device's camera. The page refuses all network requests while it runs.
      </p>
    ),
  },
  { q: "Does it work without internet?", a: <OfflineAnswer /> },
  { q: "What does Chappe protect, and what doesn't it?", a: <SecurityAnswer /> },
  {
    q: "Which devices does it work on?",
    a: (
      <p>
        Any recent browser with a camera: Chrome, Safari, Edge or Firefox, on iPhone, Android, Mac,
        Windows or Linux. Files up to 5 MB.
      </p>
    ),
  },
  {
    q: "Why is it called Chappe?",
    a: (
      <p>
        After Claude Chappe, who built the optical telegraph in 1792: towers that passed messages
        along by sight. Chappe does the same with a screen and a camera.
      </p>
    ),
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
        <a className="logo" href={IS_OFFLINE_COPY ? "#app" : "/"} aria-label="Chappe home">
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

        <section className="faq" aria-labelledby="faq-title">
          <h2 id="faq-title" className="section-title">
            Questions
          </h2>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <div className="faq-answer">{item.a}</div>
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
        <span className="foot-links">
          <a href={SECURITY_URL} target="_blank" rel="noreferrer">
            Security
          </a>
          <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            MIT license
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
