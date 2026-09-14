import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SavedTab } from "../db";
import { useI18n } from "../../i18n/useI18n";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { AIRequestError, aiRequest, parseArticle, type Source } from "../../ai/service";
import { AISettingsCard } from "./AISettingsCard";
import {
  XMarkIcon,
  PaperAirplaneIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  ArrowPathIcon,
  LockClosedIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

function ProgressiveText({ text }: { text: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setCount(value => Math.min(value + 2, text.length)), 28);
    return () => window.clearInterval(timer);
  }, [text]);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return <div role="status" aria-live="polite" style={{ textAlign: 'start', width: '100%', minHeight: 44 }}>
    <span className="sr-only">{text}</span>
    <span aria-hidden="true" style={{ color: 'var(--text-color)', fontWeight: 600 }}>{reduced ? text : text.slice(0, count)}<span style={{ opacity: .4 }}>▍</span></span>
  </div>;
}

function SiteIcon({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img src={src} alt="" width={20} height={20} decoding="async"
      onError={() => setFailed(true)} style={{ borderRadius: "4px", flexShrink: 0 }} />
  ) : <DocumentTextIcon style={{ width: "20px", height: "20px", flexShrink: 0, color: "#818cf8" }} />;
}

function richInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} style={{ fontWeight: 750, color: "var(--text-color)" }}>{part.slice(2, -2)}</strong>;
    }
    if (/^\[\d+\]$/.test(part)) {
      return <span key={index} style={{ display: "inline-flex", padding: "0 4px", marginLeft: "2px", borderRadius: "5px", background: "rgba(99,102,241,.14)", color: "#818cf8", fontSize: "9px", fontWeight: 800 }}>{part.slice(1, -1)}</span>;
    }
    return part;
  });
}

function StructuredAnswer({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowWrap: "anywhere" }}>
      {text.split("\n").map((raw, index) => {
        const line = raw.trim();
        if (!line) return <div key={index} style={{ height: "1px" }} />;
        const heading = line.match(/^#{1,4}\s+(.+)$/);
        if (heading) {
          return <h3 key={index} style={{ margin: "5px 0 0", fontSize: "12.5px", lineHeight: 1.3, color: "#a5b4fc", fontWeight: 800 }}>{richInline(heading[1].replace(/^\*\*|\*\*$/g, ""))}</h3>;
        }
        const bullet = line.match(/^[-*•]\s+(.+)$/);
        if (bullet) {
          return (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "7px 1fr", gap: "8px", alignItems: "start", lineHeight: 1.55 }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#818cf8", marginTop: "7px" }} />
              <span>{richInline(bullet[1])}</span>
            </div>
          );
        }
        const numbered = line.match(/^\d+[.)]\s+(.+)$/);
        if (numbered) {
          return <div key={index} style={{ paddingLeft: "4px", lineHeight: 1.55 }}>{richInline(line)}</div>;
        }
        return <p key={index} style={{ margin: 0, lineHeight: 1.6 }}>{richInline(line)}</p>;
      })}
    </div>
  );
}

export function AIDiscussModal({
  tabs,
  onClose,
}: {
  title: string;
  tabs: SavedTab[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef);
  const abort = useRef<AbortController | null>(null);
  const requestId = useRef("");

  const [configured, setConfigured] = useState(false);
  const [settings, setSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"api" | "pro">("api");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeProvider, setActiveProvider] = useState("Google Gemini");
  const [targetIndex, setTargetIndex] = useState(0);
  const [quotaReached, setQuotaReached] = useState(false);
  const [progressStage, setProgressStage] = useState("Reading the page…");

  function startProgress() {
    setProgressStage("Reading the page and collecting the main content…");
  }

  useEffect(() => {
    void aiRequest("status")
      .then((result) => {
        setConfigured(result.configured);
        if (result.provider) {
          setActiveProvider(result.provider);
        }
        // If not configured, automatically show settings/connect page as the first view
        return chrome.storage.local.get(["tabStory.aiModel", "tabStory.activeAIProvider"]);
      })
      .then((val) => {
        const savedProvider = val["tabStory.activeAIProvider"];
        if (typeof savedProvider === "string" && savedProvider) {
          setActiveProvider(savedProvider);
        }
      })
      .catch(() => setError("AI service unavailable. Reload the extension."));

    return () => {
      abort.current?.abort();
      if (requestId.current) void aiRequest("cancel", { id: requestId.current }).catch(() => {});
    };
  }, [tabs]);

  const primaryTab = tabs[targetIndex] || tabs[0];
  const tabFavicon =
    (primaryTab?.url
      ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(primaryTab.url)}&size=32`
      : "");
  const tabDomain = primaryTab?.domain || "";

  async function ensureSources(tabId: number): Promise<Source[]> {
    setError("");
    try {
      const result = await aiRequest("sources", { tabId, url: new URL(primaryTab.url).href });
      const source = parseArticle(result.snapshot);
      return [source];
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Could not read page content.";
      setError(msg);
      throw cause;
    }
  }

  async function generate(question: string) {
    if (busy) return;
    setError("");
    setAnswer("");
    setQuotaReached(false);
    if (!configured || activeProvider !== "Google Gemini") {
      setSettings(true);
      setError("Connect your Gemini API key to summarize the selected tab.");
      return;
    }
    setBusy(true);
    startProgress();
    const controller = new AbortController();
    abort.current = controller;
    requestId.current = crypto.randomUUID();
    try {
      // Request only this site's access from the user's summary-button gesture.
      // Clicking inside a side panel does not grant Chrome's activeTab permission.
      if (!primaryTab?.url || !/^https?:\/\//i.test(primaryTab.url)) {
        throw new Error("Select a saved webpage to summarize. Chrome internal pages cannot be read.");
      }
      const pageUrl = new URL(primaryTab.url);
      if (pageUrl.hostname === "chromewebstore.google.com" ||
          (pageUrl.hostname === "chrome.google.com" && pageUrl.pathname.startsWith("/webstore"))) {
        throw new Error("Chrome does not allow extensions to read the Chrome Web Store. Open another webpage.");
      }
      const origins = [`${pageUrl.protocol}//${pageUrl.hostname}/*`];
      const granted = await chrome.permissions.request({ origins });
      controller.signal.throwIfAborted();
      if (!granted) {
        throw new Error(`Allow Tab Story to read ${pageUrl.hostname} in Chrome's permission prompt, then try again.`);
      }
      setProgressStage("Opening the selected tab and reading its content…");
      const target = await aiRequest("target", { url: primaryTab.url });
      controller.signal.throwIfAborted();
      const input = await ensureSources(target.tabId);
      controller.signal.throwIfAborted();
      const parts = Math.ceil(input[0].text.length / 12000);
      setProgressStage(parts > 1 ? "Summarizing article sections and combining the results…" : "Writing your page summary…");
      const result = await aiRequest("generate", {
        id: requestId.current, providerId: 'gemini',
        sources: input, query: question, language: "en-US",
      });
      controller.signal.throwIfAborted();
      setAnswer(result.text + (result.incomplete ? "\n\nResponse reached its length limit." : ""));
    } catch (cause) {
      if (cause instanceof AIRequestError && cause.code === "AI_QUOTA") setQuotaReached(true);
      else setError(controller.signal.aborted ? "Summarization cancelled." : cause instanceof Error ? cause.message : "Could not summarize this page.");
    } finally {
      setBusy(false);
      requestId.current = "";
    }
  }

  function handleCopy() {
    if (!answer) return;
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function cancel() {
    abort.current?.abort();
    if (requestId.current) void aiRequest("cancel", { id: requestId.current });
  }

  return (
    <div
      onClick={() => {
        cancel();
        onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.48)",
        backdropFilter: "blur(3px)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "stretch",
      }}
    >
      <style>{`
        @keyframes slideUpDrawer {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
        .summary-panel { scrollbar-width: thin; scrollbar-color: var(--border-color) transparent; }
        .summary-panel button { transition: opacity 150ms ease, box-shadow 150ms ease; }
        .summary-panel button:hover:not(:disabled) { opacity: .85; }
        .summary-panel button:focus-visible, .summary-panel select:focus-visible {
          outline: 2px solid #818cf8; outline-offset: 3px;
        }
        .summary-composer:focus-within {
          border-color: #818cf8 !important;
          box-shadow: 0 0 0 3px rgba(129,140,248,.12);
        }
        .summary-panel button:disabled { opacity: .45; }
        .article-image-placeholder {
          background: linear-gradient(105deg, rgba(120,120,130,.08) 30%, rgba(129,140,248,.16) 45%, rgba(120,120,130,.08) 60%);
          background-size: 220% 100%;
          animation: articleImageShimmer 1.35s ease-in-out infinite;
        }
        @keyframes articleImageShimmer {
          from { background-position: 100% 0; }
          to { background-position: -100% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .article-image-placeholder { animation: none; }
        }
      `}</style>
      <section
        className="summary-panel"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("tabs.discuss")}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancel();
            onClose();
          }
        }}
        style={{
          background: "var(--modal-bg)",
          borderTop: "1px solid var(--modal-border)",
          borderLeft: "1px solid var(--modal-border)",
          borderRight: "1px solid var(--modal-border)",
          borderBottom: "none",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxHeight: "88vh",
          overflow: "hidden",
          padding: "12px 18px 18px",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.22)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxSizing: "border-box",
          animation: "slideUpDrawer 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Grab Handle at the top of bottom sheet */}
        <div
          style={{
            width: "36px",
            height: "4px",
            borderRadius: "2px",
            background: "var(--border-color)",
            margin: "0 auto 2px auto",
            flexShrink: 0,
          }}
        />

        {/* Modal Top Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            borderBottom: "1px solid var(--border-color)",
            paddingBottom: "14px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
            <span
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "var(--text-color)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Ask this page
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {/* Close Button */}
            <button
              aria-label="Close summary"
              onClick={() => {
                cancel();
                onClose();
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--placeholder-color)",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "5px",
              }}
            >
              <XMarkIcon style={{ width: "16px", height: "16px" }} />
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: "7px 10px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#ef4444",
              fontSize: "11.5px",
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {/* VIEW 1: AI SETTINGS & PROVIDER SHOWCASE (First screen or on Settings toggle) */}
        {settings ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: 0, overflowY: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-color)" }}>
                Connect AI Provider
              </span>
              <span style={{ fontSize: "11px", color: "var(--placeholder-color)" }}>
                Choose a free API provider or unlock Tab Story Pro.
              </span>
            </div>

            <AISettingsCard
              key={settingsTab}
              compact={true}
              initialTab={settingsTab}
              onSuccess={(connection) => {
                setConfigured(true);
                setActiveProvider(connection.provider);
                setSettings(false);
                setError("");
              }}
            />

            {configured && (
              <button
                onClick={() => setSettings(false)}
                style={{
                  padding: "7px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "rgba(120, 120, 130, 0.08)",
                  color: "var(--text-color)",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Back to Tab Discussion ➔
              </button>
            )}
          </div>
        ) : (
          /* VIEW 2: ACTIVE AI DISCUSSION / SUMMARY VIEW */
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minHeight: 0, flex: 1 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", flexShrink: 0 }}>
              {[
                ["Key points", "Give only the most important key points from this page, as 3–5 short bullets."],
                ["Explain simply", "Explain the main concept on this page in simple language, briefly."],
                ["Examples", "Describe the concrete examples included on this page. If none are included, say so briefly."],
                ["Next steps", "List the practical next steps explicitly described on this page. If none are given, say so briefly."],
              ].map(([label, prompt]) => (
                <button key={label} disabled={busy} onClick={() => void generate(prompt)}
                  style={{ padding: "7px 10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--card-bg)", color: "var(--text-color)", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: "14px", paddingRight: "4px", scrollbarWidth: "thin" }}>
            {tabs.length > 1 && !busy && !answer && (
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px", color: "var(--text-color)" }}>
                Target tab
                <select value={targetIndex} disabled={busy} onChange={(event) => {
                  setTargetIndex(Number(event.target.value));
                  setAnswer(""); setError(""); setQuotaReached(false);
                }} style={{ width: "100%", padding: "8px", borderRadius: "8px", background: "var(--input-bg)", color: "var(--text-color)", border: "1px solid var(--border-color)" }}>
                  {tabs.map((tab, index) => <option key={tab.id || index} value={index}>{tab.title || tab.url}</option>)}
                </select>
              </label>
            )}
            {/* One clear, professional primary action */}
            {!answer && !busy && !quotaReached && (
              <button
                disabled={busy}
                onClick={() => void generate("Summarize the main ideas, key details and conclusions of this article.")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "11px 12px",
                  borderRadius: "11px",
                  border: "1px solid rgba(99,102,241,.3)",
                  background: "linear-gradient(135deg, rgba(99,102,241,.16), rgba(79,70,229,.08))",
                  color: "var(--text-color)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ width: "32px", height: "32px", borderRadius: "9px", display: "grid", placeItems: "center", background: "#6366f1", color: "white", flexShrink: 0 }}>
                  <DocumentTextIcon style={{ width: "17px", height: "17px" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: 800 }}>Summarize selected tab</div>
                  <div style={{ fontSize: "11px", color: "var(--placeholder-color)", marginTop: "2px" }}>Sends this page’s extracted text and your question to Google Gemini.</div>
                </div>
                <span style={{ color: "#818cf8", fontSize: "16px" }}>→</span>
              </button>
            )}

            {/* AI Response Card */}
            {quotaReached ? (
              <div
                role="status"
                style={{
                  padding: "14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(168,85,247,.32)",
                  background: "linear-gradient(145deg, rgba(168,85,247,.13), rgba(99,102,241,.07))",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
                  <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: "rgba(168,85,247,.18)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <LockClosedIcon style={{ width: "16px", height: "16px", color: "#c084fc" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, color: "var(--text-color)" }}>Free API limit reached</div>
                    <div style={{ fontSize: "10.5px", lineHeight: 1.45, color: "var(--placeholder-color)", marginTop: "2px" }}>
                      Wait for your provider quota to reset or review your Gemini account usage.
                    </div>
                  </div>
                </div>
                <div>
                  <button onClick={() => { setSettingsTab("pro"); setSettings(true); }} style={{ border: 0, background: "linear-gradient(135deg,#a855f7,#6366f1)", color: "white", borderRadius: "8px", padding: "8px", fontSize: "10.5px", fontWeight: 750, cursor: "pointer" }}>View Premium</button>
                </div>
                <button onClick={() => void generate(query || "Summarize the most important points from this page.")} style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "4px", border: 0, background: "transparent", color: "#a5b4fc", fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }}>
                  <ArrowPathIcon style={{ width: "12px", height: "12px" }} /> Try free API again
                </button>
              </div>
            ) : answer ? (
              <div
                style={{
                  background: "transparent",
                  border: "none",
                  borderRadius: "0",
                  padding: "4px 0 16px",
                  flexShrink: 0,
                  fontSize: "13.5px",
                  lineHeight: 1.7,
                  fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  letterSpacing: "-0.005em",
                  color: "var(--text-color)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 650, color: "var(--text-color)" }}>Answer</div>
                    </div>
                  </div>
                  <button
                    onClick={handleCopy}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                      background: "transparent",
                      border: "none",
                      color: copied ? "#34d399" : "var(--placeholder-color)",
                      fontSize: "11px",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {copied ? (
                      <>
                        <ClipboardDocumentCheckIcon style={{ width: "13px", height: "13px" }} />
                        Copied
                      </>
                    ) : (
                      <>
                        <ClipboardDocumentIcon style={{ width: "13px", height: "13px" }} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div style={{ height: "1px", background: "var(--border-color)" }} />
                <StructuredAnswer text={answer} />
              </div>
            ) : busy ? (
              <div
                style={{
                  padding: "20px 16px",
                  border: "1px solid var(--border-color)",
                  borderRadius: "16px",
                  background: "var(--card-bg)",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  color: "var(--placeholder-color)",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", minWidth: 0 }}>
                  <SiteIcon key={tabFavicon} src={tabFavicon} />
                  <span style={{ fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tabDomain}</span>
                </div>
                <ProgressiveText key={progressStage} text={progressStage} />
                <div aria-hidden="true" style={{ width: "100%", display: "grid", gap: "8px" }}>
                  {[100, 85, 60].map(width => <div key={width} className="article-image-placeholder" style={{ height: "8px", width: width + "%", borderRadius: "4px" }} />)}
                </div>
                <button
                  onClick={cancel}
                  style={{
                    fontSize: "11px",
                    color: "var(--placeholder-color)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "6px 12px",
                    borderRadius: "7px",
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : null}
            </div>

            {/* Question Input Form */}
            <form
              className="summary-composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim() && !busy) {
                  const q = query;
                  setQuery("");
                  void generate(q);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                borderRadius: "14px",
                padding: "9px 10px",
                flexShrink: 0,
                boxShadow: "0 4px 20px rgba(0,0,0,.08)",
                transition: "border-color 150ms ease, box-shadow 150ms ease",
              }}
            >
              <input
                aria-label="Summary focus"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={600}
                placeholder="Ask a question or enter a keyword…"
                disabled={busy}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "13px",
                  color: "var(--text-color)",
                  padding: "6px 4px",
                }}
              />
              <button
                aria-label="Send summary request"
                type="submit"
                disabled={busy || !query.trim()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "34px",
                  height: "34px",
                  borderRadius: "10px",
                  border: "none",
                  background: query.trim() ? "#6366f1" : "var(--btn-hover-bg)",
                  color: query.trim() ? "#ffffff" : "var(--placeholder-color)",
                  cursor: query.trim() && !busy ? "pointer" : "default",
                  flexShrink: 0,
                  transition: "background 0.12s ease",
                }}
              >
                <PaperAirplaneIcon style={{ width: "14px", height: "14px" }} />
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
