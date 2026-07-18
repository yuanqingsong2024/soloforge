import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, type Page, type TestInfo, _electron as electron, type ElectronApplication } from '@playwright/test'

export interface E2EAppContext {
  app: ElectronApplication
  page: Page
}

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const projectRoot = path.resolve(currentDirPath, '..', '..', '..')
const require = createRequire(import.meta.url)

async function resolveMainEntry(): Promise<string> {
  return path.join(projectRoot, 'dist-electron', 'main', 'index.js')
}

export async function launchElectronApp(testInfo: TestInfo, scenario: string = 'default'): Promise<E2EAppContext> {
  const electronBinary = require('electron') as string
  const mainEntry = await resolveMainEntry()

  const app = await electron.launch({
    executablePath: electronBinary,
    args: [mainEntry],
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SOLOFORGE_E2E: '1',
      SOLOFORGE_E2E_DASHBOARD_SCENARIO: scenario
    }
  })

  const page = await app.firstWindow()
  page.on('console', message => {
    testInfo.attach(`renderer-console-${Date.now()}`, {
      body: `[${message.type()}] ${message.text()}`,
      contentType: 'text/plain'
    }).catch(() => undefined)
  })

  await page.waitForLoadState('domcontentloaded')
  await page.waitForURL(url => url.protocol === 'file:' || url.protocol === 'http:' || url.protocol === 'https:')
  await page.evaluate(() => {
    localStorage.setItem('soloforge-current-workspace', '00000000-0000-0000-0000-000000000001')
    localStorage.setItem('soloforge-dashboard-mode', 'global')
    window.location.hash = '#/'
  })
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('dashboard-page')).toBeVisible()

  return { app, page }
}

export async function closeElectronApp(context: E2EAppContext): Promise<void> {
  await context.app.close()
}

export async function waitForDashboardReady(page: Page): Promise<void> {
  await expect(page.getByTestId('dashboard-page')).toBeVisible()
  await expect(page.getByTestId('dashboard-global-overview')).toBeVisible()
  await expect(page.getByTestId('dashboard-critical-issues')).toBeVisible()
  await expect(page.getByTestId('dashboard-pending-actions')).toBeVisible()
  await expect(page.getByTestId('dashboard-activity-feed-preview')).toBeVisible()
}

export async function openDashboard(page: Page): Promise<void> {
  await page.getByTestId('sidebar-link-dashboard').click()
  await waitForDashboardReady(page)
}

export async function switchWorkspace(page: Page, workspaceId: string): Promise<void> {
  await page.getByTestId('dashboard-workspace-mode-current').click()
  await page.getByTestId('dashboard-workspace-switcher').selectOption(workspaceId)
}
