import type { Page } from '@playwright/test'

export async function getApiPort(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const params = new URLSearchParams(window.location.search)
    const portValue = params.get('apiPort')
    if (!portValue) {
      throw new Error('无法获取 apiPort')
    }

    const port = Number(portValue)
    if (!Number.isFinite(port)) {
      throw new Error('apiPort 无效')
    }

    return port
  })
}

export async function apiJson<T>(page: Page, path: string, init?: RequestInit): Promise<T> {
  return await page.evaluate(async ({ path, init }) => {
    const params = new URLSearchParams(window.location.search)
    const portValue = params.get('apiPort')
    if (!portValue) {
      throw new Error('无法获取 apiPort')
    }

    const port = Number(portValue)
    if (!Number.isFinite(port)) {
      throw new Error('apiPort 无效')
    }

    const response = await fetch(`http://127.0.0.1:${port}${path}`, init)
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(typeof body === 'object' && body && 'error' in body ? String((body as { error?: string }).error) : `请求失败：${response.status}`)
    }

    return body as T
  }, { path, init })
}
