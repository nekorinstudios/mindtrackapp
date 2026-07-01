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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, COLORS, formatApiError } from "../src/api";

const CATEGORY_LABELS: Record<string, string> = {
  flowers: "Flower Bouquet",
  candy: "Jar of Candy",
  toy_surprise: "Toy Surprise",
  treasure_chest: "Treasure Chest",
};

type Option = {
  option_id: string;
  category: string;
  name?: string | null;
  description: string;
  mime: string;
  image_base64: string;
};

export default function ClaimOptions() {
  const { category: catParam } = useLocalSearchParams<{ category?: string }>();
  const category = catParam || "flowers";
  const router = useRouter();
  const [items, setItems] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Option[]>(`/prizes/options?category=${category}`);
      setItems(data);
    } catch (e: any) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = (option_id: string) => {
    router.push(`/claim?option_id=${encodeURIComponent(option_id)}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="chevron-back" size={18} color={COLORS.text2} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.emoji}>🎁</Text>
        <Text style={styles.title}>Pick your {CATEGORY_LABELS[category] || "prize"}</Text>
        <Text style={styles.sub}>
          Choose the option you'd like to receive. We'll mail it after you submit your details.
        </Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.brand} size="large" />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={42} color={COLORS.text3} />
            <Text style={styles.emptyTitle}>No options available yet</Text>
            <Text style={styles.emptyText}>
              The admin hasn't added any {CATEGORY_LABELS[category] || "prize"} options yet.
              Check back soon!
            </Text>
            <TouchableOpacity
              testID="claim-options-back-btn"
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              <Text style={styles.backBtnText}>Back to prizes</Text>
            </TouchableOpacity>
          </View>
        ) : (
          items.map((it) => (
            <TouchableOpacity
              testID={`claim-option-${it.option_id}`}
              key={it.option_id}
              style={styles.card}
              onPress={() => pick(it.option_id)}
              activeOpacity={0.86}
            >
              <Image
                source={{ uri: `data:${it.mime};base64,${it.image_base64}` }}
                style={styles.img}
                resizeMode="cover"
              />
              <View style={styles.body}>
                {it.name ? <Text style={styles.optName}>{it.name}</Text> : null}
                <Text style={styles.optDesc}>{it.description}</Text>
                <View style={styles.cta}>
                  <Text style={styles.ctaText}>Choose this option</Text>
                  <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  backText: { color: COLORS.text2, fontSize: 15 },
  emoji: { fontSize: 40, textAlign: "center", marginTop: 6 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
    marginTop: 6,
  },
  sub: {
    color: COLORS.text2,
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
  },
  center: { padding: 40, alignItems: "center" },
  error: { color: "#B75D53", textAlign: "center", marginTop: 14 },
  empty: { padding: 30, alignItems: "center", gap: 8 },
  emptyTitle: { color: COLORS.text, fontWeight: "800", fontSize: 16 },
  emptyText: { color: COLORS.text2, textAlign: "center", paddingHorizontal: 14 },
  backBtn: {
    backgroundColor: "#0B0B0B",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  backBtnText: { color: "#FFFFFF", fontWeight: "700" },

  card: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 14,
  },
  img: { width: "100%", aspectRatio: 1.6, backgroundColor: COLORS.bg },
  body: { padding: 14 },
  optName: { color: COLORS.text, fontWeight: "800", fontSize: 17 },
  optDesc: { color: COLORS.text2, fontSize: 14, marginTop: 4, lineHeight: 20 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0B0B0B",
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 99,
    marginTop: 12,
  },
  ctaText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
});
