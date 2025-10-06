// Utility to register Expo push token on device and persist via provided record function
// This module dynamically imports `expo-notifications` and `expo-device` so it won't break web builds.

export async function registerExpoPushToken(recordFn: (token: string) => Promise<unknown>) {
  // Use eval to avoid bundlers trying to statically resolve expo packages in non-Expo builds.
  // The dynamic import will fail if expo packages are not installed in the running environment.
  try {
  const NotificationsModule = await eval("import('expo-notifications')");
  const DeviceModule = await eval("import('expo-device')");

    const Notifications = NotificationsModule.default ?? NotificationsModule;
    const Device = DeviceModule.default ?? DeviceModule;

    if (!Device || !Device.isDevice) {
      throw new Error('Push notifications require a physical device (Expo)');
    }

    const settings = await Notifications.getPermissionsAsync();
    let finalStatus = settings.granted;
    if (!finalStatus) {
      const request = await Notifications.requestPermissionsAsync();
      finalStatus = request.granted;
    }

    if (!finalStatus) {
      throw new Error('Permission for notifications was denied');
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (!token) throw new Error('Failed to obtain Expo push token');

    await recordFn(String(token));
    return token;
  } catch (err: unknown) {
    // Surface a friendly message to caller
    let msg = 'Failed to register Expo push token'
    if (typeof err === 'string') msg = err
    else if (err && typeof (err as { message?: unknown }).message === 'string') msg = (err as { message?: string }).message as string
    throw new Error(msg)
  }
}
