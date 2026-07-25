import { supabase } from "./supabase";

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  job_role: string;
  email: string | null;
};

const AUTH_KEY = "kaapro_auth_user";

export async function login(username: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase
    .from("recruiters")
    .select("id, name, username, job_role, email")
    .eq("username", username.toLowerCase().trim())
    .eq("password", password)
    .eq("can_login", true)
    .eq("active", true)
    .single();

  if (error || !data) throw new Error("Invalid username or password");

  const user: AuthUser = {
    id: data.id,
    name: data.name,
    username: data.username,
    job_role: data.job_role,
    email: data.email,
  };

  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
  window.location.href = "/login";
}

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getCurrentUser() !== null;
}
