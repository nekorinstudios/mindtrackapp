// Notifications are disabled in Expo Go for SDK 54+.
// For push/local notifications, create a dev build and wire expo-notifications here.

export async function scheduleDailyAppReminder(): Promise<boolean> {
  return false;
}

export async function scheduleTaskInterval(
  _taskId: string,
  _taskTitle: string,
  _intervalMinutes: number,
  _count: number = 6
): Promise<string[]> {
  return [];
}

export async function cancelNotificationIds(_ids: string[]): Promise<void> {
  return;
}
