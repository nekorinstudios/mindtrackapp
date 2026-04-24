import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  PanResponder,
  LayoutChangeEvent,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, COLORS, energyColor, energyLabel, formatApiError } from "../../src/api";
import { useAuth } from "../../src/auth";

type SymCatalog = Record<string, string[]>;

export default function Home() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [catalog, setCatalog] = useState<SymCatalog>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [energy, setEnergy] = useState<number>(70);
  const [lastEnergy, setLastEnergy] = useState<{ percent: number; at: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [catRes, eRes] = await Promise.all([
        api.get<SymCatalog>("/catalog/symptoms"),
        api.get("/energy/logs?days=1"),
      ]);
      setCatalog(catRes.data);
      if (eRes.data?.length) {
        setEnergy(eRes.data[0].percent);
        setLastEnergy({ percent: eRes.data[0].percent, at: eRes.data[0].created_at });
      }
    } catch (e: any) {
      if (e?.response?.status === 401) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (s: string) =>
    setSelected((cur) => ({ ...cur, [s]: !cur[s] }));

  const submit = async () => {
    const list = Object.keys(selected).filter((k) => selected[k]);
    if (list.length === 0) {
      Alert.alert("Nothing selected", "Tap any symptoms you're experiencing, then submit.");
      return;
    }
    setSubmitting(true);
    try {
      await Promise.all([
        api.post("/symptoms/log", { symptoms: list }),
        api.post("/energy/log", { percent: energy }),
      ]);
      setSelected({});
      router.push("/(tabs)/rewards");
    } catch (e: any) {
      Alert.alert("Could not log", formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hi}>Hi, {user?.name || user?.username}</Text>
            <Text style={styles.today}>{new Date().toDateString()}</Text>
          </View>
          <TouchableOpacity
            testID="home-logout-btn"
            onPress={logout}
            style={styles.iconBtn}
          >
            <Ionicons name="log-out-outline" size={22} color={COLORS.text2} />
          </TouchableOpacity>
        </View>

        <EnergyMeter
          value={energy}
          onChange={setEnergy}
          onCommit={async (v) => {
            try {
              await api.post("/energy/log", { percent: v });
              setLastEnergy({ percent: v, at: new Date().toISOString() });
            } catch (e: any) {
              Alert.alert("Could not save energy", formatApiError(e));
            }
          }}
          lastEnergy={lastEnergy}
        />

        <View style={{ marginTop: 28 }}>
          <Text style={styles.sectionTitle}>Today's symptoms</Text>
          <Text style={styles.sectionSub}>
            Tap anything you're experiencing right now.
          </Text>
        </View>

        {Object.keys(catalog).length === 0 ? (
          <Text style={styles.sectionSub}>No disorders selected.</Text>
        ) : (
          Object.entries(catalog).map(([disorder, items]) => (
            <View key={disorder} style={styles.group}>
              <Text style={styles.groupTitle}>{disorder}</Text>
              <View style={styles.chips}>
                {items.map((s) => {
                  const on = !!selected[s];
                  return (
                    <TouchableOpacity
                      key={s}
                      testID={`symptom-${s.replace(/\s+/g, "-").toLowerCase()}`}
                      style={[
                        styles.chip,
                        on && { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
                      ]}
                      onPress={() => toggle(s)}
                    >
                      <Text style={[styles.chipText, on && { color: "#fff" }]}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))
        )}

        <TouchableOpacity
          testID="home-submit-btn"
          style={styles.submit}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit check-in</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Energy Meter (vertical touch slider) ----
function EnergyMeter({
  value,
  onChange,
  onCommit,
  lastEnergy,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  lastEnergy: { percent: number; at: string } | null;
}) {
  const heightRef = useRef(220);
  const yTopRef = useRef(0);
  const latestRef = useRef(value);

  const setByY = (pageY: number) => {
    const y = pageY - yTopRef.current;
    const h = heightRef.current;
    const pct = Math.max(0, Math.min(100, Math.round((1 - y / h) * 100)));
    latestRef.current = pct;
    onChange(pct);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setByY(e.nativeEvent.pageY),
      onPanResponderMove: (e) => setByY(e.nativeEvent.pageY),
      onPanResponderRelease: () => onCommit(latestRef.current),
      onPanResponderTerminate: () => onCommit(latestRef.current),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    heightRef.current = e.nativeEvent.layout.height;
  };

  const color = energyColor(value);

  return (
    <View style={styles.meterCard}>
      <Text style={styles.meterTitle}>Energy meter</Text>
      <Text style={styles.meterSub}>
        Drag up or down to set how you feel right now.
      </Text>
      <View style={styles.meterRow}>
        <View
          testID="energy-slider"
          onLayout={onLayout}
          ref={(r: any) => {
            if (r && r.measure) {
              r.measure((_x: number, _y: number, _w: number, _h: number, _px: number, py: number) => {
                yTopRef.current = py;
              });
            }
          }}
          style={styles.meterBar}
          {...pan.panHandlers}
        >
          <View style={[styles.bandBlack, { height: "30%" }]} />
          <View style={[styles.bandRed, { height: "10%" }]} />
          <View style={[styles.bandOrange, { height: "10%" }]} />
          <View style={[styles.bandYellow, { height: "39%" }]} />
          <View style={[styles.bandGreen, { height: "11%" }]} />

          <View
            pointerEvents="none"
            style={[styles.knob, { bottom: `${value}%`, borderColor: color }]}
          >
            <Text style={{ fontWeight: "800", color: COLORS.text }}>{value}%</Text>
          </View>
        </View>

        <View style={styles.meterInfo}>
          <Text style={[styles.meterPct, { color }]}>{value}%</Text>
          <Text style={styles.meterLabel}>{energyLabel(value)}</Text>
          {lastEnergy ? (
            <Text style={styles.meterHint}>
              Last saved: {new Date(lastEnergy.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          ) : (
            <Text style={styles.meterHint}>Release to save.</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hi: { fontSize: 24, fontWeight: "800", color: COLORS.text },
  today: { color: COLORS.text3, marginTop: 2 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  meterCard: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 18,
  },
  meterTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  meterSub: { color: COLORS.text2, marginTop: 4, fontSize: 13 },
  meterRow: { flexDirection: "row", marginTop: 12, alignItems: "stretch" },
  meterBar: {
    width: 56,
    height: 220,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    position: "relative",
  },
  bandBlack: { backgroundColor: COLORS.e_black, width: "100%", position: "absolute", bottom: 0 },
  bandRed: { backgroundColor: COLORS.e_red, width: "100%", position: "absolute", bottom: "30%" },
  bandOrange: { backgroundColor: COLORS.e_orange, width: "100%", position: "absolute", bottom: "40%" },
  bandYellow: { backgroundColor: COLORS.e_yellow, width: "100%", position: "absolute", bottom: "50%" },
  bandGreen: { backgroundColor: COLORS.e_green, width: "100%", position: "absolute", bottom: "89%" },
  knob: {
    position: "absolute",
    alignSelf: "center",
    left: -22,
    marginBottom: -16,
    width: 100,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  meterInfo: { flex: 1, paddingLeft: 18, justifyContent: "center" },
  meterPct: { fontSize: 44, fontWeight: "800", letterSpacing: -1 },
  meterLabel: { color: COLORS.text2, marginTop: 2, fontSize: 15, fontWeight: "700" },
  meterHint: { color: COLORS.text3, marginTop: 10, fontSize: 12 },

  sectionTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sectionSub: { color: COLORS.text2, marginTop: 4 },

  group: { marginTop: 14 },
  groupTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text2, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg2,
    borderRadius: 99,
  },
  chipText: { color: COLORS.text, fontWeight: "600" },

  submit: {
    backgroundColor: COLORS.brand,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
