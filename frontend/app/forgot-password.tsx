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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, COLORS, formatApiError } from "../src/api";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "reset">("email");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const sendCode = async () => {
    setError("");
    setInfo("");
    if (!email.trim()) return setError("Enter your account email");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setInfo("If that email exists, a 6-digit code is on its way. Check your inbox.");
      setStep("reset");
    } catch (e: any) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    setError("");
    if (!code.trim()) return setError("Enter the 6-digit code from the email");
    if (newPassword.length < 6) return setError("Password must be at least 6 characters");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        token: code.trim(),
        new_password: newPassword,
      });
      setInfo("Password reset! Sign in with your new password.");
      setTimeout(() => router.replace("/login"), 800);
    } catch (e: any) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="chevron-back" size={18} color={COLORS.text2} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Forgot your password?</Text>
          <Text style={styles.sub}>
            {step === "email"
              ? "Enter the email on your account and we'll send a 6-digit reset code."
              : "Enter the 6-digit code from your email and a new password."}
          </Text>

          {step === "email" ? (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  testID="forgot-email-input"
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={COLORS.text3}
                />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {info ? <Text style={styles.info}>{info}</Text> : null}
              <TouchableOpacity
                testID="forgot-send-btn"
                style={styles.primary}
                onPress={sendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>Send reset code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>6-digit code</Text>
                <TextInput
                  testID="reset-code-input"
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={COLORS.text3}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>New password</Text>
                <TextInput
                  testID="reset-pw-input"
                  style={styles.input}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.text3}
                />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {info ? <Text style={styles.info}>{info}</Text> : null}
              <TouchableOpacity
                testID="reset-submit-btn"
                style={styles.primary}
                onPress={reset}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>Reset password</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setStep("email");
                  setCode("");
                  setNewPassword("");
                  setInfo("");
                }}
                style={{ alignItems: "center", marginTop: 14 }}
              >
                <Text style={styles.linkText}>Resend code to a different email</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 22, paddingBottom: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  backText: { color: COLORS.text2, fontSize: 15 },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.text, marginTop: 8 },
  sub: { color: COLORS.text2, fontSize: 14, marginTop: 6, marginBottom: 22 },
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
  info: { color: COLORS.brand, marginVertical: 6, fontWeight: "600" },
  primary: {
    backgroundColor: "#0B0B0B",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  linkText: { color: COLORS.brand, fontSize: 13, fontWeight: "700" },
});
