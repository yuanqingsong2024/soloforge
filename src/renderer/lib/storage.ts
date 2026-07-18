const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readLocalStorage(key: string, fallback = ''): string {
  const storage = getStorage()
  if (!storage) {
    return fallback
  }

  try {
    return storage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

export function writeLocalStorage(key: string, value: string): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(key, value)
  } catch {
    return
  }
}

export function readWorkspaceId(): string {
  return readLocalStorage('soloforge-current-workspace', DEFAULT_WORKSPACE_ID)
}
