import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, COLORS } from "../../src/api";
import { Ionicons } from "@expo/vector-icons";

type Progress = { choice: string; count: number; goal: number };

const PETAL_COLORS = [
  "#FF6B6B",
  "#FFD93D",
  "#F472B6",
  "#A78BFA",
  "#34D399",
  "#60A5FA",
  "#FB923C",
  "#FACC15",
];
const CANDY_COLORS = [
  "#FF6B6B",
  "#FFD93D",
  "#F472B6",
  "#A78BFA",
  "#34D399",
  "#60A5FA",
  "#FB923C",
];
const STAMP_COLORS = ["#3BD16F", "#3B82F6", "#F472B6", "#A78BFA", "#FB923C", "#EF4444"];

function CartoonVase({ count, mini = false }: { count: number; mini?: boolean }) {
  const max = 30;
  const n = Math.max(0, Math.min(count, max));
  return (
    <Svg width="100%" height="100%" viewBox="0 0 240 280" preserveAspectRatio="xMidYMid meet">
      {/* Flowers — drawn first so vase covers stems */}
      {Array.from({ length: n }).map((_, i) => {
        const cols = 6;
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = 70 + col * 18 + ((row % 2) * 9);
        const y = 100 - row * 18;
        const c = PETAL_COLORS[i % PETAL_COLORS.length];
        return (
          <G key={`f-${i}`}>
            <Line x1={x} y1={140} x2={x} y2={y + 6} stroke="#2BBF8A" strokeWidth={2.5} />
            <Circle cx={x - 6} cy={y} r={5.5} fill={c} stroke="#0B0B0B" strokeWidth={1} />
            <Circle cx={x + 6} cy={y} r={5.5} fill={c} stroke="#0B0B0B" strokeWidth={1} />
            <Circle cx={x - 3} cy={y - 6} r={5.5} fill={c} stroke="#0B0B0B" strokeWidth={1} />
            <Circle cx={x + 3} cy={y - 6} r={5.5} fill={c} stroke="#0B0B0B" strokeWidth={1} />
            <Circle cx={x} cy={y + 5} r={5.5} fill={c} stroke="#0B0B0B" strokeWidth={1} />
            <Circle cx={x} cy={y - 1} r={3.5} fill="#FFD93D" stroke="#0B0B0B" strokeWidth={1} />
          </G>
        );
      })}

      {/* Vase body */}
      <Path
        d="M62 140 C 62 122 50 116 70 100 H 170 C 190 116 178 122 178 140 C 178 200 198 220 168 250 C 138 270 102 270 72 250 C 42 220 62 200 62 140 Z"
        fill="#FACC15"
        stroke="#0B0B0B"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {/* Vase mouth lip */}
      <Path
        d="M70 100 H 170"
        stroke="#0B0B0B"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Ellipse cx={120} cy={100} rx={50} ry={6} fill="#FFE57F" stroke="#0B0B0B" strokeWidth={2} />
      {/* Highlight */}
      <Path
        d="M82 160 C 78 190 82 215 95 235"
        stroke="#FFFFFF"
        strokeWidth={6}
        strokeLinecap="round"
        fill="none"
        opacity={0.7}
      />

      {!mini && (
        <SvgText
          x={120}
          y={266}
          textAnchor="middle"
          fontSize={10}
          fontWeight="800"
          fill="#0B0B0B"
        >
          {n}/30 flowers
        </SvgText>
      )}
    </Svg>
  );
}

function CartoonJar({ count, mini = false }: { count: number; mini?: boolean }) {
  const max = 30;
  const n = Math.max(0, Math.min(count, max));
  return (
    <Svg width="100%" height="100%" viewBox="0 0 240 280" preserveAspectRatio="xMidYMid meet">
      {/* Lid base */}
      <Rect x={56} y={26} width={128} height={28} rx={6} fill="#3B82F6" stroke="#0B0B0B" strokeWidth={3} />
      {/* Lid top ring */}
      <Rect x={62} y={20} width={116} height={12} rx={4} fill="#1D4ED8" stroke="#0B0B0B" strokeWidth={3} />
      {/* Jar body — glass */}
      <Path
        d="M50 60 V 230 C 50 258 190 258 190 230 V 60 Z"
        fill="#E5EFFE"
        stroke="#0B0B0B"
        strokeWidth={3}
        opacity={0.92}
      />
      {/* Neck rim */}
      <Path d="M50 60 H 190" stroke="#0B0B0B" strokeWidth={3} />
      {/* Candies stacked from the bottom */}
      {Array.from({ length: n }).map((_, i) => {
        const cols = 5;
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = 72 + col * 22 + ((row % 2) * 11);
        const y = 232 - row * 18;
        const c = CANDY_COLORS[i % CANDY_COLORS.length];
        const rot = ((i * 37) % 60) - 30;
        return (
          <G key={`c-${i}`} transform={`rotate(${rot} ${x} ${y})`}>
            <Path
              d={`M${x - 16} ${y - 3} L${x - 10} ${y} L${x - 16} ${y + 3} Z`}
              fill={c}
              stroke="#0B0B0B"
              strokeWidth={1.2}
            />
            <Path
              d={`M${x + 16} ${y - 3} L${x + 10} ${y} L${x + 16} ${y + 3} Z`}
              fill={c}
              stroke="#0B0B0B"
              strokeWidth={1.2}
            />
            <Ellipse cx={x} cy={y} rx={10} ry={6} fill={c} stroke="#0B0B0B" strokeWidth={1.5} />
            <Path
              d={`M${x - 5} ${y - 2} Q ${x} ${y - 4} ${x + 5} ${y - 2}`}
              stroke="#FFFFFF"
              strokeWidth={1.2}
              fill="none"
              opacity={0.7}
            />
          </G>
        );
      })}
      {/* Glass highlight */}
      <Path
        d="M62 80 V 220"
        stroke="#FFFFFF"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.7}
      />
      <SvgText x={120} y={44} textAnchor="middle" fontSize={11} fontWeight="800" fill="#FFFFFF">
        CANDY
      </SvgText>
      {!mini && (
        <SvgText
          x={120}
          y={272}
          textAnchor="middle"
          fontSize={10}
          fontWeight="800"
          fill="#0B0B0B"
        >
          {n}/30 candies
        </SvgText>
      )}
    </Svg>
  );
}

function CartoonEnvelope({ count, mini = false }: { count: number; mini?: boolean }) {
  const max = 30;
  const n = Math.max(0, Math.min(count, max));
  return (
    <Svg width="100%" height="100%" viewBox="0 0 240 280" preserveAspectRatio="xMidYMid meet">
      {/* Envelope body */}
      <Rect x={26} y={70} width={188} height={150} rx={10} fill="#FFE57F" stroke="#0B0B0B" strokeWidth={3} />
      {/* Bottom fold lines */}
      <Path d="M26 220 L120 150 L214 220" stroke="#0B0B0B" strokeWidth={2.5} fill="none" />
      {/* Closed flap */}
      <Path d="M26 70 L120 158 L214 70 Z" fill="#FCD34D" stroke="#0B0B0B" strokeWidth={3} />
      {/* Wax seal */}
      <Circle cx={120} cy={158} r={16} fill="#EF4444" stroke="#0B0B0B" strokeWidth={2.5} />
      <SvgText x={120} y={164} textAnchor="middle" fontSize={16} fontWeight="900" fill="#FFFFFF">
        ♥
      </SvgText>
      {/* Stamps/stickers added as gifts accumulate */}
      {Array.from({ length: n }).map((_, i) => {
        const cols = 5;
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = 48 + col * 30 + ((row % 2) * 6);
        const y = 200 - row * 18;
        const c = STAMP_COLORS[i % STAMP_COLORS.length];
        return (
          <G key={`s-${i}`}>
            <Rect
              x={x - 8}
              y={y - 8}
              width={16}
              height={16}
              rx={2}
              fill={c}
              stroke="#0B0B0B"
              strokeWidth={1.2}
            />
            <SvgText
              x={x}
              y={y + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight="900"
              fill="#FFFFFF"
            >
              ★
            </SvgText>
          </G>
        );
      })}
      {!mini && (
        <SvgText
          x={120}
          y={252}
          textAnchor="middle"
          fontSize={10}
          fontWeight="800"
          fill="#0B0B0B"
        >
          {n}/30 stamps
        </SvgText>
      )}
    </Svg>
  );
}

function ChoiceArt({ choice, count, mini }: { choice: string; count: number; mini?: boolean }) {
  if (choice === "candy") return <CartoonJar count={count} mini={mini} />;
  if (choice === "giftcard") return <CartoonEnvelope count={count} mini={mini} />;
  return <CartoonVase count={count} mini={mini} />;
}

const CHOICES = [
  { key: "flowers", label: "Bouquet of flowers" },
  { key: "candy", label: "Jar of candy" },
  { key: "giftcard", label: "Gift card" },
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
    } catch {}
  };

  if (loading || !progress) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  const pct = Math.min(100, Math.round((progress.count / progress.goal) * 100));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Monthly reward</Text>
        <Text style={styles.sub}>
          Each completed task adds one piece. Fill it up by 30 to earn your gift.
        </Text>

        <View style={styles.visual}>
          <ChoiceArt choice={progress.choice} count={progress.count} />
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
                <View style={styles.choiceArt}>
                  <ChoiceArt choice={c.key} count={on ? progress.count : 0} mini />
                </View>
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
    height: 320,
    marginTop: 16,
    borderRadius: 24,
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  progressWrap: { marginTop: 14 },
  progressBg: {
    height: 14,
    borderRadius: 99,
    backgroundColor: COLORS.bg2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  progressFill: { height: "100%", backgroundColor: COLORS.brand },
  progressText: { color: COLORS.text, marginTop: 8, fontWeight: "700" },
  won: { color: COLORS.brand, marginTop: 6, fontWeight: "800" },
  choices: { flexDirection: "row", gap: 10, marginTop: 12 },
  choiceCard: {
    flex: 1,
    borderRadius: 16,
    borderColor: COLORS.border,
    borderWidth: 1,
    backgroundColor: COLORS.bg2,
    overflow: "hidden",
    paddingBottom: 10,
  },
  choiceArt: { height: 110, alignItems: "center", justifyContent: "center", padding: 6 },
  choiceLabel: { paddingHorizontal: 10, fontWeight: "700", color: COLORS.text, fontSize: 13 },
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
