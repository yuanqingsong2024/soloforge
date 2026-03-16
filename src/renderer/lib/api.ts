const DEV_API_PORT = 13789

function getApiPortFromUrl(): number | null {
  if (typeof window === 'undefined') {
    return null
  }

  const searchParams = new URLSearchParams(window.location.search)
  const apiPort = searchParams.get('apiPort')
  if (!apiPort) {
    return null
  }

  const parsed = Number(apiPort)
  return Number.isFinite(parsed) ? parsed : null
}

export async function getApiPort(): Promise<number> {
  const apiPortFromUrl = getApiPortFromUrl()
  if (apiPortFromUrl !== null) {
    return apiPortFromUrl
  }

  if (typeof window !== 'undefined' && typeof window.electronAPI?.getApiPort === 'function') {
    return window.electronAPI.getApiPort()
  }

  return DEV_API_PORT
}
