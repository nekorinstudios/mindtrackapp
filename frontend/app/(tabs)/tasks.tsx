import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { api, COLORS, formatApiError } from "../../src/api";
import { scheduleTaskInterval, cancelNotificationIds } from "../../src/notify";
import { useAuth } from "../../src/auth";

type Task = {
  task_id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  started_at?: string | null;
  done_at?: string | null;
  notify_interval_minutes: number;
  duration_minutes?: number;
  created_at: string;
};

type Track = {
  track_id: string;
  title: string;
  mime: string;
  owner_user_id?: string | null;
  is_mine?: boolean;
};

type MusicRequest = {
  request_id: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  message: string;
  status: "pending" | "fulfilled" | "declined";
  admin_note?: string | null;
  created_at: string;
  updated_at?: string;
};

type Medicine = {
  med_id: string;
  name: string;
  dosage?: string | null;
  notes?: string | null;
  last_taken?: string | null;
};

const INTERVALS = [5, 10, 15, 20, 25, 30];

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newInterval, setNewInterval] = useState(10);
  const [newDuration, setNewDuration] = useState(10);
  const [adding, setAdding] = useState(false);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const [notifMap, setNotifMap] = useState<Record<string, string[]>>({});

  const [intervalModalFor, setIntervalModalFor] = useState<Task | null>(null);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medAdding, setMedAdding] = useState(false);

  // User music upload + music requests
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [myRequests, setMyRequests] = useState<MusicRequest[]>([]);
  const [adminRequests, setAdminRequests] = useState<MusicRequest[]>([]);

  const load = useCallback(async () => {
    try {
      const [t, m, meds] = await Promise.all([
        api.get<Task[]>("/tasks"),
        api.get<Track[]>("/music"),
        api.get<Medicine[]>("/medicines"),
      ]);
      setTasks(t.data);
      setTracks(m.data);
      setMedicines(meds.data);
    } catch (e: any) {
      if (e?.response?.status !== 401) console.log("tasks err", e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const mine = await api.get<MusicRequest[]>("/music/requests/mine");
      setMyRequests(mine.data);
      if (user?.role === "admin") {
        const all = await api.get<MusicRequest[]>("/music/requests");
        setAdminRequests(all.data);
      }
    } catch (e: any) {
      if (e?.response?.status !== 401) console.log("requests err", e?.message);
    }
  }, [user?.role]);

  useEffect(() => {
    load();
    loadRequests();
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [load, loadRequests]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await api.post("/tasks", {
        title: newTitle.trim(),
        notify_interval_minutes: newInterval,
        duration_minutes: newDuration,
      });
      setNewTitle("");
      await load();
    } catch (e: any) {
      Alert.alert("Could not add", formatApiError(e));
    } finally {
      setAdding(false);
    }
  };

  const check = async (t: Task, action: "start" | "done") => {
    try {
      await api.post("/tasks/check", { task_id: t.task_id, action });
      if (action === "start") {
        const ids = await scheduleTaskInterval(t.task_id, t.title, t.notify_interval_minutes);
        setNotifMap((m) => ({ ...m, [t.task_id]: ids }));
      } else {
        const ids = notifMap[t.task_id] || [];
        if (ids.length) {
          await cancelNotificationIds(ids);
          setNotifMap((m) => {
            const n = { ...m };
            delete n[t.task_id];
            return n;
          });
        }
      }
      await load();
    } catch (e: any) {
      Alert.alert("Action blocked", formatApiError(e));
    }
  };

  const del = async (t: Task) => {
    try {
      await api.delete(`/tasks/${t.task_id}`);
      await load();
    } catch {}
  };

  const playTrack = async (tr: Track) => {
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }
      if (playingId === tr.track_id) {
        setPlayingId(null);
        return;
      }
      const res = await api.get(`/music/${tr.track_id}/data`);
      const b64 = res.data.data_base64;
      const uri = `data:${res.data.mime};base64,${b64}`;
      const { sound: s } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: true }
      );
      setSound(s);
      setPlayingId(tr.track_id);
    } catch (e: any) {
      Alert.alert("Playback error", formatApiError(e));
    }
  };

  const setInterval = async (taskId: string, minutes: number) => {
    // local update (backend uses it on next start)
    setTasks((ts) =>
      ts.map((t) => (t.task_id === taskId ? { ...t, notify_interval_minutes: minutes } : t))
    );
    setIntervalModalFor(null);
    // Note: interval is used when starting; if already in progress, reschedule
    const t = tasks.find((x) => x.task_id === taskId);
    if (t && t.status === "in_progress") {
      const ids = notifMap[taskId] || [];
      if (ids.length) await cancelNotificationIds(ids);
      const newIds = await scheduleTaskInterval(taskId, t.title, minutes);
      setNotifMap((m) => ({ ...m, [taskId]: newIds }));
    }
  };

  const addMedicine = async () => {
    if (!medName.trim()) return;
    setMedAdding(true);
    try {
      await api.post("/medicines", { name: medName.trim(), dosage: medDose.trim() || undefined });
      setMedName("");
      setMedDose("");
      await load();
    } catch (e: any) {
      Alert.alert("Could not add", formatApiError(e));
    } finally {
      setMedAdding(false);
    }
  };

  const logMedicine = async (m: Medicine) => {
    try {
      await api.post(`/medicines/${m.med_id}/log`, {});
      await load();
    } catch (e: any) {
      Alert.alert("Could not log", formatApiError(e));
    }
  };

  const deleteMedicine = async (m: Medicine) => {
    try {
      await api.delete(`/medicines/${m.med_id}`);
      await load();
    } catch {}
  };

  const uploadMyMusic = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
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
            const result = (reader.result as string) || "";
            const idx = result.indexOf(",");
            resolve(idx >= 0 ? result.slice(idx + 1) : result);
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
          "File too large",
          `That track is ~${(approxBytes / (1024 * 1024)).toFixed(1)} MB. Please pick a file under 5 MB.`
        );
        return;
      }
      setUploadingMusic(true);
      const title = f.name.replace(/\.[^.]+$/, "");
      await api.post("/music/upload/user", {
        title,
        mime: f.mimeType || "audio/mpeg",
        data_base64: b64,
      });
      await load();
      Alert.alert("Uploaded", `"${title}" is now in your personal music.`);
    } catch (e: any) {
      Alert.alert("Upload failed", formatApiError(e));
    } finally {
      setUploadingMusic(false);
    }
  };

  const deleteMyTrack = (tr: Track) => {
    Alert.alert(
      "Delete track",
      `Remove "${tr.title}" from your music?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (playingId === tr.track_id && sound) {
                await sound.unloadAsync();
                setSound(null);
                setPlayingId(null);
              }
              await api.delete(`/music/${tr.track_id}`);
              await load();
            } catch (e: any) {
              Alert.alert("Delete failed", formatApiError(e));
            }
          },
        },
      ]
    );
  };

  const submitMusicRequest = async () => {
    const msg = requestText.trim();
    if (!msg) {
      Alert.alert("Enter a message", "Please describe the music you'd like added.");
      return;
    }
    setRequestSubmitting(true);
    try {
      await api.post("/music/requests", { message: msg });
      setRequestText("");
      setRequestModalOpen(false);
      await loadRequests();
      Alert.alert("Request sent", "The admin will review your music request.");
    } catch (e: any) {
      Alert.alert("Could not send", formatApiError(e));
    } finally {
      setRequestSubmitting(false);
    }
  };

  const deleteMyRequest = (r: MusicRequest) => {
    Alert.alert(
      "Delete request",
      "Remove this music request?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/music/requests/${r.request_id}`);
              await loadRequests();
            } catch (e: any) {
              Alert.alert("Delete failed", formatApiError(e));
            }
          },
        },
      ]
    );
  };

  const updateRequestStatus = async (r: MusicRequest, status: MusicRequest["status"]) => {
    try {
      await api.patch(`/music/requests/${r.request_id}`, { status });
      await loadRequests();
    } catch (e: any) {
      Alert.alert("Update failed", formatApiError(e));
    }
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
          <Text style={styles.h1}>Tasks</Text>
          <Text style={styles.sub}>
            Start each task, then mark done. 10 min minimum between completions.
          </Text>

          <View style={[styles.medCard, { marginTop: 16 }]}>
            <Text style={styles.medTitle}>Medicines</Text>
            <Text style={styles.sub}>
              Log each dose with a timestamp.
            </Text>
            <View style={styles.medAddRow}>
              <TextInput
                testID="medicine-name-input"
                style={[styles.input, { flex: 2 }]}
                value={medName}
                onChangeText={setMedName}
                placeholder="Medicine name"
                placeholderTextColor={COLORS.text3}
              />
              <TextInput
                testID="medicine-dose-input"
                style={[styles.input, { flex: 1 }]}
                value={medDose}
                onChangeText={setMedDose}
                placeholder="Dosage"
                placeholderTextColor={COLORS.text3}
              />
            </View>
            <TouchableOpacity
              testID="medicine-add-btn"
              style={styles.addBtn}
              onPress={addMedicine}
              disabled={medAdding}
            >
              {medAdding ? (
                <ActivityIndicator color="#0B0B0B" />
              ) : (
                <Text style={styles.addBtnText}>Add medicine</Text>
              )}
            </TouchableOpacity>
            {medicines.length === 0 ? (
              <Text style={[styles.sub, { marginTop: 10 }]}>
                No medicines yet. Add one to start logging doses.
              </Text>
            ) : (
              medicines.map((m) => (
                <View key={m.med_id} style={styles.medRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>
                      {m.name}
                      {m.dosage ? <Text style={styles.medDose}>  ·  {m.dosage}</Text> : null}
                    </Text>
                    <Text style={styles.medMeta}>
                      {m.last_taken
                        ? `Last taken: ${new Date(m.last_taken).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : "Not logged yet"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID={`medicine-take-${m.med_id}`}
                    style={styles.medTakeBtn}
                    onPress={() => logMedicine(m)}
                  >
                    <Ionicons name="time-outline" size={14} color="#0B0B0B" />
                    <Text style={styles.medTakeText}>Took it now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`medicine-delete-${m.med_id}`}
                    onPress={() => deleteMedicine(m)}
                    style={{ paddingLeft: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.e_red} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <View style={styles.addCard}>
            <TextInput
              testID="task-title-input"
              style={styles.input}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Add a new task"
              placeholderTextColor={COLORS.text3}
            />
            <View style={styles.intervalRow}>
              <Text style={styles.small}>Task duration</Text>
              <View style={styles.pillRow}>
                {INTERVALS.map((m) => (
                  <TouchableOpacity
                    key={`dur-${m}`}
                    testID={`task-new-duration-${m}`}
                    onPress={() => setNewDuration(m)}
                    style={[
                      styles.pill,
                      newDuration === m && { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        newDuration === m && { color: "#0B0B0B" },
                      ]}
                    >
                      {m}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.intervalRow}>
              <Text style={styles.small}>Check-in every</Text>
              <View style={styles.pillRow}>
                {INTERVALS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    testID={`task-new-interval-${m}`}
                    onPress={() => setNewInterval(m)}
                    style={[
                      styles.pill,
                      newInterval === m && { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        newInterval === m && { color: "#0B0B0B" },
                      ]}
                    >
                      {m}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              testID="task-add-btn"
              style={styles.addBtn}
              onPress={addTask}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator color="#0B0B0B" />
              ) : (
                <Text style={styles.addBtnText}>Add task</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ---------- Music section ---------- */}
          <View style={styles.musicCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.musicTitle}>Focus music</Text>
              {user?.role === "admin" && (
                <TouchableOpacity onPress={() => require("expo-router").router.push("/admin")}>
                  <Text style={{ color: COLORS.brand, fontWeight: "700" }}>Manage</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.sub}>
              Tap to play — loops while you work. Add your own or ask the admin for something new.
            </Text>

            {tracks.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                {tracks.map((t) => {
                  const isPlaying = playingId === t.track_id;
                  const isMine = t.is_mine;
                  return (
                    <TouchableOpacity
                      key={t.track_id}
                      testID={`track-play-${t.track_id}`}
                      onPress={() => playTrack(t)}
                      onLongPress={() => isMine && deleteMyTrack(t)}
                      delayLongPress={400}
                      style={[
                        styles.trackChip,
                        isPlaying && { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
                      ]}
                    >
                      <Ionicons
                        name={isPlaying ? "pause" : "play"}
                        size={16}
                        color={isPlaying ? "#fff" : COLORS.text}
                      />
                      <Text
                        style={[
                          styles.trackText,
                          isPlaying && { color: "#0B0B0B" },
                        ]}
                        numberOfLines={1}
                      >
                        {t.title}
                      </Text>
                      {isMine ? (
                        <View style={styles.mineBadge}>
                          <Text style={styles.mineBadgeText}>Mine</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={[styles.sub, { marginTop: 8 }]}>
                No tracks yet. Upload one below or request music from the admin.
              </Text>
            )}

            <View style={styles.musicActionsRow}>
              <TouchableOpacity
                testID="user-music-upload-btn"
                style={[styles.musicActionBtn, uploadingMusic && { opacity: 0.6 }]}
                onPress={uploadMyMusic}
                disabled={uploadingMusic}
                activeOpacity={0.85}
              >
                {uploadingMusic ? (
                  <ActivityIndicator color={COLORS.text} size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color={COLORS.text} />
                    <Text style={styles.musicActionText}>Upload my music</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="music-request-btn"
                style={[styles.musicActionBtn, { backgroundColor: COLORS.brand, borderColor: COLORS.brand }]}
                onPress={() => setRequestModalOpen(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="mail-outline" size={16} color="#0B0B0B" />
                <Text style={[styles.musicActionText, { color: "#0B0B0B" }]}>Request music</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hintText}>
              Long-press your own track to delete it. Max 5 MB per upload.
            </Text>
          </View>

          {/* My music requests */}
          {myRequests.length > 0 && (
            <View style={styles.musicCard}>
              <Text style={styles.musicTitle}>My music requests</Text>
              {myRequests.map((r) => (
                <View key={r.request_id} style={styles.requestRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestMsg} numberOfLines={3}>{r.message}</Text>
                    {r.admin_note ? (
                      <Text style={styles.requestNote}>Admin: {r.admin_note}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <View style={[styles.statusPill, statusPillStyle(r.status)]}>
                        <Text style={styles.statusPillText}>{prettyStatus(r.status)}</Text>
                      </View>
                      <Text style={styles.requestMeta}>
                        {new Date(r.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    testID={`request-delete-${r.request_id}`}
                    onPress={() => deleteMyRequest(r)}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.e_red} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Admin inline: incoming music requests */}
          {user?.role === "admin" && adminRequests.length > 0 && (
            <View style={[styles.musicCard, { borderColor: COLORS.brand }]}>
              <Text style={styles.musicTitle}>Incoming music requests (admin)</Text>
              <Text style={styles.sub}>Review requests from your users.</Text>
              {adminRequests.map((r) => (
                <View key={r.request_id} style={styles.requestRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestMsg}>{r.message}</Text>
                    <Text style={styles.requestMeta}>
                      From {r.user_name || r.user_email} · {new Date(r.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <View style={[styles.statusPill, statusPillStyle(r.status)]}>
                        <Text style={styles.statusPillText}>{prettyStatus(r.status)}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {r.status !== "fulfilled" && (
                        <TouchableOpacity
                          onPress={() => updateRequestStatus(r, "fulfilled")}
                          style={[styles.miniBtn, { backgroundColor: COLORS.brand, borderColor: COLORS.brand }]}
                        >
                          <Ionicons name="checkmark" size={13} color="#0B0B0B" />
                          <Text style={[styles.miniText, { color: "#0B0B0B" }]}>Fulfilled</Text>
                        </TouchableOpacity>
                      )}
                      {r.status !== "declined" && (
                        <TouchableOpacity
                          onPress={() => updateRequestStatus(r, "declined")}
                          style={styles.miniBtn}
                        >
                          <Ionicons name="close" size={13} color={COLORS.text} />
                          <Text style={styles.miniText}>Decline</Text>
                        </TouchableOpacity>
                      )}
                      {r.status !== "pending" && (
                        <TouchableOpacity
                          onPress={() => updateRequestStatus(r, "pending")}
                          style={styles.miniBtn}
                        >
                          <Ionicons name="refresh" size={13} color={COLORS.text} />
                          <Text style={styles.miniText}>Reset</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}


          <Text style={[styles.h2, { marginTop: 16 }]}>Your tasks</Text>
          {tasks.length === 0 ? (
            <Text style={styles.sub}>No tasks yet. Add one above.</Text>
          ) : (
            tasks.map((t) => (
              <View key={t.task_id} style={styles.taskCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle}>{t.title}</Text>
                  <Text style={styles.taskMeta}>
                    Status: {t.status.replace("_", " ")} · {t.duration_minutes ?? 10}-min task · Check-in: {t.notify_interval_minutes} min
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <TouchableOpacity
                      testID={`task-start-${t.task_id}`}
                      disabled={t.status !== "pending"}
                      style={[
                        styles.miniBtn,
                        t.status !== "pending" && { opacity: 0.4 },
                      ]}
                      onPress={() => check(t, "start")}
                    >
                      <Ionicons name="play" size={14} color={COLORS.text} />
                      <Text style={styles.miniText}>Start</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`task-done-${t.task_id}`}
                      disabled={t.status === "done"}
                      style={[
                        styles.miniBtn,
                        { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
                        t.status === "done" && { opacity: 0.4 },
                      ]}
                      onPress={() => check(t, "done")}
                    >
                      <Ionicons name="checkmark" size={14} color="#0B0B0B" />
                      <Text style={[styles.miniText, { color: "#0B0B0B" }]}>Done</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`task-interval-${t.task_id}`}
                      style={styles.miniBtn}
                      onPress={() => setIntervalModalFor(t)}
                    >
                      <Ionicons name="time-outline" size={14} color={COLORS.text} />
                      <Text style={styles.miniText}>Interval</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`task-delete-${t.task_id}`}
                      style={styles.miniBtn}
                      onPress={() => del(t)}
                    >
                      <Ionicons name="trash-outline" size={14} color={COLORS.e_red} />
                      <Text style={[styles.miniText, { color: COLORS.e_red }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={!!intervalModalFor}
        transparent
        animationType="fade"
        onRequestClose={() => setIntervalModalFor(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Notify me every…</Text>
            <Text style={styles.sub}>
              The app will check-in to ask if "{intervalModalFor?.title}" is done yet.
            </Text>
            <View style={[styles.pillRow, { marginTop: 12 }]}>
              {INTERVALS.map((m) => (
                <TouchableOpacity
                  key={m}
                  testID={`task-set-interval-${m}`}
                  style={[
                    styles.pill,
                    intervalModalFor?.notify_interval_minutes === m && {
                      backgroundColor: COLORS.brand,
                      borderColor: COLORS.brand,
                    },
                  ]}
                  onPress={() => intervalModalFor && setInterval(intervalModalFor.task_id, m)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      intervalModalFor?.notify_interval_minutes === m && { color: "#0B0B0B" },
                    ]}
                  >
                    {m} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => setIntervalModalFor(null)}
              style={[styles.addBtn, { backgroundColor: COLORS.bg3, marginTop: 14 }]}
            >
              <Text style={[styles.addBtnText, { color: COLORS.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Music request modal */}
      <Modal
        visible={requestModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRequestModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBg}
        >
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Request music from admin</Text>
            <Text style={styles.sub}>
              Tell the admin what you'd like to hear — song name, artist, genre, mood, or a link.
            </Text>
            <TextInput
              testID="music-request-input"
              style={[styles.input, { marginTop: 12, height: 120, textAlignVertical: "top" }]}
              value={requestText}
              onChangeText={setRequestText}
              placeholder="e.g. 'Lo-fi study beats by Chillhop' or 'Weightless by Marconi Union'"
              placeholderTextColor={COLORS.text3}
              multiline
              maxLength={1000}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={() => setRequestModalOpen(false)}
                style={[styles.addBtn, { flex: 1, backgroundColor: COLORS.bg3 }]}
              >
                <Text style={[styles.addBtnText, { color: COLORS.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="music-request-submit"
                onPress={submitMusicRequest}
                disabled={requestSubmitting || !requestText.trim()}
                style={[styles.addBtn, { flex: 1 }, (!requestText.trim() || requestSubmitting) && { opacity: 0.6 }]}
              >
                {requestSubmitting ? (
                  <ActivityIndicator color="#0B0B0B" />
                ) : (
                  <Text style={styles.addBtnText}>Send request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function prettyStatus(s: MusicRequest["status"]): string {
  if (s === "fulfilled") return "Fulfilled";
  if (s === "declined") return "Declined";
  return "Pending";
}

function statusPillStyle(s: MusicRequest["status"]) {
  if (s === "fulfilled") return { backgroundColor: "#DCFCE7", borderColor: "#16A34A" };
  if (s === "declined") return { backgroundColor: "#FEE2E2", borderColor: "#DC2626" };
  return { backgroundColor: "#FEF3C7", borderColor: "#D97706" };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  h1: { fontSize: 28, fontWeight: "800", color: COLORS.text },
  h2: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.text2, marginTop: 4 },
  small: { color: COLORS.text2, fontSize: 13 },
  addCard: {
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
  },
  intervalRow: { marginTop: 12 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg2,
  },
  pillText: { color: COLORS.text, fontWeight: "600" },
  addBtn: {
    backgroundColor: COLORS.brand,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  addBtnText: { color: "#0B0B0B", fontWeight: "700" },
  musicCard: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
  },
  musicTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  trackChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    marginRight: 8,
    maxWidth: 180,
  },
  trackText: { color: COLORS.text, fontWeight: "600", marginLeft: 2 },
  taskCard: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  taskTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  taskMeta: { color: COLORS.text2, marginTop: 4, fontSize: 13 },
  medCard: {
    backgroundColor: COLORS.bg2,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
  },
  medTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  medAddRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  medRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 12,
  },
  medName: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  medDose: { color: COLORS.text2, fontWeight: "600", fontSize: 13 },
  medMeta: { color: COLORS.text3, marginTop: 2, fontSize: 12 },
  medTakeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
  },
  medTakeText: { color: "#0B0B0B", fontWeight: "800", fontSize: 13 },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  miniText: { color: COLORS.text, fontWeight: "700", fontSize: 13 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: COLORS.bg2,
    borderRadius: 20,
    padding: 20,
  },
  mineBadge: {
    marginLeft: 6,
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mineBadgeText: { fontSize: 10, fontWeight: "800", color: COLORS.text },
  musicActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  musicActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  musicActionText: { color: COLORS.text, fontWeight: "700", fontSize: 14 },
  hintText: { color: COLORS.text3, marginTop: 8, fontSize: 12 },
  requestRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 8,
  },
  requestMsg: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  requestNote: {
    color: COLORS.text2,
    fontSize: 13,
    marginTop: 4,
    fontStyle: "italic",
  },
  requestMeta: { color: COLORS.text3, fontSize: 12 },
  iconBtn: { padding: 8 },
  statusPill: {
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusPillText: { fontSize: 11, fontWeight: "800", color: "#0B0B0B" },
});
