import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

type MiniChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "loading" | "done" | "error";
};

const makeChatId = () =>
  crypto.randomUUID?.() ?? `mini-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
  const [chatMessages, setChatMessages] = useState<MiniChatMessage[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const displayName = profile?.displayName || user?.displayName || "Operator";
  const email = profile?.email || user?.email;
  const initials = useMemo(() => getInitials(displayName, email), [displayName, email]);

  useEffect(() => {
    if (chatOpen) {
      window.setTimeout(() => chatInputRef.current?.focus(), 0);
    }
  }, [chatOpen]);

  useEffect(() => {
    const node = chatScrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatMessages, chatOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const handleAsk = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isBusy) return;

    setIsBusy(true);
    setQuery("");
    const assistantId = makeChatId();
    setChatMessages((current) => [
      ...current,
      { id: makeChatId(), role: "user", content: trimmed, status: "done" },
      { id: assistantId, role: "assistant", content: "Thinking...", status: "loading" },
    ]);
    try {
      if (!user) throw new Error("Please sign in to use the AI assistant.");
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/chat/direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "Chat request failed");
      setChatMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: String(payload.answer ?? "No info about it."), status: "done" }
            : message
        )
      );
    } catch (error) {
      setChatMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: error instanceof Error ? error.message : "Chat request failed", status: "error" }
            : message
        )
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-base/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">Sentrix</span>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChatMessages([])}
                className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber hover:text-amber"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber hover:text-amber"
              >
                Close
              </button>
            </div>
          </div>

          <div ref={chatScrollRef} className="flex max-h-[28rem] min-h-64 flex-col gap-3 overflow-y-auto px-4 py-3 text-sm text-ink">
            {chatMessages.length > 0 ? (
              chatMessages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-md border px-3 py-2 leading-6 shadow-sm ${
                      message.role === "user"
                        ? "border-amber/50 bg-amber text-base"
                        : message.status === "error"
                          ? "border-risk/50 bg-risk/10 text-ink"
                          : "border-border bg-base/80 text-ink"
                    }`}
                  >
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-wider opacity-75">
                      {message.role === "user" ? "You" : "Assistant"}
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="my-auto rounded border border-dashed border-border bg-base/40 px-4 py-6 text-center text-muted">
                Ask for a short definition, meaning, or full form.
              </div>
            )}
          </div>

          <form onSubmit={handleAsk} className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask a term, e.g. BBL..."
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

