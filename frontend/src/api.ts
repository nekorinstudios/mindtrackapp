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
  await AsyncStorage.setItem("access_token", token);
}
export async function clearToken() {
  await AsyncStorage.removeItem("access_token");
}
export async function getToken() {
  return AsyncStorage.getItem("access_token");
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
  bg: "#FBF9F6",
  bg2: "#FFFFFF",
  bg3: "#F2EBE5",
  text: "#2D3328",
  text2: "#5C6656",
  text3: "#8A9483",
  brand: "#9EAB97",
  brand2: "#C27B66",
  accent: "#E3A387",
  border: "#E8E3DD",
  e_green: "#658D5D",
  e_yellow: "#DDB75A",
  e_orange: "#D08955",
  e_red: "#B75D53",
  e_black: "#2A2A2A",
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
