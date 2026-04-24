import React, { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ImageBackground } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { COLORS } from "../src/api";

export default function Landing() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user === undefined) return;
    if (user) {
      if (!user.disorders || user.disorders.length === 0) {
        router.replace("/onboarding");
      } else {
        router.replace("/(tabs)/home");
      }
    }
  }, [user, router]);

  if (user === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }

  return (
    <ImageBackground
      source={{
        uri: "https://images.unsplash.com/photo-1763584107441-bdb2fd9041b5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwyfHxjYWxtaW5nJTIwc2FuZCUyMHRleHR1cmV8ZW58MHx8fHwxNzc3MDI3Nzc0fDA&ixlib=rb-4.1.0&q=85",
      }}
      style={styles.bg}
      imageStyle={{ opacity: 0.35 }}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.brand}>MindTrack</Text>
            <Text style={styles.tagline}>
              Daily wellness tracking for ADHD, Bipolar & Autism.
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              testID="landing-signup-btn"
              style={styles.primary}
              onPress={() => router.push("/signup")}
            >
              <Text style={styles.primaryText}>Create account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="landing-login-btn"
              style={styles.outline}
              onPress={() => router.push("/login")}
            >
              <Text style={styles.outlineText}>I already have an account</Text>
            </TouchableOpacity>
            <Text style={styles.finePrint}>
              Your entries stay private. We never share your data.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
  bg: { flex: 1, backgroundColor: COLORS.bg3 },
  safe: { flex: 1 },
  content: { flex: 1, padding: 24, justifyContent: "space-between" },
  hero: { marginTop: 48 },
  brand: { fontSize: 44, fontWeight: "800", color: COLORS.text, letterSpacing: -1 },
  tagline: { marginTop: 12, fontSize: 18, color: COLORS.text2, lineHeight: 26 },
  actions: { gap: 12, marginBottom: 24 },
  primary: {
    backgroundColor: COLORS.brand,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  outline: {
    borderWidth: 2,
    borderColor: COLORS.brand,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  outlineText: { color: COLORS.brand, fontWeight: "700", fontSize: 16 },
  finePrint: { textAlign: "center", color: COLORS.text3, fontSize: 12, marginTop: 8 },
});
