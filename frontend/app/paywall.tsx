import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, COLORS, formatApiError } from "../src/api";
import { useAuth } from "../src/auth";

type Status = {
  subscription_status: string | null;
  trial_end: string | null;
  has_access: boolean;
  price_usd: string;
  trial_days: number;
};

export default function Paywall() {
  const { user, refresh, logout } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [going, setGoing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Status>("/billing/status");
      setStatus(data);
      if (data.has_access) {
        router.replace("/(tabs)/home");
      }
    } catch (e: any) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const startCheckout = async () => {
    setGoing(true);
    try {
      const { data } = await api.post("/billing/checkout");
      const url = data.checkout_url as string;
      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        await Linking.openURL(url);
      }
    } catch (e: any) {
      Alert.alert("Couldn't start checkout", formatApiError(e));
    } finally {
      setGoing(false);
    }
  };

  const refreshStatus = async () => {
    setLoading(true);
    await refresh();
    await load();
  };

  if (loading || !status) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  const sub = status.subscription_status || "expired";
  const isTrial = sub === "trialing";
  const trialEndDate = status.trial_end ? new Date(status.trial_end) : null;
  const daysLeft =
    trialEndDate
      ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Image
          source={require("../assets/mindtrack-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>
          {isTrial ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your free trial` : "Subscribe to continue"}
        </Text>
        <Text style={styles.sub}>
          {isTrial
            ? "Enjoy full access. Add a payment method any time to keep your data flowing after the trial ends."
            : "Your free trial has ended. Subscribe to keep tracking your wellness."}
        </Text>

        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center" }}>
            <Text style={styles.price}>${status.price_usd}</Text>
            <Text style={styles.per}> / month</Text>
          </View>
          <Text style={styles.trialNote}>
            {status.trial_days}-day free trial · cancel any time
          </Text>

          <View style={styles.bullets}>
            <Bullet text="Daily symptom & energy tracking" />
            <Bullet text="Medicine logging & reminders" />
            <Bullet text="Charts to spot patterns" />
            <Bullet text="Rewards for consistency" />
            <Bullet text="Send reports to your doctor" />
          </View>

          <TouchableOpacity
            testID="paywall-checkout-btn"
            style={styles.cta}
            onPress={startCheckout}
            disabled={going}
          >
            {going ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="lock-open-outline" size={16} color="#FFFFFF" />
                <Text style={styles.ctaText}>
                  {isTrial ? "Add payment method" : "Subscribe — $1.99/mo"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {isTrial && (
            <TouchableOpacity
              testID="paywall-continue-trial-btn"
              style={styles.secondary}
              onPress={() => router.replace("/(tabs)/home")}
            >
              <Text style={styles.secondaryText}>Continue using trial</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            testID="paywall-refresh-btn"
            style={styles.refresh}
            onPress={refreshStatus}
          >
            <Ionicons name="refresh-outline" size={14} color={COLORS.text2} />
            <Text style={styles.refreshText}>I just paid — refresh</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={async () => { await logout(); router.replace("/"); }} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons name="checkmark-circle" size={18} color={COLORS.brand} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  content: { flex: 1, padding: 22, alignItems: "center" },
  logo: { width: 220, height: 220, marginTop: 8 },
  title: { fontSize: 24, fontWeight: "800", color: COLORS.text, textAlign: "center", marginTop: 8 },
  sub: { color: COLORS.text2, textAlign: "center", marginTop: 8, fontSize: 14, lineHeight: 20, paddingHorizontal: 8 },
  card: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    marginTop: 22,
    width: "100%",
    maxWidth: 440,
  },
  price: { color: COLORS.text, fontSize: 44, fontWeight: "800" },
  per: { color: COLORS.text2, fontSize: 16, fontWeight: "700" },
  trialNote: { color: COLORS.brand, textAlign: "center", fontWeight: "700", marginTop: 4 },
  bullets: { marginTop: 18, gap: 10 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletText: { color: COLORS.text, fontSize: 15 },
  cta: {
    backgroundColor: "#0B0B0B",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 22,
  },
  ctaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  secondary: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 10,
  },
  secondaryText: { color: COLORS.text, fontWeight: "700", fontSize: 14 },
  refresh: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 14 },
  refreshText: { color: COLORS.text2, fontSize: 13 },
  signOut: { marginTop: "auto", padding: 12 },
  signOutText: { color: COLORS.text3, fontSize: 13 },
});
