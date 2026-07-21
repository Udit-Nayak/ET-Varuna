import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateFirebaseProfile,
  GoogleAuthProvider,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../firebase/config";

export interface AppUserProfile {
  _id?: string;
  firebaseUid: string;
  email: string;
  displayName?: string;
  phone?: string;
  occupation?: string;
  photoURL?: string;
  role: "user" | "admin";
  isActive: boolean;
  isProfileComplete: boolean;
  lastLoginAt: string;
}

interface ProfileInput {
  displayName: string;
  phone: string;
  occupation: string;
}

interface AuthContextValue {
  user: FirebaseUser | null;
  profile: AppUserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AppUserProfile | null>;
  signup: (email: string, password: string, displayName: string) => Promise<AppUserProfile | null>;
  signInWithGoogle: () => Promise<AppUserProfile | null>;
  updateUserProfile: (input: ProfileInput) => Promise<AppUserProfile | null>;
  refreshProfile: () => Promise<AppUserProfile | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const readProfile = (payload: unknown): AppUserProfile | null => {
  const profile = (payload as { user?: AppUserProfile } | null)?.user;
  return profile ?? null;
};

export const isProfileReady = (profile: AppUserProfile | null): boolean =>
  Boolean(profile?.isProfileComplete && profile.displayName?.trim() && profile.phone?.trim() && profile.occupation?.trim());

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const requestWithToken = async (firebaseUser: FirebaseUser, path: string, init: RequestInit = {}) => {
    const token = await firebaseUser.getIdToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...((init.headers as Record<string, string> | undefined) ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json() as Promise<unknown>;
  };

  const syncUserWithBackend = async (firebaseUser: FirebaseUser): Promise<AppUserProfile | null> => {
    const payload = await requestWithToken(firebaseUser, "/api/auth/sync", { method: "POST" });
    const synced = readProfile(payload);
    setProfile(synced);
    return synced;
  };

  const refreshProfileForUser = async (firebaseUser: FirebaseUser): Promise<AppUserProfile | null> => {
    const payload = await requestWithToken(firebaseUser, "/api/auth/me");
    const current = readProfile(payload);
    setProfile(current);
    return current;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);
      setProfile(null);

      if (!firebaseUser) {
        setLoading(false);
        return;
      }

      try {
        await syncUserWithBackend(firebaseUser);
      } catch (err) {
        console.warn("Backend sync skipped (backend may not be running yet):", err);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return syncUserWithBackend(credential.user);
  };

  const signup = async (email: string, password: string, displayName: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateFirebaseProfile(credential.user, { displayName });
    }
    return syncUserWithBackend(credential.user);
  };

  const signInWithGoogle = async () => {
    const credential = await signInWithPopup(auth, googleProvider);
    return syncUserWithBackend(credential.user);
  };

  const updateUserProfile = async (input: ProfileInput) => {
    if (!auth.currentUser) {
      throw new Error("No authenticated user");
    }

    await updateFirebaseProfile(auth.currentUser, { displayName: input.displayName });
    const payload = await requestWithToken(auth.currentUser, "/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    const updated = readProfile(payload);
    setUser(auth.currentUser);
    setProfile(updated);
    return updated;
  };

  const refreshProfile = async () => {
    if (!auth.currentUser) return null;
    return refreshProfileForUser(auth.currentUser);
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, signup, signInWithGoogle, updateUserProfile, refreshProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
