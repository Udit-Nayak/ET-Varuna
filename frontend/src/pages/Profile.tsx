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

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[28px] border border-border/80 bg-surface/90 shadow-2xl shadow-base/30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(232,163,61,0.14),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(94,201,255,0.1),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.02),transparent_35%)]" />
          <div className="absolute left-10 top-10 h-20 w-20 rounded-full bg-amber/10 blur-3xl" />
          <div className="absolute bottom-10 right-10 h-24 w-24 rounded-full bg-[#5EC9FF]/10 blur-3xl" />

          <div className="relative grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="border-b border-border/80 p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <div className="flex items-start gap-4">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber/40 bg-gradient-to-br from-amber/20 via-surface to-[#5EC9FF]/10 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                  <span className="absolute inset-0 rounded-full ring-1 ring-white/5" />
                  {profile?.photoURL ? (
                    <img src={profile.photoURL} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-3xl font-semibold text-amber">{initials}</span>
                  )}
                </div>
                <div className="min-w-0 pt-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-amber">Operator Profile</div>
                  <h1 className="mt-2 truncate font-display text-2xl font-semibold tracking-tight">
                    {displayName || "Complete profile"}
                  </h1>
                  <p className="mt-1 truncate text-sm text-muted">{email}</p>
                </div>
              </div>

              <div className="mt-8 grid gap-3">
                <div className="rounded-2xl border border-border bg-base/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Status</div>
                  <div className="mt-3 grid gap-3">
                    <SummaryChip label="Account" value={user ? "Signed in" : "Offline"} tone="safe" />
                    <SummaryChip
                      label="Profile"
                      value={isProfileReady(profile) ? "Complete" : "Needs setup"}
                      tone={isProfileReady(profile) ? "safe" : "amber"}
                    />
                    <SummaryChip label="Role" value={profile?.role ?? "user"} tone="muted" />
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-base/55 p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Quick notes</div>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-muted">
                    <p>Keep this profile accurate for audit trails and recommendation labeling.</p>
                    <p>Changes apply across dashboard workflows after save.</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="mt-8 w-full rounded-xl border border-risk/60 px-4 py-3 font-mono text-xs uppercase tracking-[0.25em] text-risk transition-colors hover:bg-risk/10"
              >
                Sign out
              </button>
            </aside>

            <section className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-amber">
                    {setupMode ? "Operator onboarding" : "Profile settings"}
                  </div>
                  <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                    {setupMode ? "Set up your operator identity." : "Refine your operator profile."}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
                    These details keep the workspace readable for your team and make the dashboard feel
                    more personal without adding clutter.
                  </p>
                </div>

                <div className="rounded-2xl border border-amber/20 bg-amber/5 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-amber">
                  {setupMode ? "First time setup" : "Profile editable"}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-8">
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
                    <input
                      id="email"
                      type="email"
                      value={email}
                      readOnly
                      className="auth-input cursor-not-allowed opacity-75"
                    />
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
                  <div className="mt-6 rounded-2xl border border-risk/40 bg-risk/10 px-4 py-3 font-mono text-xs text-risk">
                    {error}
                  </div>
                )}
                {saved && !setupMode && (
                  <div className="mt-6 rounded-2xl border border-safe/40 bg-safe/10 px-4 py-3 font-mono text-xs text-safe">
                    Profile saved.
                  </div>
                )}

                <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    to="/dashboard"
                    className={`inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 font-mono text-xs uppercase tracking-[0.25em] transition-colors hover:border-amber hover:text-amber ${
                      setupMode ? "pointer-events-none opacity-40" : ""
                    }`}
                  >
                    Back to dashboard
                  </Link>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-amber px-6 py-3 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-base shadow-lg shadow-amber/15 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Saving..." : setupMode ? "Complete setup" : "Save changes"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
};

const ProfileField = ({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-2 block font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
      {label}
    </label>
    {children}
  </div>
);

const SummaryChip = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "safe" | "amber" | "muted";
}) => {
  const toneClass = tone === "safe" ? "text-safe" : tone === "amber" ? "text-amber" : "text-muted";
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface/70 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">{label}</span>
      <span className={`truncate font-mono text-[11px] ${toneClass}`}>{value}</span>
    </div>
  );
};

export default Profile;
