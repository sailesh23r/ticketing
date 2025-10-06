declare module 'web-push' {
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(subscription: unknown, payload?: string | Buffer | object): Promise<unknown>;
  export const generateVAPIDKeys: () => { publicKey: string; privateKey: string };
}
