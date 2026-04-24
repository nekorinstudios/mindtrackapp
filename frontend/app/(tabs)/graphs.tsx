import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { api, COLORS, energyColor } from "../../src/api";

type EnergyLog = { percent: number; created_at: string };
type SymLog = { symptoms: string[]; created_at: string };

export default function Graphs() {
  const [energy, setEnergy] = useState<EnergyLog[]>([]);
  const [symptoms, setSymptoms] = useState<SymLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([
        api.get<EnergyLog[]>("/energy/logs?days=30"),
        api.get<SymLog[]>("/symptoms/logs?days=30"),
      ]);
      setEnergy(e.data.reverse()); // oldest first
      setSymptoms(s.data.reverse());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of symptoms) {
      for (const s of l.symptoms) m[s] = (m[s] || 0) + 1;
    }
    const arr = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return arr;
  }, [symptoms]);

  const daysSymptoms = useMemo(() => {
    // group by day (last 14 days)
    const map: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      map[k] = 0;
    }
    for (const l of symptoms) {
      const k = l.created_at.slice(0, 10);
      if (k in map) map[k] += l.symptoms.length;
    }
    return Object.entries(map);
  }, [symptoms]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  const w = Dimensions.get("window").width - 40;
  const chartH = 180;

  // Energy sparkline
  const ePts = energy.slice(-30);
  const eMaxIdx = Math.max(1, ePts.length - 1);
  const ePath = ePts
    .map((p, i) => {
      const x = (i / eMaxIdx) * w;
      const y = chartH - (p.percent / 100) * chartH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Symptoms bar chart
  const barMax = Math.max(1, ...daysSymptoms.map((d) => d[1]));
  const barW = (w - 20) / daysSymptoms.length - 4;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Trends</Text>
        <Text style={styles.sub}>Your last 30 days at a glance.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Energy over time</Text>
          {ePts.length < 2 ? (
            <Text style={styles.empty}>Log more energy readings to see trends.</Text>
          ) : (
            <View>
              <Svg width={w} height={chartH + 20}>
                {[0, 30, 40, 50, 89, 100].map((y, i) => (
                  <Line
                    key={i}
                    x1={0}
                    x2={w}
                    y1={chartH - (y / 100) * chartH}
                    y2={chartH - (y / 100) * chartH}
                    stroke={COLORS.border}
                    strokeDasharray="3,4"
                  />
                ))}
                <Path d={ePath} stroke={COLORS.brand} strokeWidth={2} fill="none" />
                {ePts.map((p, i) => {
                  const x = (i / eMaxIdx) * w;
                  const y = chartH - (p.percent / 100) * chartH;
                  return (
                    <Circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={3.5}
                      fill={energyColor(p.percent)}
                    />
                  );
                })}
              </Svg>
              <View style={styles.legend}>
                {[
                  { c: COLORS.e_green, l: "90-100" },
                  { c: COLORS.e_yellow, l: "51-89" },
                  { c: COLORS.e_orange, l: "41-50" },
                  { c: COLORS.e_red, l: "31-40" },
                  { c: COLORS.e_black, l: "1-30" },
                ].map((b) => (
                  <View key={b.l} style={styles.legItem}>
                    <View style={[styles.legDot, { backgroundColor: b.c }]} />
                    <Text style={styles.legTxt}>{b.l}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Symptom frequency (14 days)</Text>
          {daysSymptoms.every((d) => d[1] === 0) ? (
            <Text style={styles.empty}>No symptom logs yet.</Text>
          ) : (
            <Svg width={w} height={chartH + 20}>
              {daysSymptoms.map(([k, v], i) => {
                const x = 10 + i * (barW + 4);
                const h = (v / barMax) * chartH;
                const y = chartH - h;
                return (
                  <Rect
                    key={k}
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={4}
                    fill={COLORS.brand}
                    opacity={0.85}
                  />
                );
              })}
            </Svg>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top symptoms</Text>
          {counts.length === 0 ? (
            <Text style={styles.empty}>No symptom logs yet.</Text>
          ) : (
            counts.map(([s, c]) => (
              <View key={s} style={styles.topRow}>
                <Text style={styles.topName}>{s}</Text>
                <View style={styles.topBarWrap}>
                  <View
                    style={[
                      styles.topBar,
                      { width: `${Math.min(100, (c / (counts[0][1] || 1)) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.topNum}>{c}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  h1: { fontSize: 28, fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.text2, marginTop: 6 },
  card: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginBottom: 10 },
  empty: { color: COLORS.text3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  legItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legDot: { width: 10, height: 10, borderRadius: 5 },
  legTxt: { color: COLORS.text2, fontSize: 11, fontWeight: "600" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  topName: { width: 140, color: COLORS.text, fontWeight: "600", fontSize: 13 },
  topBarWrap: { flex: 1, height: 10, backgroundColor: COLORS.bg3, borderRadius: 99, overflow: "hidden" },
  topBar: { height: "100%", backgroundColor: COLORS.brand2 },
  topNum: { width: 28, textAlign: "right", color: COLORS.text2, fontWeight: "700" },
});
