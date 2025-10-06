// Lightweight module declarations so TypeScript won't error when we dynamically import
// expo packages at runtime in an Expo-enabled build/device.

declare module 'expo-notifications' {
  const _default: any;
  export default _default;
  export const getPermissionsAsync: any;
  export const requestPermissionsAsync: any;
  export const getExpoPushTokenAsync: any;
  export const getPermissions: any;
}

declare module 'expo-device' {
  const _default: any;
  export default _default;
  export const isDevice: boolean;
}
