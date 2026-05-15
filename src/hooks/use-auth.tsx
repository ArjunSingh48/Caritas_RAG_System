import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  type AuthUser,
  getCurrentUser,
  loginMock,
  logoutMock,
  markOnboarded,
  signupMock,
  updateProfile as updateProfileMock,
  type SignupResult,
} from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => AuthUser | null;
  signup: (email: string, password: string) => SignupResult;
  logout: () => void;
  completeOnboarding: (extra?: Partial<AuthUser>) => void;
  updateProfile: (extra: Partial<AuthUser>) => AuthUser | null;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const login = (email: string, password: string) => {
    const u = loginMock(email, password);
    setUser(u);
    return u;
  };

  const signup = (email: string, password: string) => {
    const result = signupMock(email, password);
    if (result.ok) setUser(result.user);
    return result;
  };

  const logout = () => {
    logoutMock();
    setUser(null);
  };

  const completeOnboarding = (extra?: Partial<AuthUser>) => {
    markOnboarded(extra);
    setUser(getCurrentUser());
  };

  const updateProfile = (extra: Partial<AuthUser>) => {
    const updated = updateProfileMock(extra);
    if (updated) setUser(updated);
    return updated;
  };

  const refresh = () => setUser(getCurrentUser());

  return (
    <AuthContext.Provider
      value={{ user, login, signup, logout, completeOnboarding, updateProfile, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
