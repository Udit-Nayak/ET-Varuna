import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const getInitials = (displayName?: string | null, email?: string | null) => {
  const source = displayName || email?.split("@")[0] || "Operator";
  const words = source.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const Navbar = () => {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const displayName = profile?.displayName || user?.displayName || "Operator";
  const email = profile?.email || user?.email;
  const initials = useMemo(() => getInitials(displayName, email), [displayName, email]);

  useEffect(() => {
    if (chatOpen) {
      window.setTimeout(() => chatInputRef.current?.focus(), 0);
    }
  }, [chatOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const handleAsk = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isBusy) return;

    setIsBusy(true);
    setAnswer("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "Chat request failed");
      setAnswer(String(payload.final ?? "No answer returned."));
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "Chat request failed");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-base/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">Aegis SCR</span>
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setChatOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-amber/50 bg-surface text-[11px] font-semibold text-amber shadow-sm shadow-base/30 transition-colors hover:bg-amber/10"
            aria-label="AI bot"
            title="AI bot"
          >
            AI
          </button>

          <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-amber/50 bg-surface font-mono text-xs font-semibold text-amber transition-colors hover:bg-amber/10"
            aria-label="Open profile menu"
          >
            {profile?.photoURL ? <img src={profile.photoURL} alt="" className="h-full w-full object-cover" /> : initials}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-md border border-border bg-surface font-mono text-xs text-muted shadow-xl shadow-base/50">
              <div className="border-b border-border px-3 py-2">
                <div className="truncate text-ink">{displayName}</div>
                <div className="truncate text-[11px]">{email}</div>
              </div>
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 transition-colors hover:bg-amber/10 hover:text-amber"
              >
                Profile
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-risk/10 hover:text-risk"
              >
                Sign out
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      {chatOpen && (
        <div className="fixed right-6 top-20 z-50 w-[min(30rem,calc(100vw-1.5rem))] rounded-md border border-amber/40 bg-surface/95 shadow-2xl shadow-base/70 backdrop-blur">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-amber">AI assistant</div>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber hover:text-amber"
            >
              Close
            </button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto px-4 py-3 text-sm text-ink">
            {answer ? (
              <pre className="whitespace-pre-wrap font-sans leading-6 text-ink">{answer}</pre>
            ) : (
              <div className="text-muted">Start a question to begin.</div>
            )}
          </div>

          <form onSubmit={handleAsk} className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask anything..."
                className="min-w-0 flex-1 rounded border border-border bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-amber"
              />
              <button
                type="submit"
                disabled={isBusy || !query.trim()}
                className="rounded bg-amber px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-base transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? "..." : "Ask"}
              </button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
};

export default Navbar;

