import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export async function scheduleDailyAppReminder() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    let allowed = status === "granted";
    if (!allowed) {
      const req = await Notifications.requestPermissionsAsync();
      allowed = req.status === "granted";
    }
    if (!allowed) return false;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Cancel existing daily reminders to avoid duplicates
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if ((n.content as any)?.data?.kind === "daily-reminder") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "MindTrack",
        body: "Have you used the app today? Log your symptoms and energy!",
        data: { kind: "daily-reminder" },
      },
      trigger: {
        hour: 20,
        minute: 0,
        repeats: true,
      } as any,
    });
    return true;
  } catch {
    return false;
  }
}

export async function scheduleTaskInterval(
  taskId: string,
  taskTitle: string,
  intervalMinutes: number,
  count: number = 6
) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== "granted") return [];
    }
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Task check-in: ${taskTitle}`,
          body: `Is "${taskTitle}" done yet?`,
          data: { kind: "task-check", taskId },
        },
        trigger: {
          seconds: intervalMinutes * 60 * i,
        } as any,
      });
      ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

export async function cancelNotificationIds(ids: string[]) {
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {}
  }
}
