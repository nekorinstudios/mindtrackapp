import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, COLORS, formatApiError } from "../../src/api";
import { Ionicons } from "@expo/vector-icons";

type Progress = { choice: string; count: number; goal: number };

const CHOICES = [
  {
    key: "flowers",
    label: "Bouquet of flowers",
    img: "https://images.unsplash.com/photo-1593956426409-6dd9c862d8c2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNzl8MHwxfHNlYXJjaHwxfHxmbG93ZXIlMjB2YXNlJTIwbWluaW1hbHxlbnwwfHx8fDE3NzcwMjc3ODh8MA&ixlib=rb-4.1.0&q=85",
    emoji: "🌷",
  },
  {
    key: "candy",
    label: "Jar of candy",
    img: "https://images.unsplash.com/photo-1774569037254-6ff874a9af40?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwyfHxnbGFzcyUyMGNhbmR5JTIwamFyfGVufDB8fHx8MTc3NzAyNzc4OHww&ixlib=rb-4.1.0&q=85",
    emoji: "🍬",
  },
  {
    key: "giftcard",
    label: "Gift card",
    img: "https://images.unsplash.com/photo-1603104662763-328f08c9a423?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwxfHxnaWZ0JTIwZW52ZWxvcGV8ZW58MHx8fHwxNzc3MDI3Nzg4fDA&ixlib=rb-4.1.0&q=85",
    emoji: "💌",
  },
];

export default function Rewards() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Progress>("/awards/progress");
      setProgress(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pick = async (choice: string) => {
    try {
      await api.post("/awards/choice", { choice });
      await load();
    } catch (e: any) {
      // swallow
    }
  };

  if (loading || !progress) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  const pct = Math.min(100, Math.round((progress.count / progress.goal) * 100));
  const active = CHOICES.find((c) => c.key === progress.choice) || CHOICES[0];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Monthly reward</Text>
        <Text style={styles.sub}>
          Complete tasks to fill your reward. Reach 30 items to earn it!
        </Text>

        <View style={styles.visual}>
          <Image source={{ uri: active.img }} style={styles.img} />
          <View style={styles.visualOverlay}>
            <View style={styles.emojiWrap}>
              {Array.from({ length: progress.count }).map((_, i) => (
                <Text
                  key={i}
                  style={[
                    styles.emoji,
                    {
                      left: 20 + ((i * 23) % 220),
                      bottom: 10 + Math.floor(i / 10) * 40,
                      transform: [{ rotate: `${(i % 5) * 12 - 24}deg` }],
                    },
                  ]}
                >
                  {active.emoji}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {progress.count} / {progress.goal} this month
          </Text>
          {progress.count >= progress.goal ? (
            <Text style={styles.won}>
              🎉 You earned this reward! Admin has been notified.
            </Text>
          ) : null}
        </View>

        <Text style={[styles.h2, { marginTop: 24 }]}>Choose this month's reward</Text>
        <View style={styles.choices}>
          {CHOICES.map((c) => {
            const on = progress.choice === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                testID={`reward-choice-${c.key}`}
                style={[styles.choiceCard, on && { borderColor: COLORS.brand, borderWidth: 2 }]}
                onPress={() => pick(c.key)}
              >
                <Image source={{ uri: c.img }} style={styles.choiceImg} />
                <Text style={styles.choiceLabel}>{c.label}</Text>
                {on ? (
                  <View style={styles.activeTag}>
                    <Ionicons name="checkmark" size={14} color="#0B0B0B" />
                    <Text style={styles.activeTagText}>Active</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
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
  h2: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.text2, marginTop: 6 },
  visual: {
    height: 260,
    marginTop: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    position: "relative",
  },
  img: { width: "100%", height: "100%", resizeMode: "cover", opacity: 0.55 },
  visualOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  emojiWrap: { flex: 1, position: "relative" },
  emoji: {
    position: "absolute",
    fontSize: 26,
  },
  progressWrap: { marginTop: 14 },
  progressBg: {
    height: 14,
    borderRadius: 99,
    backgroundColor: COLORS.bg3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: COLORS.brand },
  progressText: { color: COLORS.text2, marginTop: 8, fontWeight: "700" },
  won: { color: COLORS.brand2, marginTop: 6, fontWeight: "800" },
  choices: { flexDirection: "row", gap: 10, marginTop: 12 },
  choiceCard: {
    flex: 1,
    borderRadius: 16,
    borderColor: COLORS.border,
    borderWidth: 1,
    backgroundColor: COLORS.bg2,
    overflow: "hidden",
  },
  choiceImg: { width: "100%", height: 90, resizeMode: "cover" },
  choiceLabel: { padding: 10, fontWeight: "700", color: COLORS.text, fontSize: 13 },
  activeTag: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: COLORS.brand,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  activeTagText: { color: "#0B0B0B", fontSize: 11, fontWeight: "800" },
});
