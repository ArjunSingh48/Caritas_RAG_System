// Mock auth — frontend only, hardcoded credentials. NOT for production.

export type Role = "super-admin" | "admin" | "user";

export interface AuthUser {
  email: string;
  role: Role;
  region?: string;
  hasOnboarded?: boolean;
  name?: string;
  location?: string;
  branch?: string;
  department?: string;
  jobRole?: string;
  context?: string;
}

interface MockAccount {
  email: string;
  password: string;
  role: Role;
  region?: string;
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  { email: "superadmin1@test.com", password: "Password123", role: "super-admin" },
  { email: "admin1@test.com", password: "Password123", role: "admin", region: "Americas" },
  { email: "admin2@test.com", password: "Password123", role: "admin", region: "Europe" },
  { email: "admin3@test.com", password: "Password123", role: "admin", region: "Africa" },
  { email: "admin4@test.com", password: "Password123", role: "admin", region: "Asia" },
  { email: "admin5@test.com", password: "Password123", role: "admin", region: "Middle East" },
  { email: "admin6@test.com", password: "Password123", role: "admin", region: "Oceanics" },
  ...Array.from({ length: 10 }, (_, i) => ({
    email: `user${i + 1}@test.com`,
    password: "Password123",
    role: "user" as Role,
  })),
];

const STORAGE_KEY = "caritas_auth_user";
const SIGNUP_KEY = "caritas_signups";

interface SignupRecord {
  email: string;
  password: string;
}

function getSignups(): SignupRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SIGNUP_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSignups(list: SignupRecord[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(SIGNUP_KEY, JSON.stringify(list));
  }
}

export type SignupResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

export function signupMock(email: string, password: string): SignupResult {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !password) return { ok: false, error: "Email and password are required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "Please enter a valid email address" };
  }
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters" };
  }
  const existsInMock = MOCK_ACCOUNTS.some((a) => a.email.toLowerCase() === trimmed);
  const signups = getSignups();
  const existsInSignups = signups.some((s) => s.email.toLowerCase() === trimmed);
  if (existsInMock || existsInSignups) {
    return { ok: false, error: "An account with this email already exists" };
  }
  signups.push({ email: trimmed, password });
  saveSignups(signups);
  const user: AuthUser = { email: trimmed, role: "user", hasOnboarded: false };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }
  return { ok: true, user };
}

export function loginMock(email: string, password: string): AuthUser | null {
  const normalized = email.trim().toLowerCase();

  // 1. Check hardcoded mock accounts
  const account = MOCK_ACCOUNTS.find(
    (a) => a.email.toLowerCase() === normalized && a.password === password
  );

  // 2. Check signed-up accounts
  const signup = !account
    ? getSignups().find((s) => s.email.toLowerCase() === normalized && s.password === password)
    : null;

  if (!account && !signup) return null;

  const email_ = account?.email ?? signup!.email;
  const role: Role = account?.role ?? "user";
  const region = account?.region;

  const onboardedKey = `caritas_onboarded_${email_}`;
  const profileKey = `caritas_profile_${email_}`;
  const hasOnboarded =
    typeof window !== "undefined" && localStorage.getItem(onboardedKey) === "true";

  let savedProfile: Partial<AuthUser> = {};
  if (typeof window !== "undefined") {
    try {
      savedProfile = JSON.parse(localStorage.getItem(profileKey) || "{}");
    } catch {
      savedProfile = {};
    }
  }

  const user: AuthUser = { email: email_, role, region, hasOnboarded, ...savedProfile };

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }
  return user;
}

export function logoutMock() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function getCurrentUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

const PROFILE_FIELDS: (keyof AuthUser)[] = [
  "name",
  "location",
  "branch",
  "department",
  "jobRole",
  "context",
];

function persistProfile(user: AuthUser) {
  const profile: Partial<AuthUser> = {};
  for (const f of PROFILE_FIELDS) {
    if (user[f] !== undefined) (profile as Record<string, unknown>)[f] = user[f];
  }
  localStorage.setItem(`caritas_profile_${user.email}`, JSON.stringify(profile));
}

export function updateProfile(extra: Partial<AuthUser>): AuthUser | null {
  const user = getCurrentUser();
  if (!user) return null;
  const updated: AuthUser = { ...user, ...extra };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  persistProfile(updated);
  return updated;
}

export function markOnboarded(extra?: Partial<AuthUser>) {
  const user = getCurrentUser();
  if (!user) return;
  const updated: AuthUser = { ...user, ...extra, hasOnboarded: true };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  localStorage.setItem(`caritas_onboarded_${user.email}`, "true");
  persistProfile(updated);
}

export function destinationForRole(user: AuthUser): string {
  if (user.role === "super-admin") return "/super-admin";
  if (user.role === "admin") return "/admin";
  return user.hasOnboarded ? "/chat" : "/onboarding";
}
