import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { api, COLORS, formatApiError } from "../src/api";
import { useAuth } from "../src/auth";

type Category = "flowers" | "candy" | "toy_surprise" | "treasure_chest";

const CATEGORY_LABELS: Record<Category, string> = {
  flowers: "Flower Bouquet",
  candy: "Jar of Candy",
  toy_surprise: "Toy Surprise",
  treasure_chest: "Treasure Chest",
};

type Option = {
  option_id: string;
  category: Category;
  name?: string | null;
  description: string;
  mime: string;
  image_base64: string;
  created_at?: string;
};

export default function AdminPrize() {
  const { category: catParam } = useLocalSearchParams<{ category?: string }>();
  const category = (catParam as Category) || "flowers";
  const router = useRouter();
  const { user } = useAuth();

  const [items, setItems] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pickedImage, setPickedImage] = useState<{
    base64: string;
    mime: string;
    name: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Option[]>(`/prizes/options?category=${category}`);
      setItems(data);
    } catch (e: any) {
      console.log("admin-prize load err", formatApiError(e));
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  const pickImage = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const f = res.assets[0];
      let b64 = "";
      if (Platform.OS === "web") {
        const resp = await fetch(f.uri);
        const blob = await resp.blob();
        b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const r = (reader.result as string) || "";
            const i = r.indexOf(",");
            resolve(i >= 0 ? r.slice(i + 1) : r);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } else {
        b64 = await FileSystem.readAsStringAsync(f.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      const approxBytes = (b64.length * 3) / 4;
      if (approxBytes > 5 * 1024 * 1024) {
        Alert.alert(
          "Image too large",
          `That image is ~${(approxBytes / (1024 * 1024)).toFixed(1)} MB. Please pick one under 5 MB.`
        );
        return;
      }
      setPickedImage({
        base64: b64,
        mime: f.mimeType || "image/png",
        name: f.name,
      });
    } catch (e: any) {
      Alert.alert("Image error", formatApiError(e));
    }
  };

  const submit = async () => {
    if (!description.trim()) {
      Alert.alert("Missing description", "Please describe the prize.");
      return;
    }
    if (!pickedImage) {
      Alert.alert("Missing image", "Please pick an image for the prize.");
      return;
    }
    setUploading(true);
    try {
      await api.post("/prizes/options", {
        category,
        name: name.trim() || null,
        description: description.trim(),
        mime: pickedImage.mime,
        image_base64: pickedImage.base64,
      });
      setName("");
      setDescription("");
      setPickedImage(null);
      await load();
      Alert.alert("Added", "The prize option is now visible to users.");
    } catch (e: any) {
      Alert.alert("Could not add", formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (option_id: string) => {
    try {
      await api.delete(`/prizes/options/${option_id}`);
      await load();
    } catch (e: any) {
      Alert.alert("Delete failed", formatApiError(e));
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ color: COLORS.text }}>Admin only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.h1}>{CATEGORY_LABELS[category]}</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Add a new option</Text>
          <Text style={styles.sub}>
            Upload an image and a short description. It will appear when a user
            claims their {CATEGORY_LABELS[category]}.
          </Text>

          <TextInput
            testID="admin-prize-name-input"
            placeholder="Short name (optional, e.g. Pastel mix)"
            placeholderTextColor={COLORS.text3}
            style={styles.input}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            testID="admin-prize-desc-input"
            placeholder="Description (what it looks like, what's included…)"
            placeholderTextColor={COLORS.text3}
            style={[styles.input, { height: 96, textAlignVertical: "top" }]}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <TouchableOpacity
            testID="admin-prize-pick-image"
            style={styles.btnLight}
            onPress={pickImage}
          >
            <Ionicons name="image-outline" size={16} color={COLORS.text} />
            <Text style={styles.btnLightText}>
              {pickedImage ? "Image picked — tap to change" : "Pick image"}
            </Text>
          </TouchableOpacity>

          {pickedImage && (
            <Image
              source={{ uri: `data:${pickedImage.mime};base64,${pickedImage.base64}` }}
              style={styles.preview}
              resizeMode="cover"
            />
          )}

          <TouchableOpacity
            testID="admin-prize-add-btn"
            style={styles.btn}
            onPress={submit}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                <Text style={styles.btnText}>Add option</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.h2, { marginTop: 18, marginBottom: 6 }]}>
          Current options ({items.length})
        </Text>
        {loading ? (
          <ActivityIndicator color={COLORS.brand} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>
            No options yet. Add one above so users have something to choose from.
          </Text>
        ) : (
          items.map((it) => (
            <View key={it.option_id} style={styles.itemRow}>
              <Image
                source={{ uri: `data:${it.mime};base64,${it.image_base64}` }}
                style={styles.itemImg}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                {it.name ? <Text style={styles.itemName}>{it.name}</Text> : null}
                <Text style={styles.itemDesc} numberOfLines={3}>
                  {it.description}
                </Text>
              </View>
              <TouchableOpacity
                testID={`admin-prize-delete-${it.option_id}`}
                onPress={() => remove(it.option_id)}
                style={{ padding: 6 }}
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.e_red} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { color: COLORS.text2, fontSize: 15 },
  h1: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  h2: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.text2, marginTop: 4, fontSize: 13 },
  card: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
    marginTop: 10,
  },
  btn: {
    backgroundColor: "#0B0B0B",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  btnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  btnLight: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  btnLightText: { color: COLORS.text, fontWeight: "700", fontSize: 14 },
  preview: {
    width: "100%",
    aspectRatio: 1.4,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    marginTop: 10,
  },
  empty: {
    color: COLORS.text3,
    fontStyle: "italic",
    textAlign: "center",
    padding: 20,
  },
  itemRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginTop: 10,
    alignItems: "center",
  },
  itemImg: { width: 64, height: 64, borderRadius: 10, backgroundColor: COLORS.bg },
  itemName: { color: COLORS.text, fontWeight: "800", fontSize: 14 },
  itemDesc: { color: COLORS.text2, fontSize: 13, marginTop: 2 },
});
