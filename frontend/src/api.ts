import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("access_token");
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function saveToken(token: string) {
  try {
    await AsyncStorage.setItem("access_token", token);
  } catch {
    try { (globalThis as any).localStorage?.setItem("access_token", token); } catch {}
  }
}
export async function clearToken() {
  try {
    await AsyncStorage.removeItem("access_token");
  } catch {}
  try { (globalThis as any).localStorage?.removeItem("access_token"); } catch {}
}
export async function getToken() {
  try {
    const t = await AsyncStorage.getItem("access_token");
    if (t) return t;
  } catch {}
  try {
    return (globalThis as any).localStorage?.getItem("access_token") ?? null;
  } catch {
    return null;
  }
}

export function formatApiError(err: any): string {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d
      .map((e: any) => (e?.msg ? String(e.msg) : JSON.stringify(e)))
      .join(" ");
  if (typeof d === "object" && d.msg) return String(d.msg);
  return String(d);
}

export const COLORS = {
  bg: "#FFFFFF",
  bg2: "#FFFFFF",
  bg3: "#FFF8D6",
  text: "#0B0B0B",
  text2: "#1F2937",
  text3: "#5B6470",
  brand: "#1D4ED8",
  brand2: "#FACC15",
  accent: "#FFD60A",
  border: "#DDE6F2",
  e_green: "#3BD16F",
  e_yellow: "#FFD93D",
  e_orange: "#FF9D42",
  e_red: "#FF4E4E",
  e_black: "#0B0B0B",
};

export function energyColor(pct: number) {
  if (pct >= 90) return COLORS.e_green;
  if (pct >= 51) return COLORS.e_yellow;
  if (pct >= 41) return COLORS.e_orange;
  if (pct >= 31) return COLORS.e_red;
  return COLORS.e_black;
}

export function energyLabel(pct: number) {
  if (pct >= 90) return "Excellent";
  if (pct >= 51) return "Good";
  if (pct >= 41) return "Fair";
  if (pct >= 31) return "Low";
  return "Depleted";
}
