import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, COLORS, formatApiError } from "../src/api";

type TestQuestion = { text: string };
type TestDef = {
  test_id: "asrs" | "gad7" | "mdq" | "raads14";
  title: string;
  short: string;
  description: string;
  scale: string[];
  type: "scaled" | "mdq" | "raads";
  questions: TestQuestion[];
  extra_q2?: string;
  extra_q3?: string;
  extra_q3_options?: string[];
};
type TestResult = {
  submission_id: string;
  test_id: string;
  score: number;
  max: number;
  category: string;
  interpretation: string;
  created_at: string;
};
type PastResult = {
  submission_id: string;
  test_id: string;
  score: number;
  max_score: number;
  category: string;
  interpretation: string;
  created_at: string;
};

const SHORT_LABEL: Record<string, string> = {
  asrs: "ADHD",
  gad7: "Anxiety",
  mdq: "Bipolar",
  raads14: "AuDHD / Autism",
};

export default function Tests() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Record<string, TestDef>>({});
  const [past, setPast] = useState<PastResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<TestDef | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [q2, setQ2] = useState<boolean | null>(null);
  const [q3, setQ3] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api.get<Record<string, TestDef>>("/tests/catalog"),
        api.get<PastResult[]>("/tests/results"),
      ]);
      setCatalog(c.data);
      setPast(p.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startTest = (t: TestDef) => {
    setActive(t);
    setAnswers(new Array(t.questions.length).fill(-1));
    setQ2(null);
    setQ3(null);
    setResult(null);
  };

  const submit = async () => {
    if (!active) return;
    if (answers.some((a) => a < 0)) {
      Alert.alert("Incomplete", "Please answer every question before submitting.");
      return;
    }
    if (active.type === "mdq") {
      if (q2 === null || q3 === null) {
        Alert.alert("Incomplete", "Please answer the two follow-up questions.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const body: any = { test_id: active.test_id, answers };
      if (active.type === "mdq") body.extra = { q2, q3 };
      const { data } = await api.post<TestResult>("/tests/submit", body);
      setResult(data);
      // Refresh past list
      const p = await api.get<PastResult[]>("/tests/results");
      setPast(p.data);
    } catch (e: any) {
      Alert.alert("Submit failed", formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  // Result screen
  if (active && result) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity onPress={() => { setActive(null); setResult(null); }}>
            <Text style={styles.back}>← Back to tests</Text>
          </TouchableOpacity>
          <Text style={styles.h1}>{active.title}</Text>
          <View style={styles.resultCard}>
            <Text style={styles.resultBig}>
              {result.score}
              <Text style={styles.resultMax}>  / {result.max}</Text>
            </Text>
            <Text style={styles.resultCat}>{result.category}</Text>
            <Text style={styles.resultInterp}>{result.interpretation}</Text>
          </View>
          <Text style={styles.disclaimer}>
            This is a screening tool, not a diagnosis. If your score concerns you, please share it
            with a qualified mental health professional.
          </Text>
          <TouchableOpacity
            testID="test-done-btn"
            style={styles.primary}
            onPress={() => { setActive(null); setResult(null); }}
          >
            <Text style={styles.primaryText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Test taking screen
  if (active) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity onPress={() => setActive(null)}>
            <Text style={styles.back}>← Back to tests</Text>
          </TouchableOpacity>
          <Text style={styles.h1}>{active.title}</Text>
          <Text style={styles.sub}>{active.description}</Text>

          {active.questions.map((q, i) => (
            <View key={i} style={styles.qCard}>
              <Text style={styles.qNum}>Q{i + 1}</Text>
              <Text style={styles.qText}>{q.text}</Text>
              <View style={styles.optCol}>
                {active.scale.map((label, vi) => {
                  const sel = answers[i] === vi;
                  return (
                    <TouchableOpacity
                      key={vi}
                      testID={`test-${active.test_id}-q${i}-${vi}`}
                      style={[styles.opt, sel && styles.optSel]}
                      onPress={() => {
                        const next = [...answers];
                        next[i] = vi;
                        setAnswers(next);
                      }}
                    >
                      <View style={[styles.optDot, sel && styles.optDotSel]} />
                      <Text style={[styles.optText, sel && { color: "#0B0B0B", fontWeight: "800" }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {active.type === "mdq" && (
            <>
              <View style={styles.qCard}>
                <Text style={styles.qNum}>Follow-up 1</Text>
                <Text style={styles.qText}>{active.extra_q2}</Text>
                <View style={styles.optCol}>
                  {[
                    { label: "No", v: false },
                    { label: "Yes", v: true },
                  ].map((o) => {
                    const sel = q2 === o.v;
                    return (
                      <TouchableOpacity
                        key={o.label}
                        testID={`mdq-q2-${o.label.toLowerCase()}`}
                        style={[styles.opt, sel && styles.optSel]}
                        onPress={() => setQ2(o.v)}
                      >
                        <View style={[styles.optDot, sel && styles.optDotSel]} />
                        <Text style={[styles.optText, sel && { color: "#0B0B0B", fontWeight: "800" }]}>
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={styles.qCard}>
                <Text style={styles.qNum}>Follow-up 2</Text>
                <Text style={styles.qText}>{active.extra_q3}</Text>
                <View style={styles.optCol}>
                  {(active.extra_q3_options || []).map((label, vi) => {
                    const sel = q3 === vi;
                    return (
                      <TouchableOpacity
                        key={label}
                        testID={`mdq-q3-${vi}`}
                        style={[styles.opt, sel && styles.optSel]}
                        onPress={() => setQ3(vi)}
                      >
                        <View style={[styles.optDot, sel && styles.optDotSel]} />
                        <Text style={[styles.optText, sel && { color: "#0B0B0B", fontWeight: "800" }]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          <TouchableOpacity
            testID="test-submit-btn"
            style={styles.primary}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#0B0B0B" />
            ) : (
              <Text style={styles.primaryText}>See my results</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Test catalog screen
  const list = Object.values(catalog);
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.h1}>Mental health screens</Text>
        <Text style={styles.sub}>
          Validated screening tools used by Mental Health America. These are educational, not a
          diagnosis.
        </Text>

        {list.map((t) => (
          <TouchableOpacity
            key={t.test_id}
            testID={`test-card-${t.test_id}`}
            style={styles.testCard}
            onPress={() => startTest(t)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.testShort}>{SHORT_LABEL[t.test_id] || t.short}</Text>
              <Text style={styles.testTitle}>{t.title}</Text>
              <Text style={styles.testQuestions}>{t.questions.length} questions</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
          </TouchableOpacity>
        ))}

        {past.length > 0 && (
          <>
            <Text style={[styles.h2, { marginTop: 24 }]}>Past results</Text>
            {past.map((p) => (
              <View key={p.submission_id} style={styles.pastRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pastTitle}>
                    {SHORT_LABEL[p.test_id] || p.test_id} —{" "}
                    <Text style={{ color: COLORS.brand }}>
                      {p.score}/{p.max_score}
                    </Text>
                  </Text>
                  <Text style={styles.pastSub}>{p.category}</Text>
                  <Text style={styles.pastMeta}>
                    {new Date(p.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={styles.disclaimer}>
          These tools do not provide a diagnosis. If you're struggling, please reach out to a
          qualified mental health professional.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  back: { color: COLORS.text2, marginBottom: 8, fontSize: 15 },
  h1: { fontSize: 28, fontWeight: "800", color: COLORS.text, marginTop: 4 },
  h2: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.text2, marginTop: 6 },
  testCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
  },
  testShort: {
    color: COLORS.brand,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  testTitle: { color: COLORS.text, fontWeight: "800", fontSize: 16, marginTop: 4 },
  testQuestions: { color: COLORS.text3, marginTop: 4, fontSize: 13 },

  qCard: {
    backgroundColor: COLORS.bg2,
    borderRadius: 16,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
  },
  qNum: { color: COLORS.brand, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  qText: { color: COLORS.text, fontWeight: "700", fontSize: 15, marginTop: 6, lineHeight: 22 },
  optCol: { marginTop: 12, gap: 8 },
  opt: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  optSel: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  optDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.text3,
    marginRight: 10,
  },
  optDotSel: { backgroundColor: "#0B0B0B", borderColor: "#0B0B0B" },
  optText: { color: COLORS.text, fontSize: 14, fontWeight: "600" },

  primary: {
    backgroundColor: COLORS.brand,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },
  primaryText: { color: "#0B0B0B", fontWeight: "800", fontSize: 16 },

  resultCard: {
    backgroundColor: COLORS.bg2,
    borderRadius: 20,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 20,
    marginTop: 14,
    alignItems: "center",
  },
  resultBig: { fontSize: 56, fontWeight: "900", color: COLORS.brand, letterSpacing: -2 },
  resultMax: { fontSize: 22, color: COLORS.text2, fontWeight: "700" },
  resultCat: { color: COLORS.text, fontSize: 18, fontWeight: "800", marginTop: 4 },
  resultInterp: { color: COLORS.text2, marginTop: 10, textAlign: "center", lineHeight: 20 },

  disclaimer: { color: COLORS.text3, fontSize: 12, marginTop: 16, lineHeight: 18 },

  pastRow: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  pastTitle: { color: COLORS.text, fontWeight: "800", fontSize: 14 },
  pastSub: { color: COLORS.text2, fontSize: 13, marginTop: 2 },
  pastMeta: { color: COLORS.text3, fontSize: 12, marginTop: 4 },
});
