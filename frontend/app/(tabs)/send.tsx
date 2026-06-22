import React, { useCallback, useEffect, useState } from "react";
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

type Doctor = { doctor_id: string; name: string; email: string };

export default function Send() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(30);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [saveDoctor, setSaveDoctor] = useState(true);

  const loadDoctors = useCallback(async () => {
    try {
      const { data } = await api.get<Doctor[]>("/doctors");
      setDoctors(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const pickSaved = (d: Doctor) => {
    setName(d.name);
    setEmail(d.email);
  };

  const removeDoctor = async (doctor_id: string) => {
    try {
      await api.delete(`/doctors/${doctor_id}`);
      await loadDoctors();
    } catch {}
  };

  const send = async () => {
    if (!email.includes("@")) {
      Alert.alert("Invalid email", "Please enter a valid doctor email.");
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post("/reports/send", {
        doctor_email: email.trim(),
        days,
      });
      setLastResult(data);
      if (saveDoctor && name.trim()) {
        try {
          await api.post("/doctors", { name: name.trim(), email: email.trim() });
          await loadDoctors();
        } catch {}
      }
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

          {doctors.length > 0 && (
            <View style={styles.savedWrap}>
              <Text style={styles.savedLabel}>Saved doctors</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                  {doctors.map((d) => (
                    <View key={d.doctor_id} style={styles.savedChip}>
                      <TouchableOpacity
                        onPress={() => pickSaved(d)}
                        testID={`saved-doctor-${d.doctor_id}`}
                      >
                        <Text style={styles.savedChipName}>{d.name}</Text>
                        <Text style={styles.savedChipEmail}>{d.email}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => removeDoctor(d.doctor_id)}
                        style={styles.savedChipDelete}
                        testID={`delete-doctor-${d.doctor_id}`}
                      >
                        <Ionicons name="close" size={14} color={COLORS.text3} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.label}>Doctor's name</Text>
            <TextInput
              testID="send-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Dr. Smith"
              placeholderTextColor={COLORS.text3}
              autoCapitalize="words"
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Doctor's email</Text>
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

            <TouchableOpacity
              testID="save-doctor-toggle"
              onPress={() => setSaveDoctor((v) => !v)}
              style={styles.saveToggle}
            >
              <Ionicons
                name={saveDoctor ? "checkbox" : "square-outline"}
                size={20}
                color={saveDoctor ? COLORS.brand : COLORS.text3}
              />
              <Text style={styles.saveToggleText}>
                Save this doctor for future reports
              </Text>
            </TouchableOpacity>

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
                  <Text style={[styles.pillText, days === d && { color: "#0B0B0B" }]}>Last {d} days</Text>
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
                <ActivityIndicator color="#0B0B0B" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color="#0B0B0B" />
                  <Text style={styles.btnText}>Send report</Text>
                </>
              )}
            </TouchableOpacity>

            {lastResult ? (
              <View style={styles.result}>
                <Text style={styles.resultTitle}>
                  {lastResult.status === "sent"
                    ? "Report sent ✓"
                    : lastResult.status === "not_configured"
                    ? "Report saved (email off)"
                    : "Report queued"}
                </Text>
                <Text style={styles.resultText}>
                  Sent to {lastResult.doctor_email} · {lastResult.symptom_entries} symptoms,
                  {" "}{lastResult.energy_entries} energy, {lastResult.medicine_entries ?? 0} meds,
                  {" "}{lastResult.journal_entries ?? 0} journal entries.
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
  btnText: { color: "#0B0B0B", fontWeight: "700" },
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
  savedWrap: { marginBottom: 12 },
  savedLabel: { color: COLORS.text2, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  savedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  savedChipName: { color: COLORS.text, fontWeight: "700", fontSize: 13 },
  savedChipEmail: { color: COLORS.text3, fontSize: 11, marginTop: 2 },
  savedChipDelete: { padding: 4 },
  saveToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  saveToggleText: { color: COLORS.text2, fontSize: 13 },
});
