import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { api, COLORS, formatApiError } from "../src/api";

type Mode = "menu" | "pick" | "test";
const ALL: ("ADHD" | "Bipolar" | "Autism")[] = ["ADHD", "Bipolar", "Autism"];

export default function Onboarding() {
  const { user, updateDisorders, logout } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("menu");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // test state
  const [questions, setQuestions] = useState<Record<string, string[]>>({});
  const [answers, setAnswers] = useState<Record<string, number[]>>({});

  useEffect(() => {
    api
      .get("/catalog/assessment")
      .then((r) => {
        setQuestions(r.data);
        const init: Record<string, number[]> = {};
        Object.keys(r.data).forEach(
          (k) => (init[k] = new Array(r.data[k].length).fill(0))
        );
        setAnswers(init);
      })
      .catch(() => {});
  }, []);

  const toggle = (d: string) => {
    setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));
  };

  const save = async (list: string[]) => {
    if (list.length === 0) {
      setError("Please select at least one disorder to track.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateDisorders(list as any);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const scoreTest = () => {
    // Each question is 0-3. Threshold 7+ out of 15.
    const res: string[] = [];
    for (const d of ALL) {
      const arr = answers[d] || [];
      const sum = arr.reduce((a, b) => a + b, 0);
      if (sum >= 7) res.push(d);
    }
    return res;
  };

  if (user === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  if (mode === "menu") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Let's personalize your tracker</Text>
          <Text style={styles.sub}>
            Choose the area(s) you want to track, or take a quick self-assessment.
          </Text>
          <View style={{ height: 24 }} />
          <TouchableOpacity
            testID="onboarding-pick-btn"
            style={styles.bigCard}
            onPress={() => setMode("pick")}
          >
            <Text style={styles.cardTitle}>Pick disorders</Text>
            <Text style={styles.cardSub}>
              Select any combination of ADHD, Bipolar, or Autism.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="onboarding-test-btn"
            style={[styles.bigCard, { backgroundColor: COLORS.bg3 }]}
            onPress={() => setMode("test")}
          >
            <Text style={styles.cardTitle}>Take a quick test</Text>
            <Text style={styles.cardSub}>
              15 short questions. We'll suggest what to track. Not a diagnosis.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={logout} style={{ marginTop: 32, alignSelf: "center" }}>
            <Text style={{ color: COLORS.text3 }}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === "pick") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity onPress={() => setMode("menu")}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Pick your disorders</Text>
          <Text style={styles.sub}>Tap one or more. You can change this later.</Text>
          <View style={{ height: 16 }} />
          {ALL.map((d) => {
            const on = selected.includes(d);
            return (
              <TouchableOpacity
                key={d}
                testID={`onboarding-toggle-${d.toLowerCase()}`}
                style={[
                  styles.opt,
                  on && { borderColor: COLORS.brand, backgroundColor: "#EEF3ED" },
                ]}
                onPress={() => toggle(d)}
              >
                <Text style={styles.optText}>{d}</Text>
                <View
                  style={[
                    styles.dot,
                    on && { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
                  ]}
                >
                  {on ? <Text style={{ color: "#fff", fontWeight: "800" }}>✓</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <TouchableOpacity
            testID="onboarding-save-btn"
            style={styles.primary}
            disabled={busy}
            onPress={() => save(selected)}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // test mode
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => setMode("menu")}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Self-assessment</Text>
        <Text style={styles.sub}>
          Rate each 0 (Never) – 3 (Often). This is educational, not a diagnosis.
        </Text>
        {ALL.map((d) => (
          <View key={d} style={{ marginTop: 20 }}>
            <Text style={styles.h3}>{d}</Text>
            {(questions[d] || []).map((q, i) => (
              <View key={`${d}-${i}`} style={styles.qBlock}>
                <Text style={styles.qText}>{q}</Text>
                <View style={styles.rowBtns}>
                  {[0, 1, 2, 3].map((v) => {
                    const sel = (answers[d] || [])[i] === v;
                    return (
                      <TouchableOpacity
                        testID={`q-${d.toLowerCase()}-${i}-${v}`}
                        key={v}
                        style={[styles.pill, sel && styles.pillSel]}
                        onPress={() =>
                          setAnswers((a) => {
                            const next = { ...a };
                            const arr = [...(next[d] || [])];
                            arr[i] = v;
                            next[d] = arr;
                            return next;
                          })
                        }
                      >
                        <Text style={[styles.pillText, sel && { color: "#fff" }]}>{v}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        ))}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        <TouchableOpacity
          testID="onboarding-test-submit"
          style={styles.primary}
          disabled={busy}
          onPress={() => {
            const res = scoreTest();
            if (res.length === 0) {
              setError(
                "Based on your answers we couldn't strongly suggest any. You can still pick manually."
              );
              setMode("pick");
              return;
            }
            save(res);
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>See my results</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 24, paddingBottom: 48 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  backText: { color: COLORS.text2, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.text, marginTop: 8 },
  sub: { color: COLORS.text2, marginTop: 6, fontSize: 15 },
  bigCard: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
  },
  cardTitle: { fontSize: 20, fontWeight: "700", color: COLORS.text },
  cardSub: { color: COLORS.text2, marginTop: 6, fontSize: 14, lineHeight: 20 },
  opt: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg2,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },
  optText: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: COLORS.brand,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  err: { color: "#B75D53", marginTop: 8 },
  h3: { fontSize: 18, fontWeight: "800", color: COLORS.text, marginBottom: 8 },
  qBlock: { marginBottom: 14 },
  qText: { color: COLORS.text, fontSize: 14, marginBottom: 8 },
  rowBtns: { flexDirection: "row", gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg2,
  },
  pillSel: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  pillText: { color: COLORS.text, fontWeight: "700" },
});
