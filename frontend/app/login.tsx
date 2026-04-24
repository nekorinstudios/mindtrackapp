import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { COLORS, formatApiError } from "../src/api";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, googleLogin } = useAuth();
  const router = useRouter();

  const onLogin = async () => {
    setError("");
    if (!identifier || !password) {
      setError("Enter your email/username and password");
      return;
    }
    setLoading(true);
    try {
      const u = await login(identifier.trim(), password);
      if (!u.disorders || u.disorders.length === 0) router.replace("/onboarding");
      else router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const onGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const appUrl = process.env.EXPO_PUBLIC_BACKEND_URL as string;
      const redirectUrl = `${appUrl}/auth-callback`;
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(
        redirectUrl
      )}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === "success" && result.url) {
        // URL contains #session_id=XYZ
        const m = result.url.match(/session_id=([^&#]+)/);
        if (!m) throw new Error("No session_id in redirect URL");
        const sid = decodeURIComponent(m[1]);
        const u = await googleLogin(sid);
        if (!u.disorders || u.disorders.length === 0) router.replace("/onboarding");
        else router.replace("/(tabs)/home");
      } else if (result.type === "cancel" || result.type === "dismiss") {
        // user cancelled
      } else {
        throw new Error("Google login failed");
      }
    } catch (e: any) {
      setError(formatApiError(e));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => router.back()}
            testID="login-back-btn"
            style={styles.back}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.sub}>Sign in to continue your tracking.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email or Username</Text>
            <TextInput
              testID="login-identifier-input"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="you@email.com or username"
              placeholderTextColor={COLORS.text3}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={COLORS.text3}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            testID="login-submit-btn"
            style={styles.primary}
            onPress={onLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.line} />
          </View>

          <TouchableOpacity
            testID="login-google-btn"
            style={styles.google}
            onPress={onGoogle}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.googleText}>Continue with Google</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/signup")} style={styles.swap}>
            <Text style={styles.swapText}>
              No account yet? <Text style={{ color: COLORS.brand, fontWeight: "700" }}>Sign up</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 24, paddingBottom: 48 },
  back: { marginBottom: 8 },
  backText: { color: COLORS.text2, fontSize: 15 },
  title: { fontSize: 30, fontWeight: "800", color: COLORS.text, marginTop: 16 },
  sub: { color: COLORS.text2, marginTop: 6, marginBottom: 24, fontSize: 15 },
  field: { marginBottom: 14 },
  label: { color: COLORS.text2, fontSize: 13, marginBottom: 6, fontWeight: "600" },
  input: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  error: { color: "#B75D53", marginVertical: 6 },
  primary: {
    backgroundColor: COLORS.brand,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 22, gap: 8 },
  line: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.text3, fontSize: 13 },
  google: {
    backgroundColor: COLORS.bg2,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  googleText: { color: COLORS.text, fontWeight: "700", fontSize: 16 },
  swap: { marginTop: 20, alignItems: "center" },
  swapText: { color: COLORS.text2, fontSize: 14 },
});
