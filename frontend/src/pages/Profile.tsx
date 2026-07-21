import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import { isProfileReady, useAuth } from "../context/AuthContext";

const Profile = () => {
  const { user, profile, updateUserProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setupMode = searchParams.get("setup") === "1" || !isProfileReady(profile);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const email = user?.email ?? profile?.email ?? "";
  const initials = useMemo(() => {
    const source = displayName || email.split("@")[0] || "Operator";
    const words = source.trim().split(/\s+/);
    return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : `${words[0][0]}${words[1][0]}`.toUpperCase();
  }, [displayName, email]);

  useEffect(() => {
    setDisplayName(profile?.displayName || user?.displayName || "");
    setPhone(profile?.phone || "");
    setOccupation(profile?.occupation || "");
  }, [profile, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);

    try {
      await updateUserProfile({ displayName, phone, occupation });
      setSaved(true);
      if (setupMode) {
        navigate("/dashboard", { replace: true });
      }
    } catch {
      setError("Could not save your profile. Please check all fields and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-base text-ink">
      <Navbar />
      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-md border border-border bg-surface p-5">
            <div className="flex items-center gap-4">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="" className="h-16 w-16 rounded-full border border-border object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber/50 bg-amber/10 font-display text-xl font-semibold text-amber">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-display text-xl font-semibold">{displayName || "Complete profile"}</div>
                <div className="truncate font-mono text-xs text-muted">{email}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 border-t border-border pt-5 font-mono text-xs">
              <StatusRow label="Account" value={user ? "Signed in" : "Offline"} tone="safe" />
              <StatusRow label="Profile" value={isProfileReady(profile) ? "Complete" : "Needs setup"} tone={isProfileReady(profile) ? "safe" : "amber"} />
              <StatusRow label="Role" value={profile?.role ?? "user"} tone="muted" />
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-6 w-full rounded-md border border-risk/60 px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-risk transition-colors hover:bg-risk/10"
            >
              Sign out
            </button>
          </div>
        </aside>

        <section className="rounded-md border border-border bg-surface">
          <div className="border-b border-border px-6 py-5">
            <span className="font-mono text-[11px] uppercase tracking-widest text-amber">
              {setupMode ? "Operator onboarding" : "Profile settings"}
            </span>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              {setupMode ? "Tell us who is operating this dashboard." : "Manage your operator profile."}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              These details help label recommendations and keep team-level access auditable across the
              energy supply chain workflow.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-6 p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <ProfileField label="Full name" htmlFor="displayName">
                <input
                  id="displayName"
                  type="text"
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Jordan Rao"
                  className="auth-input"
                />
              </ProfileField>

              <ProfileField label="Email" htmlFor="email">
                <input id="email" type="email" value={email} readOnly className="auth-input cursor-not-allowed opacity-75" />
              </ProfileField>

              <ProfileField label="Phone" htmlFor="phone">
                <input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98765 43210"
                  className="auth-input"
                />
              </ProfileField>

              <ProfileField label="Occupation" htmlFor="occupation">
                <input
                  id="occupation"
                  type="text"
                  required
                  value={occupation}
                  onChange={(event) => setOccupation(event.target.value)}
                  placeholder="Energy analyst, logistics lead, policymaker..."
                  className="auth-input"
                />
              </ProfileField>
            </div>

            {error && (
              <div className="rounded-md border border-risk/40 bg-risk/10 px-3 py-2 font-mono text-xs text-risk">
                {error}
              </div>
            )}
            {saved && !setupMode && (
              <div className="rounded-md border border-safe/40 bg-safe/10 px-3 py-2 font-mono text-xs text-safe">
                Profile saved.
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Link
                to="/dashboard"
                className={`rounded-md border border-border px-4 py-2.5 text-center font-mono text-xs uppercase tracking-wider transition-colors hover:border-amber hover:text-amber ${
                  setupMode ? "pointer-events-none opacity-40" : ""
                }`}
              >
                Back to dashboard
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-amber px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-base transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Saving..." : setupMode ? "Complete setup" : "Save changes"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
};

const ProfileField = ({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1.5 block font-mono text-xs uppercase tracking-wider text-muted">
      {label}
    </label>
    {children}
  </div>
);

const StatusRow = ({ label, value, tone }: { label: string; value: string; tone: "safe" | "amber" | "muted" }) => {
  const toneClass = tone === "safe" ? "text-safe" : tone === "amber" ? "text-amber" : "text-muted";
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="uppercase tracking-wider text-muted">{label}</span>
      <span className={`truncate ${toneClass}`}>{value}</span>
    </div>
  );
};

export default Profile;
