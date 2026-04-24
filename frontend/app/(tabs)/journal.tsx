import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, COLORS, formatApiError } from "../../src/api";

type Entry = {
  entry_id: string;
  text: string;
  timestamp: string;
  linked_symptoms?: string[] | null;
};

export default function Journal() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [ts, setTs] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  // edit modal
  const [editing, setEditing] = useState<Entry | null>(null);
  const [editText, setEditText] = useState("");
  const [editTs, setEditTs] = useState<Date>(new Date());

  const [tsPickerOpen, setTsPickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Entry[]>("/journal");
      setEntries(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await api.post("/journal", { text: text.trim(), timestamp: ts.toISOString() });
      setText("");
      setTs(new Date());
      await load();
    } catch (e: any) {
      Alert.alert("Could not save", formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const del = async (e: Entry) => {
    try {
      await api.delete(`/journal/${e.entry_id}`);
      await load();
    } catch {}
  };

  const updateEntry = async () => {
    if (!editing) return;
    try {
      await api.patch(`/journal/${editing.entry_id}`, {
        text: editText,
        timestamp: editTs.toISOString(),
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      Alert.alert("Could not update", formatApiError(e));
    }
  };

  const adjustTs = (date: Date, delta: { hours?: number; minutes?: number; days?: number }) => {
    const d = new Date(date);
    if (delta.hours) d.setHours(d.getHours() + delta.hours);
    if (delta.minutes) d.setMinutes(d.getMinutes() + delta.minutes);
    if (delta.days) d.setDate(d.getDate() + delta.days);
    return d;
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.h1}>Journal</Text>
          <Text style={styles.sub}>
            Auto-timestamped. You can adjust the time for each entry.
          </Text>

          <View style={styles.card}>
            <TouchableOpacity
              testID="journal-timestamp-btn"
              onPress={() => setTsPickerOpen(true)}
              style={styles.tsRow}
            >
              <Ionicons name="time-outline" size={16} color={COLORS.text2} />
              <Text style={styles.tsText}>{ts.toLocaleString()}</Text>
              <Text style={{ color: COLORS.brand, fontWeight: "700", marginLeft: "auto" }}>Change</Text>
            </TouchableOpacity>
            <TextInput
              testID="journal-text-input"
              style={styles.textarea}
              value={text}
              onChangeText={setText}
              placeholder="How are you feeling right now?"
              placeholderTextColor={COLORS.text3}
              multiline
              numberOfLines={5}
            />
            <TouchableOpacity
              testID="journal-save-btn"
              style={styles.save}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Save entry</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.h2, { marginTop: 20 }]}>Recent entries</Text>
          {entries.length === 0 ? (
            <Text style={styles.sub}>Nothing yet. Your entries will appear here.</Text>
          ) : (
            entries.map((e) => (
              <View key={e.entry_id} style={styles.entry}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryDate}>{new Date(e.timestamp).toLocaleString()}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      testID={`journal-edit-${e.entry_id}`}
                      onPress={() => {
                        setEditing(e);
                        setEditText(e.text);
                        setEditTs(new Date(e.timestamp));
                      }}
                    >
                      <Ionicons name="pencil" size={18} color={COLORS.text2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`journal-delete-${e.entry_id}`}
                      onPress={() => del(e)}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.e_red} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.entryText}>{e.text}</Text>
                {e.linked_symptoms && e.linked_symptoms.length > 0 ? (
                  <View style={styles.linkedWrap}>
                    <Text style={styles.linkedLabel}>Linked symptoms:</Text>
                    <View style={styles.linkedChips}>
                      {e.linked_symptoms.map((s) => (
                        <View key={s} style={styles.linkedChip}>
                          <Text style={styles.linkedChipText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* New entry timestamp picker */}
      <Modal
        visible={tsPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTsPickerOpen(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Adjust timestamp</Text>
            <Text style={styles.sub}>{ts.toLocaleString()}</Text>
            <View style={styles.adjGrid}>
              <AdjBtn label="-1 day" onPress={() => setTs(adjustTs(ts, { days: -1 }))} />
              <AdjBtn label="-1 hr" onPress={() => setTs(adjustTs(ts, { hours: -1 }))} />
              <AdjBtn label="-10 min" onPress={() => setTs(adjustTs(ts, { minutes: -10 }))} />
              <AdjBtn label="Now" onPress={() => setTs(new Date())} />
              <AdjBtn label="+10 min" onPress={() => setTs(adjustTs(ts, { minutes: 10 }))} />
              <AdjBtn label="+1 hr" onPress={() => setTs(adjustTs(ts, { hours: 1 }))} />
              <AdjBtn label="+1 day" onPress={() => setTs(adjustTs(ts, { days: 1 }))} />
            </View>
            <TouchableOpacity
              onPress={() => setTsPickerOpen(false)}
              style={[styles.save, { backgroundColor: COLORS.brand, marginTop: 12 }]}
            >
              <Text style={styles.saveText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit entry modal */}
      <Modal
        visible={!!editing}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Edit entry</Text>
            <Text style={styles.sub}>{editTs.toLocaleString()}</Text>
            <View style={styles.adjGrid}>
              <AdjBtn label="-1 day" onPress={() => setEditTs(adjustTs(editTs, { days: -1 }))} />
              <AdjBtn label="-1 hr" onPress={() => setEditTs(adjustTs(editTs, { hours: -1 }))} />
              <AdjBtn label="-10 min" onPress={() => setEditTs(adjustTs(editTs, { minutes: -10 }))} />
              <AdjBtn label="+10 min" onPress={() => setEditTs(adjustTs(editTs, { minutes: 10 }))} />
              <AdjBtn label="+1 hr" onPress={() => setEditTs(adjustTs(editTs, { hours: 1 }))} />
              <AdjBtn label="+1 day" onPress={() => setEditTs(adjustTs(editTs, { days: 1 }))} />
            </View>
            <TextInput
              style={[styles.textarea, { marginTop: 10 }]}
              value={editText}
              onChangeText={setEditText}
              multiline
              numberOfLines={5}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setEditing(null)}
                style={[styles.save, { flex: 1, backgroundColor: COLORS.bg3 }]}
              >
                <Text style={[styles.saveText, { color: COLORS.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={updateEntry}
                style={[styles.save, { flex: 1, backgroundColor: COLORS.brand }]}
                testID="journal-update-btn"
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AdjBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg,
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  h1: { fontSize: 28, fontWeight: "800", color: COLORS.text },
  h2: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.text2, marginTop: 6 },
  card: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
  },
  tsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  tsText: { color: COLORS.text, fontWeight: "700" },
  textarea: {
    backgroundColor: COLORS.bg,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    minHeight: 110,
    textAlignVertical: "top",
  },
  save: {
    backgroundColor: COLORS.brand,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  saveText: { color: "#fff", fontWeight: "700" },
  entry: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryDate: { color: COLORS.text3, fontSize: 12, fontWeight: "700" },
  entryText: { color: COLORS.text, marginTop: 8, lineHeight: 20 },
  linkedWrap: { marginTop: 10 },
  linkedLabel: { color: COLORS.text3, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  linkedChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  linkedChip: {
    backgroundColor: COLORS.bg3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  linkedChipText: { color: COLORS.text2, fontSize: 12, fontWeight: "600" },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", padding: 16, justifyContent: "center" },
  modalCard: { backgroundColor: COLORS.bg2, borderRadius: 20, padding: 18 },
  adjGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
});
