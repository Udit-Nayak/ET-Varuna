import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const getInitials = (displayName?: string | null, email?: string | null) => {
  const source = displayName || email?.split("@")[0] || "Operator";
  const words = source.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const initials = useMemo(() => getInitials(user?.displayName, user?.email), [user?.displayName, user?.email]);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-base/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">Aegis SCR</span>
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-amber/50 bg-surface font-mono text-xs font-semibold text-amber transition-colors hover:bg-amber/10"
            aria-label="Open profile menu"
          >
            {initials}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-md border border-border bg-surface font-mono text-xs text-muted shadow-xl shadow-base/50">
              <div className="border-b border-border px-3 py-2">
                <div className="truncate text-ink">{user?.displayName || "Operator"}</div>
                <div className="truncate text-[11px]">{user?.email}</div>
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
    </header>
  );
};

export default Navbar;
