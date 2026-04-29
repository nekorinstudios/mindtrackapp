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
  bg: "#4F8FF7",
  bg2: "#3B7DE8",
  bg3: "#FCD34D",
  text: "#FFFFFF",
  text2: "#E5EFFE",
  text3: "#BFD7FB",
  brand: "#FACC15",
  brand2: "#60A5FA",
  accent: "#FCD34D",
  border: "#80AEF8",
  e_green: "#22C55E",
  e_yellow: "#FFD93D",
  e_orange: "#FF9D42",
  e_red: "#EF4444",
  e_black: "#0B0B0B",
};

export function energyColor(pct: number) {
  // Smooth gradient: 100=green, ~70=yellow, ~50=orange, 30 and below=red
  // Stops: 30:red, 50:orange, 70:yellow, 100:green
  const stops: { p: number; c: [number, number, number] }[] = [
    { p: 0, c: [239, 68, 68] },
    { p: 30, c: [239, 68, 68] },
    { p: 50, c: [255, 157, 66] },
    { p: 70, c: [255, 217, 61] },
    { p: 100, c: [34, 197, 94] },
  ];
  const v = Math.max(0, Math.min(100, pct));
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (v <= b.p) {
      const t = (v - a.p) / Math.max(1, b.p - a.p);
      const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * t);
      const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * t);
      const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * t);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return "rgb(34,197,94)";
}

export function energyLabel(pct: number) {
  if (pct >= 85) return "Excellent";
  if (pct >= 65) return "Good";
  if (pct >= 45) return "Fair";
  if (pct > 30) return "Low";
  return "Depleted";
}
