import { PrismaClient } from '@prisma/client'
import { OpenClawClient } from './openclaw-client'
import { KeychainService } from './keychain'

const prisma = new PrismaClient()

export async function resolveWorkspaceOpenClawClient(workspaceId: string): Promise<{ profileId: string; client: OpenClawClient }> {
  const defaultProfile = await prisma.workspaceProfile.findFirst({
    where: { workspaceId, isDefault: true }
  })
  const fallbackProfile = defaultProfile
    ? null
    : await prisma.workspaceProfile.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' }
      })

  const profileId = (defaultProfile || fallbackProfile)?.profileId
  if (!profileId) {
    throw new Error('Workspace 未绑定任何 ConnectionProfile，无法访问 OpenClaw')
  }

  const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
  if (!profile) {
    throw new Error('ConnectionProfile 不存在')
  }

  const token = await KeychainService.getPassword(workspaceId, `${profile.name}-token`)
  const password = await KeychainService.getPassword(workspaceId, `${profile.name}-password`)
  const edgeToken = await KeychainService.getPassword(workspaceId, `${profile.name}-edge-token`)

  const client = new OpenClawClient({
    name: profile.name,
    baseUrl: profile.baseUrl,
    wsUrl: profile.wsUrl,
    authMode: profile.authMode as 'token' | 'password' | 'trusted-proxy',
    token: token || undefined,
    password: password || undefined,
    edgeToken: edgeToken || undefined,
    eventPath: profile.eventPath || undefined
  })

  return { profileId, client }
}
