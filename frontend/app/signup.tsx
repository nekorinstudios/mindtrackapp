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
  ActivityIndicator,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { COLORS, formatApiError } from "../src/api";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const { register, googleLogin } = useAuth();
  const router = useRouter();

  const onSubmit = async () => {
    setError("");
    if (!email || !username || !password) {
      setError("Fill in email, username and password");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), username.trim(), password, name.trim() || undefined);
      router.replace("/onboarding");
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
        const m = result.url.match(/session_id=([^&#]+)/);
        if (!m) throw new Error("No session_id in redirect URL");
        const sid = decodeURIComponent(m[1]);
        const u = await googleLogin(sid);
        if (!u.disorders || u.disorders.length === 0) router.replace("/onboarding");
        else router.replace("/(tabs)/home");
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
            testID="signup-back-btn"
            style={styles.back}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>
            Start tracking your daily symptoms and energy.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="signup-email-input"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor={COLORS.text3}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              testID="signup-username-input"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              placeholder="e.g. jordan"
              placeholderTextColor={COLORS.text3}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Display name (optional)</Text>
            <TextInput
              testID="signup-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Jordan"
              placeholderTextColor={COLORS.text3}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="signup-password-input"
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={COLORS.text3}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            testID="signup-submit-btn"
            style={styles.primary}
            onPress={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>Create account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/login")} style={styles.swap}>
            <Text style={styles.swapText}>
              Already registered? <Text style={{ color: COLORS.brand, fontWeight: "700" }}>Sign in</Text>
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
    backgroundColor: "#0B0B0B",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
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
