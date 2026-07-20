import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import { useAuth } from "../context/AuthContext";

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Operator";

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-base text-ink">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <span className="font-mono text-[11px] uppercase tracking-widest text-amber">Profile</span>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{displayName}</h1>
        <div className="mt-8 rounded-md border border-border bg-surface p-5">
          <div className="grid gap-4 font-mono text-xs text-muted sm:grid-cols-2">
            <div>
              <div className="mb-1 uppercase tracking-wider">Display name</div>
              <div className="text-base font-semibold text-ink">{displayName}</div>
            </div>
            <div>
              <div className="mb-1 uppercase tracking-wider">Email</div>
              <div className="break-all text-base font-semibold text-ink">{user?.email ?? "n/a"}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-8 rounded-md border border-risk/60 px-4 py-2 font-mono text-xs uppercase tracking-wider text-risk transition-colors hover:bg-risk/10"
          >
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
};

export default Profile;
