import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { connectionListSchema, type SavedConnection } from './schema';

const CONNECTIONS = 'ivaldi.native.connections.v1';
const ACTIVE = 'ivaldi.native.active.v1';
const secretKey = (id: string) => `ivaldi.native.token.${id}`;
let writes = Promise.resolve();
export function serializeWrite(operation: () => Promise<void>) {
  const next = writes.catch(() => undefined).then(operation);
  writes = next;
  return next;
}
export async function readConnections() {
  const raw = await AsyncStorage.getItem(CONNECTIONS);
  return raw === null ? [] : connectionListSchema.parse(JSON.parse(raw));
}
export const readActiveConnection = () => AsyncStorage.getItem(ACTIVE);
export const readToken = (id: string) => SecureStore.getItemAsync(secretKey(id));
// Keep newly issued credentials even if navigation cancelled their connection
// attempt. Only the accepted attempt may separately change ACTIVE.
export async function saveConnection(connection: SavedConnection, token: string | null) {
  await serializeWrite(async () => {
    if (token) await SecureStore.setItemAsync(secretKey(connection.id), token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    const previous = await readConnections();
    await AsyncStorage.setItem(CONNECTIONS, JSON.stringify([connection, ...previous.filter(item => item.id !== connection.id)]));
  });
}
export const setActiveConnection = (id: string) => serializeWrite(() => AsyncStorage.setItem(ACTIVE, id));
export async function forgetConnection(id: string) {
  await serializeWrite(async () => {
    const previous = await readConnections();
    await AsyncStorage.setItem(CONNECTIONS, JSON.stringify(previous.filter(item => item.id !== id)));
    if (await readActiveConnection() === id) await AsyncStorage.removeItem(ACTIVE);
    await SecureStore.deleteItemAsync(secretKey(id));
  });
}
