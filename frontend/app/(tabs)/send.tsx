import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, COLORS, formatApiError } from "../../src/api";

const DAYS = [7, 14, 30, 60];

export default function Send() {
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(30);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const send = async () => {
    if (!email.includes("@")) {
      Alert.alert("Invalid email", "Please enter a valid doctor email.");
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post("/reports/send", { doctor_email: email.trim(), days });
      setLastResult(data);
    } catch (e: any) {
      Alert.alert("Send failed", formatApiError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.h1}>Send to doctor</Text>
          <Text style={styles.sub}>
            Share your symptom & energy report for professional review.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Doctor's email</Text>
            <TextInput
              testID="send-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="doctor@clinic.com"
              placeholderTextColor={COLORS.text3}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Date range</Text>
            <View style={styles.pillRow}>
              {DAYS.map((d) => (
                <TouchableOpacity
                  key={d}
                  testID={`send-days-${d}`}
                  onPress={() => setDays(d)}
                  style={[
                    styles.pill,
                    days === d && { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
                  ]}
                >
                  <Text style={[styles.pillText, days === d && { color: "#fff" }]}>Last {d} days</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              testID="send-submit-btn"
              style={styles.btn}
              onPress={send}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color="#fff" />
                  <Text style={styles.btnText}>Send report</Text>
                </>
              )}
            </TouchableOpacity>

            {lastResult ? (
              <View style={styles.result}>
                <Text style={styles.resultTitle}>Report queued</Text>
                <Text style={styles.resultText}>
                  Sent to {lastResult.doctor_email} · {lastResult.symptom_entries} symptom
                  entries, {lastResult.energy_entries} energy entries included.
                </Text>
                {lastResult.note ? <Text style={styles.resultNote}>{lastResult.note}</Text> : null}
              </View>
            ) : null}
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.brand} />
            <Text style={styles.infoText}>
              Your data remains private. Only the report you send is shared with the email you choose.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  h1: { fontSize: 28, fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.text2, marginTop: 6 },
  card: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
  },
  label: { color: COLORS.text2, fontWeight: "700", fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg2,
  },
  pillText: { color: COLORS.text, fontWeight: "700" },
  btn: {
    backgroundColor: COLORS.brand,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { color: "#fff", fontWeight: "700" },
  result: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.bg3,
  },
  resultTitle: { fontWeight: "800", color: COLORS.text },
  resultText: { color: COLORS.text2, marginTop: 4 },
  resultNote: { color: COLORS.brand2, fontSize: 12, marginTop: 6, fontWeight: "700" },
  infoCard: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
    padding: 14,
    backgroundColor: COLORS.bg2,
    borderRadius: 14,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  infoText: { flex: 1, color: COLORS.text2, fontSize: 13, lineHeight: 18 },
});
