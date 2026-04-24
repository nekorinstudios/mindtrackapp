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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { api, COLORS, formatApiError } from "../src/api";
import { useAuth } from "../src/auth";

type Track = { track_id: string; title: string; mime: string };
type Notice = {
  notice_id: string;
  email: string;
  choice: string;
  message: string;
  created_at: string;
};

export default function Admin() {
  const { user } = useAuth();
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, n] = await Promise.all([
        api.get<Track[]>("/music"),
        api.get<Notice[]>("/admin/notices").catch(() => ({ data: [] as Notice[] })),
      ]);
      setTracks(m.data);
      setNotices((n as any).data || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (user && user.role !== "admin") {
      Alert.alert("Admins only", "Only admins can access this screen.");
      router.replace("/(tabs)/home");
      return;
    }
    load();
  }, [user, router, load]);

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const f = res.assets[0];
      const b64 = await FileSystem.readAsStringAsync(f.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!title.trim()) {
        setTitle(f.name.replace(/\.[^.]+$/, ""));
      }
      setUploading(true);
      const fd = new FormData();
      fd.append("title", title.trim() || f.name);
      fd.append("mime", f.mimeType || "audio/mpeg");
      fd.append("data_base64", b64);
      await api.post("/music/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setTitle("");
      await load();
    } catch (e: any) {
      Alert.alert("Upload failed", formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const del = async (t: Track) => {
    try {
      await api.delete(`/music/${t.track_id}`);
      await load();
    } catch {}
  };

  if (!user || user.role !== "admin") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.h1}>Admin</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.h2}>Upload focus music</Text>
          <Text style={styles.sub}>Users will see these tracks in Tasks.</Text>
          <TextInput
            testID="admin-title-input"
            placeholder="Track title (optional)"
            placeholderTextColor={COLORS.text3}
            style={styles.input}
            value={title}
            onChangeText={setTitle}
          />
          <TouchableOpacity
            testID="admin-upload-btn"
            style={styles.btn}
            onPress={pickAndUpload}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                <Text style={styles.btnText}>Pick & upload audio</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.h2, { marginTop: 18 }]}>Tracks</Text>
        {tracks.length === 0 ? (
          <Text style={styles.sub}>No tracks yet.</Text>
        ) : (
          tracks.map((t) => (
            <View key={t.track_id} style={styles.row}>
              <Text style={styles.rowText}>{t.title}</Text>
              <TouchableOpacity onPress={() => del(t)}>
                <Ionicons name="trash-outline" size={20} color={COLORS.e_red} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <Text style={[styles.h2, { marginTop: 18 }]}>Reward notices</Text>
        {notices.length === 0 ? (
          <Text style={styles.sub}>No pending reward deliveries.</Text>
        ) : (
          notices.map((n) => (
            <View key={n.notice_id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{n.email}</Text>
                <Text style={styles.sub}>{n.choice} · {n.message}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { color: COLORS.text2, fontSize: 15 },
  h1: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  h2: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.text2, marginTop: 4 },
  card: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    marginTop: 10,
  },
  btn: {
    backgroundColor: COLORS.brand,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { color: "#fff", fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    marginTop: 10,
  },
  rowText: { color: COLORS.text, fontWeight: "700", flex: 1 },
});
