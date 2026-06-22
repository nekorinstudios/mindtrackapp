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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, COLORS, formatApiError } from "../src/api";
import { useAuth } from "../src/auth";

export default function ClaimPrize() {
  const router = useRouter();
  const { user } = useAuth();
  const { option_id } = useLocalSearchParams<{ option_id?: string }>();
  const initialName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    user?.name ||
    "";
  const [fullName, setFullName] = useState(initialName);
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!option_id) {
      setError("No prize option selected. Go back and pick one.");
      return;
    }
    if (!fullName.trim()) return setError("Please enter your full name");
    if (!address.trim()) return setError("Please enter your shipping address");
    if (!email.trim()) return setError("Please enter your email");
    if (!phone.trim()) return setError("Please enter your phone number");
    setSubmitting(true);
    try {
      await api.post("/awards/claim", {
        option_id,
        full_name: fullName.trim(),
        address: address.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      Alert.alert(
        "Prize claimed!",
        "Your prize is on the way. We'll mail it to the address you provided. You can now pick a new prize!",
        [
          {
            text: "OK",
            onPress: () => router.replace("/(tabs)/rewards"),
          },
        ],
      );
    } catch (e: any) {
      setError(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            testID="claim-back-btn"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={18} color={COLORS.text2} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Claim your prize</Text>
          <Text style={styles.sub}>
            Tell us where to send it. We'll usually mail it within a few weeks.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              testID="claim-name-input"
              style={styles.input}
              autoCapitalize="words"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Jordan Lee"
              placeholderTextColor={COLORS.text3}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Shipping address</Text>
            <TextInput
              testID="claim-address-input"
              style={[styles.input, { height: 96, textAlignVertical: "top" }]}
              multiline
              value={address}
              onChangeText={setAddress}
              placeholder={"123 Main St\nApt 4B\nCity, State, ZIP\nCountry"}
              placeholderTextColor={COLORS.text3}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="claim-email-input"
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

          <View style={styles.field}>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              testID="claim-phone-input"
              style={styles.input}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 555-123-4567"
              placeholderTextColor={COLORS.text3}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            testID="claim-submit-btn"
            style={styles.primary}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="gift" size={16} color="#FFFFFF" />
                <Text style={styles.primaryText}>Submit claim</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.privacy}>
            Your details are shared only with the admin who fulfills your prize.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  backText: { color: COLORS.text2, fontSize: 15 },
  emoji: { fontSize: 40, marginTop: 6, textAlign: "center" },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text, marginTop: 6, textAlign: "center" },
  sub: { color: COLORS.text2, fontSize: 14, textAlign: "center", marginTop: 6, marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { color: COLORS.text2, fontSize: 13, marginBottom: 6, fontWeight: "600" },
  input: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
  },
  error: { color: "#B75D53", marginVertical: 6 },
  primary: {
    backgroundColor: "#0B0B0B",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  privacy: { color: COLORS.text3, fontSize: 12, marginTop: 14, textAlign: "center" },
});
