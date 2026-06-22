import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  Alert,
} from "react-native";
import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Rect,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, COLORS, formatApiError } from "../../src/api";
import { useAuth } from "../../src/auth";

type Status = "picking" | "in_progress" | "ready_to_claim";
type Progress = {
  choice: string | null;
  points: number;
  goal: number;
  status: Status;
};

type Claim = {
  claim_id: string;
  choice: string;
  option_name?: string;
  full_name?: string;
  created_at?: string;
  option_image_base64?: string;
  option_mime?: string;
  option_description?: string;
};

type PrizeKey = "flowers" | "candy" | "giftcard" | "treasure_chest";

// Flower image set — one per 25-point tier
const FLOWER_IMAGES: Record<number, ImageSourcePropType> = {
  0: require("../../assets/prizes/flowers/0.png"),
  25: require("../../assets/prizes/flowers/25.png"),
  50: require("../../assets/prizes/flowers/50.png"),
  75: require("../../assets/prizes/flowers/75.png"),
  100: require("../../assets/prizes/flowers/100.png"),
};

const TREASURE_IMAGES: Record<number, ImageSourcePropType> = {
  0: require("../../assets/prizes/treasure_chest/0.png"),
  25: require("../../assets/prizes/treasure_chest/25.png"),
  50: require("../../assets/prizes/treasure_chest/50.png"),
  75: require("../../assets/prizes/treasure_chest/75.png"),
  100: require("../../assets/prizes/treasure_chest/100.png"),
};

const CANDY_IMAGES: Record<number, ImageSourcePropType> = {
  0: require("../../assets/prizes/candy/0.png"),
  25: require("../../assets/prizes/candy/25.png"),
  50: require("../../assets/prizes/candy/50.png"),
  75: require("../../assets/prizes/candy/75.png"),
  100: require("../../assets/prizes/candy/100.png"),
};

function tierImage(set: Record<number, ImageSourcePropType>, points: number): ImageSourcePropType {
  if (points >= 100) return set[100];
  if (points >= 75) return set[75];
  if (points >= 50) return set[50];
  if (points >= 25) return set[25];
  return set[0];
}

const PRIZE_META: Record<
  PrizeKey,
  { label: string; subtitle: string; deliveryHint: string }
> = {
  flowers: {
    label: "Flower Bouquet",
    subtitle: "A fresh bouquet of flowers",
    deliveryHint: "Delivered to your address by mail",
  },
  candy: {
    label: "Jar of Candy",
    subtitle: "A sweet jar full of candy",
    deliveryHint: "Shipped right to your door",
  },
  giftcard: {
    label: "Envelope Surprise",
    subtitle: "A surprise envelope with goodies",
    deliveryHint: "Sent by post — let it be a surprise",
  },
  treasure_chest: {
    label: "Treasure Chest",
    subtitle: "A keepsake chest of small gifts",
    deliveryHint: "Mailed directly to you",
  },
};

const PRIZES_ORDER: PrizeKey[] = ["flowers", "candy", "giftcard", "treasure_chest"];

export default function Rewards() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        api.get<Progress>("/awards/progress"),
        api.get<Claim[]>("/awards/claims"),
      ]);
      setProgress(pRes.data);
      setClaims(cRes.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const choosePrize = async (choice: PrizeKey) => {
    setPicking(true);
    try {
      await api.post("/awards/choice", { choice });
      await load();
    } catch (e: any) {
      Alert.alert("Cannot change prize", formatApiError(e));
    } finally {
      setPicking(false);
    }
  };

  if (loading || !progress) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.brand} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Prizes</Text>

        <View style={styles.pointsBadge}>
          <Ionicons name="sparkles" size={18} color="#0B0B0B" />
          <Text style={styles.pointsBadgeText}>
            {progress.points} {progress.points === 1 ? "point" : "points"} earned
          </Text>
        </View>

        {isAdmin && <AdminPanel onOpen={(cat) => router.push(`/admin-prize?category=${cat}`)} />}

        {progress.status === "picking" && (
          <PickerView onChoose={choosePrize} disabled={picking} />
        )}

        {progress.status === "in_progress" && progress.choice && (
          <InProgressView
            choice={progress.choice as PrizeKey}
            points={progress.points}
          />
        )}

        {progress.status === "ready_to_claim" && progress.choice && (
          <ReadyToClaimView
            choice={progress.choice as PrizeKey}
            onClaim={() =>
              router.push(`/claim-options?category=${progress.choice}`)
            }
          />
        )}

        {claims.length > 0 && <TrophyRoom claims={claims} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function TrophyRoom({ claims }: { claims: Claim[] }) {
  return (
    <View style={styles.trophyWrap}>
      <View style={styles.trophyHeader}>
        <Ionicons name="trophy" size={20} color={COLORS.brand} />
        <Text style={styles.trophyTitle}>Trophy room</Text>
        <Text style={styles.trophyCount}>{claims.length}</Text>
      </View>
      {claims.map((c) => (
        <View key={c.claim_id} style={styles.trophyCard}>
          {c.option_image_base64 ? (
            <Image
              source={{
                uri: `data:${c.option_mime || "image/png"};base64,${c.option_image_base64}`,
              }}
              style={styles.trophyImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.trophyImg, { alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="gift" size={28} color={COLORS.text3} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.trophyName}>
              {c.option_name || PRIZE_META[(c.choice as PrizeKey)]?.label || "Prize"}
            </Text>
            <Text style={styles.trophyCategory}>
              {PRIZE_META[(c.choice as PrizeKey)]?.label || c.choice}
            </Text>
            {c.created_at && (
              <Text style={styles.trophyDate}>
                Claimed {new Date(c.created_at).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------- Admin panel — manage prize options inline ---------- */
function AdminPanel({ onOpen }: { onOpen: (cat: PrizeKey) => void }) {
  return (
    <View style={styles.adminPanel}>
      <View style={styles.adminHeader}>
        <Ionicons name="settings-outline" size={16} color="#0B0B0B" />
        <Text style={styles.adminHeaderText}>Admin · Manage prize options</Text>
      </View>
      <Text style={styles.adminSub}>
        Tap a category to upload images and descriptions. Users see your uploads when they claim.
      </Text>
      <View style={styles.adminGrid}>
        {PRIZES_ORDER.map((key) => (
          <TouchableOpacity
            key={key}
            testID={`rewards-admin-edit-${key}`}
            style={styles.adminBtn}
            onPress={() => onOpen(key)}
            activeOpacity={0.85}
          >
            <Ionicons name="pencil" size={14} color={COLORS.text} />
            <Text style={styles.adminBtnText}>{PRIZE_META[key].label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/* ---------- Picker (2x2 grid) ---------- */
function PickerView({
  onChoose,
  disabled,
}: {
  onChoose: (k: PrizeKey) => void;
  disabled: boolean;
}) {
  return (
    <>
      <View style={styles.howCard}>
        <View style={styles.howRow}>
          <Ionicons name="information-circle" size={18} color={COLORS.brand} />
          <Text style={styles.howTitle}>How to win a prize</Text>
        </View>
        <Text style={styles.howText}>
          Pick one prize below. Complete daily tasks to earn points. When you hit{" "}
          <Text style={{ fontWeight: "800" }}>100 points</Text>, tap{" "}
          <Text style={{ fontWeight: "800" }}>Claim prize</Text> and enter your
          shipping details. We'll mail it to you — usually within a few weeks.
        </Text>
        <Text style={styles.howTextSmall}>
          You can only have one prize in progress at a time, so choose carefully!
        </Text>
      </View>

      <View style={styles.grid}>
        {PRIZES_ORDER.map((key) => (
          <PrizeTile key={key} prizeKey={key} onPress={() => onChoose(key)} disabled={disabled} />
        ))}
      </View>
    </>
  );
}

function PrizeTile({
  prizeKey,
  onPress,
  disabled,
}: {
  prizeKey: PrizeKey;
  onPress: () => void;
  disabled: boolean;
}) {
  const meta = PRIZE_META[prizeKey];
  return (
    <TouchableOpacity
      testID={`prize-tile-${prizeKey}`}
      style={styles.tile}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <View style={styles.tileImageWrap}>
        <PrizeImage prizeKey={prizeKey} points={100} size={120} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {meta.label}
      </Text>
      <Text style={styles.tileSub} numberOfLines={2}>
        {meta.subtitle}
      </Text>
      <View style={styles.tileCta}>
        <Text style={styles.tileCtaText}>Choose this prize</Text>
        <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
}

/* ---------- Progress view ---------- */
function InProgressView({
  choice,
  points,
}: {
  choice: PrizeKey;
  points: number;
}) {
  const meta = PRIZE_META[choice];
  return (
    <View style={styles.progressCard}>
      <View style={styles.lockedRow}>
        <Ionicons name="lock-closed" size={14} color={COLORS.text2} />
        <Text style={styles.lockedText}>
          Locked until you claim this prize
        </Text>
      </View>
      <Text style={styles.progressTitle}>{meta.label}</Text>
      <Text style={styles.progressSub}>{meta.deliveryHint}</Text>
      <View style={styles.progressImageWrap}>
        <PrizeImage prizeKey={choice} points={points} size={260} />
      </View>
      <Text style={styles.encouragement}>
        {points < 25
          ? "You're just getting started — keep going!"
          : points < 50
          ? "Great progress, you're building momentum!"
          : points < 75
          ? "More than halfway there!"
          : points < 100
          ? "Almost ready to claim your prize!"
          : "Tap below to claim your prize!"}
      </Text>
    </View>
  );
}

/* ---------- Ready to claim ---------- */
function ReadyToClaimView({
  choice,
  onClaim,
}: {
  choice: PrizeKey;
  onClaim: () => void;
}) {
  const meta = PRIZE_META[choice];
  return (
    <View style={styles.claimCard}>
      <Text style={styles.claimEmoji}>🎉</Text>
      <Text style={styles.claimTitle}>You earned your prize!</Text>
      <Text style={styles.claimSub}>{meta.label} · {meta.deliveryHint}</Text>
      <View style={styles.progressImageWrap}>
        <PrizeImage prizeKey={choice} points={100} size={260} />
      </View>
      <TouchableOpacity
        testID="claim-prize-btn"
        style={styles.claimBtn}
        onPress={onClaim}
        activeOpacity={0.88}
      >
        <Ionicons name="gift" size={16} color="#FFFFFF" />
        <Text style={styles.claimBtnText}>Claim prize</Text>
      </TouchableOpacity>
      <Text style={styles.claimNote}>
        Fill out your shipping details on the next page so we can mail your prize.
      </Text>
    </View>
  );
}

/* ---------- Prize artwork — images for flowers, SVG for others ---------- */
function PrizeImage({
  prizeKey,
  points,
  size,
}: {
  prizeKey: PrizeKey;
  points: number;
  size: number;
}) {
  if (prizeKey === "flowers") {
    return (
      <Image
        source={tierImage(FLOWER_IMAGES, points)}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }
  if (prizeKey === "treasure_chest") {
    return (
      <Image
        source={tierImage(TREASURE_IMAGES, points)}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }
  if (prizeKey === "candy") {
    return (
      <Image
        source={tierImage(CANDY_IMAGES, points)}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }
  return <EnvelopeSvg points={points} size={size} />;
}

function fillRatio(points: number): number {
  return Math.min(1, Math.max(0, points / 100));
}

function CandyJarSvg({ points, size }: { points: number; size: number }) {
  const ratio = fillRatio(points);
  const candies = [
    { c: "#FF6B6B" },
    { c: "#FFD93D" },
    { c: "#4FACFE" },
    { c: "#A78BFA" },
    { c: "#34D399" },
    { c: "#F472B6" },
    { c: "#FB923C" },
    { c: "#22D3EE" },
  ];
  const jarTop = 60;
  const jarBottom = 230;
  const fillY = jarBottom - (jarBottom - jarTop) * ratio;
  return (
    <Svg width={size} height={size} viewBox="0 0 240 260">
      <Defs>
        <LinearGradient id="jarGlass" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#E0F2FE" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#BAE6FD" stopOpacity="0.45" />
        </LinearGradient>
      </Defs>
      <Rect x="60" y="35" width="120" height="22" rx="8" fill="#1F2937" />
      <Path d="M52 60 Q52 250 120 250 Q188 250 188 60 Z" fill="url(#jarGlass)" stroke="#1F2937" strokeWidth="3" />
      {ratio > 0 && (
        <G>
          <Path
            d={`M58 ${fillY} L58 244 Q58 248 62 248 L178 248 Q182 248 182 244 L182 ${fillY} Z`}
            fill="#FEF3C7"
            opacity="0.7"
          />
          {candies.slice(0, Math.ceil(ratio * candies.length)).map((c, i) => (
            <Circle
              key={i}
              cx={75 + ((i * 22) % 90)}
              cy={fillY + 20 + Math.floor(i / 4) * 30}
              r="10"
              fill={c.c}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          ))}
        </G>
      )}
      <Path d="M52 60 Q52 250 120 250" stroke="#FFFFFF" strokeWidth="3" fill="none" opacity="0.6" />
    </Svg>
  );
}

function EnvelopeSvg({ points, size }: { points: number; size: number }) {
  const ratio = fillRatio(points);
  return (
    <Svg width={size} height={size} viewBox="0 0 240 200">
      <Rect x="20" y="60" width="200" height="120" rx="10" fill="#FEF3C7" stroke="#1F2937" strokeWidth="3" />
      <Path d="M20 60 L120 130 L220 60" stroke="#1F2937" strokeWidth="3" fill="none" />
      {ratio >= 0.25 && <Rect x="160" y="76" width="36" height="42" fill="#FB923C" stroke="#1F2937" strokeWidth="2" />}
      {ratio >= 0.5 && <Rect x="44" y="76" width="36" height="42" fill="#34D399" stroke="#1F2937" strokeWidth="2" />}
      {ratio >= 0.75 && <Rect x="102" y="142" width="36" height="28" fill="#F472B6" stroke="#1F2937" strokeWidth="2" />}
      {ratio >= 1 && (
        <G>
          <Circle cx="120" cy="50" r="22" fill="#FACC15" stroke="#1F2937" strokeWidth="3" />
          <Path d="M120 32 L124 44 L136 44 L126 52 L130 64 L120 56 L110 64 L114 52 L104 44 L116 44 Z" fill="#1F2937" />
        </G>
      )}
    </Svg>
  );
}

function TreasureChestSvg({ points, size }: { points: number; size: number }) {
  const ratio = fillRatio(points);
  const lidAngle = ratio >= 1 ? -28 : ratio >= 0.5 ? -14 : 0;
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <Defs>
        <LinearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#A0522D" />
          <Stop offset="1" stopColor="#5D2E0E" />
        </LinearGradient>
        <LinearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBBF24" />
          <Stop offset="1" stopColor="#D97706" />
        </LinearGradient>
      </Defs>
      {/* base */}
      <Rect x="32" y="120" width="176" height="92" rx="6" fill="url(#wood)" stroke="#3B1A07" strokeWidth="3" />
      <Rect x="32" y="120" width="176" height="14" fill="#3B1A07" />
      <Rect x="32" y="178" width="176" height="6" fill="url(#gold)" />
      {/* lid (rotated) */}
      <G rotation={lidAngle} originX="120" originY="120">
        <Path d="M32 120 Q120 60 208 120 Z" fill="url(#wood)" stroke="#3B1A07" strokeWidth="3" />
        <Path d="M32 120 Q120 72 208 120" fill="none" stroke="url(#gold)" strokeWidth="6" />
        <Rect x="112" y="116" width="16" height="22" fill="url(#gold)" stroke="#3B1A07" strokeWidth="2" />
        <Circle cx="120" cy="124" r="3" fill="#3B1A07" />
      </G>
      {/* coins / sparkles by ratio */}
      {ratio >= 0.25 && <Circle cx="84" cy="172" r="9" fill="url(#gold)" stroke="#3B1A07" strokeWidth="2" />}
      {ratio >= 0.5 && <Circle cx="120" cy="178" r="11" fill="url(#gold)" stroke="#3B1A07" strokeWidth="2" />}
      {ratio >= 0.75 && <Circle cx="158" cy="170" r="9" fill="url(#gold)" stroke="#3B1A07" strokeWidth="2" />}
      {ratio >= 1 && (
        <G>
          <Path d="M120 20 L126 36 L142 36 L130 46 L134 62 L120 52 L106 62 L110 46 L98 36 L114 36 Z" fill="#FACC15" stroke="#3B1A07" strokeWidth="2" />
          <Ellipse cx="120" cy="74" rx="46" ry="6" fill="#FACC15" opacity="0.4" />
        </G>
      )}
    </Svg>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 18, paddingBottom: 80 },

  h1: { fontSize: 30, fontWeight: "800", color: COLORS.text, marginBottom: 10 },
  pointsBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.brand,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    gap: 6,
    marginBottom: 16,
  },
  pointsBadgeText: { color: "#0B0B0B", fontWeight: "800", fontSize: 14 },

  adminPanel: {
    backgroundColor: COLORS.brand,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  adminHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  adminHeaderText: { color: "#0B0B0B", fontWeight: "800", fontSize: 14 },
  adminSub: { color: "#0B0B0B", fontSize: 12, opacity: 0.78, marginBottom: 10 },
  adminGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  adminBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 99,
  },
  adminBtnText: { color: "#0B0B0B", fontWeight: "700", fontSize: 13 },

  howCard: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  howRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  howTitle: { color: COLORS.text, fontWeight: "800", fontSize: 14 },
  howText: { color: COLORS.text2, fontSize: 13, lineHeight: 19 },
  howTextSmall: { color: COLORS.text3, fontSize: 12, marginTop: 8, fontStyle: "italic" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  tile: {
    width: "48%",
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
  },
  tileImageWrap: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  tileLabel: { color: COLORS.text, fontWeight: "800", fontSize: 14, textAlign: "center" },
  tileSub: { color: COLORS.text2, fontSize: 12, textAlign: "center", marginTop: 2, minHeight: 30 },
  tileCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0B0B0B",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 99,
    marginTop: 8,
  },
  tileCtaText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },

  progressCard: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
  },
  lockedRow: { flexDirection: "row", gap: 6, alignItems: "center", alignSelf: "flex-start" },
  lockedText: { color: COLORS.text2, fontSize: 12 },
  progressTitle: { color: COLORS.text, fontWeight: "800", fontSize: 22, marginTop: 6 },
  progressSub: { color: COLORS.text2, fontSize: 13, marginTop: 2 },
  progressImageWrap: {
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 12,
  },
  encouragement: { color: COLORS.text, marginTop: 14, fontWeight: "600", textAlign: "center" },

  claimCard: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.brand,
    borderWidth: 2,
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
  },
  claimEmoji: { fontSize: 44 },
  claimTitle: { color: COLORS.text, fontWeight: "800", fontSize: 22, marginTop: 4 },
  claimSub: { color: COLORS.text2, fontSize: 13, marginTop: 4, textAlign: "center" },
  claimBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "#0B0B0B",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  claimBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  claimNote: { color: COLORS.text3, fontSize: 12, marginTop: 12, textAlign: "center" },

  trophyWrap: { marginTop: 22 },
  trophyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  trophyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  trophyCount: {
    color: "#0B0B0B",
    backgroundColor: COLORS.brand,
    fontWeight: "800",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: "hidden",
  },
  trophyCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    alignItems: "center",
  },
  trophyImg: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
  },
  trophyName: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  trophyCategory: { color: COLORS.text2, fontSize: 13, marginTop: 2 },
  trophyDate: { color: COLORS.text3, fontSize: 12, marginTop: 4 },
});
