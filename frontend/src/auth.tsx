import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveToken, clearToken, getToken } from "./api";

export type User = {
  user_id: string;
  email: string;
  username: string;
  name?: string | null;
  picture?: string | null;
  disorders: string[];
  role: string;
};

type AuthCtx = {
  user: User | null | undefined; // undefined = loading
  login: (identifier: string, password: string) => Promise<User>;
  register: (
    email: string,
    username: string,
    password: string,
    name?: string
  ) => Promise<User>;
  googleLogin: (session_id: string) => Promise<User>;
  updateDisorders: (disorders: string[]) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const { data } = await api.get<User>("/auth/me");
      setUser(data);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (identifier: string, password: string) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    await saveToken(data.access_token);
    setUser(data.user);
    return data.user as User;
  };
  const register = async (
    email: string,
    username: string,
    password: string,
    name?: string
  ) => {
    const { data } = await api.post("/auth/register", {
      email,
      username,
      password,
      name,
    });
    await saveToken(data.access_token);
    setUser(data.user);
    return data.user as User;
  };
  const googleLogin = async (session_id: string) => {
    const { data } = await api.post("/auth/google", { session_id });
    await saveToken(data.access_token);
    setUser(data.user);
    return data.user as User;
  };
  const updateDisorders = async (disorders: string[]) => {
    const { data } = await api.post<User>("/auth/disorders", { disorders });
    setUser(data);
    return data;
  };
  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, register, googleLogin, updateDisorders, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
