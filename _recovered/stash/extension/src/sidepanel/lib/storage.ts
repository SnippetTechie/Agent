/**
 * Thin wrappers over chrome.storage — two areas, two lifetimes:
 * - session: survives the side panel closing/reopening within the same
 *   browser session, cleared on browser restart (what makes "Clear
 *   Session" meaningful). Used for turns/audit log.
 * - local: survives browser restarts. Used only for durable preferences
 *   (language, mute, approval mode, and whether the privacy notice has
 *   been acknowledged) — never for conversation content.
 * Both fall back to an in-memory object outside an extension context.
 */
const sessionMemoryStore = new Map<string, unknown>();
const localMemoryStore = new Map<string, unknown>();

function hasChromeSessionStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.session;
}

function hasChromeLocalStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

export async function loadState<T>(key: string): Promise<T | undefined> {
  if (!hasChromeSessionStorage()) return sessionMemoryStore.get(key) as T | undefined;
  const result = await chrome.storage.session.get(key);
  return result[key] as T | undefined;
}

export async function saveState<T>(key: string, value: T): Promise<void> {
  if (!hasChromeSessionStorage()) {
    sessionMemoryStore.set(key, value);
    return;
  }
  await chrome.storage.session.set({ [key]: value });
}

export async function clearState(key: string): Promise<void> {
  if (!hasChromeSessionStorage()) {
    sessionMemoryStore.delete(key);
    return;
  }
  await chrome.storage.session.remove(key);
}

export async function loadLocalState<T>(key: string): Promise<T | undefined> {
  if (!hasChromeLocalStorage()) return localMemoryStore.get(key) as T | undefined;
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

export async function saveLocalState<T>(key: string, value: T): Promise<void> {
  if (!hasChromeLocalStorage()) {
    localMemoryStore.set(key, value);
    return;
  }
  await chrome.storage.local.set({ [key]: value });
}
