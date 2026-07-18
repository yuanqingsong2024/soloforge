/**
 * OpenClaw 连接 / 配置 / 网关 路由模块
 *
 * 包含：Setup Wizard, Connection Profiles, Health Check, OpenClaw Client,
 * OpenClaw Config, Config Snapshots, Config Drafts, Gateway
 */

import { type FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'node:crypto'
import { KeychainService } from '../keychain'
import { ConfigManager } from '../config-manager'
import { GatewayValidator, type GatewayConfig } from '../gateway-validator'
import { ApprovalGuard } from '../approval-guard'
import { DeploymentTemplateFactory, LocalDockerTemplate } from '../deployment-templates'
import {
  createOpenClawClientFromProfile,
  ensureOpenClawClientConnected,
  buildLocalOpenClawStartCommand
} from '../openclaw-helpers'
import {
  prisma,
  openClawClients,
  ok,
  fail,
  toErrorMessage,
  writeApiAuditLog,
  emitApiEvent,
  safeParseJson,
  isPlainRecord,
  readRequiredString,
  sanitizeDraftContent,
  TEST_WORKSPACE_ID
} from '../api-shared'
import { writeAuditLog } from '../audit-log-writer'

// ==================== JSON Schema 定义 ====================

const createProfileBodySchema = {
  body: {
    type: 'object',
    required: ['name', 'baseUrl', 'wsUrl', 'authMode'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      baseUrl: { type: 'string' },
      wsUrl: { type: 'string' },
      authMode: { type: 'string', enum: ['token', 'password', 'trusted-proxy'] },
      eventPath: { type: 'string' },
      token: { type: 'string' },
      password: { type: 'string' },
      edgeToken: { type: 'string' }
    }
  }
}

// ==================== 辅助函数 ====================

function isSafeDockerImageName(imageName: string): boolean {
  return /^[a-z0-9]+(?:[._/-][a-z0-9]+)*(?::[A-Za-z0-9][A-Za-z0-9._-]{0,127})?$/.test(imageName)
}

function validateConfigApplyBody(raw: unknown): { profileId: string; config: unknown } {
  if (!isPlainRecord(raw)) {
    throw new Error('请求体必须是 JSON 对象')
  }
  const profileId = readRequiredString(raw, 'profileId')
  if (!('config' in raw) || raw.config === null || raw.config === undefined) {
    throw new Error('config 不能为空')
  }
  if (!isPlainRecord(raw.config)) {
    throw new Error('config 必须是 JSON 对象')
  }
  return { profileId, config: raw.config }
}

function validateConfigRollbackBody(raw: unknown): { profileId: string; snapshotId: string } {
  if (!isPlainRecord(raw)) {
    throw new Error('请求体必须是 JSON 对象')
  }
  return {
    profileId: readRequiredString(raw, 'profileId'),
    snapshotId: readRequiredString(raw, 'snapshotId')
  }
}

// ==================== 路由注册 ====================

export function registerOpenClawRoutes(fastify: FastifyInstance): void {
  // ==================== Setup Wizard ====================
  fastify.get('/api/setup/status', async (request) => {
    try {
      // 获取当前 workspace ID（从 localStorage 或默认值）
      const workspaceId = (request.query as { workspaceId?: string }).workspaceId || '00000000-0000-0000-0000-000000000001'
      
      // 查询 workspace
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }
      })
      
      if (!workspace) {
        return {
          setupCompleted: false,
          currentWorkspaceId: workspaceId,
          missingSteps: ['workspace_not_found']
        }
      }
      
      // 如果已标记完成，直接返回
      if (workspace.setupCompleted) {
        return {
          setupCompleted: true,
          currentWorkspaceId: workspaceId,
          missingSteps: []
        }
      }
      
      // 检测缺失项
      const missingSteps: string[] = []
      
      // 1. 检查是否存在 ConnectionProfile
      const profileCount = await prisma.connectionProfile.count()
      if (profileCount === 0) {
        missingSteps.push('no_profile')
      }
      
      // 2. 检查当前 Workspace 是否有默认 WorkspaceProfile 绑定
      const defaultProfile = await prisma.workspaceProfile.findFirst({
        where: {
          workspaceId,
          isDefault: true
        },
        include: {
          profile: true
        }
      })
      
      if (!defaultProfile) {
        missingSteps.push('no_binding')
      } else {
        // 3. 检查默认 profile 是否有凭证
        const token = await KeychainService.getPassword(`${defaultProfile.profile.name}-token`)
        const password = await KeychainService.getPassword(`${defaultProfile.profile.name}-password`)
        
        if (!token && !password) {
          missingSteps.push('no_credentials')
        }
        
        // 4. 检查最近一次 ping 状态
        if (defaultProfile.profile.lastHealthStatus !== 'healthy') {
          missingSteps.push('ping_failed')
        }
      }
      
      return {
        setupCompleted: false,
        currentWorkspaceId: workspaceId,
        missingSteps
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error({ err: errMsg }, '检测配置状态失败')
      throw new Error(`检测配置状态失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/setup/complete', async (request) => {
    const traceId = uuidv4()
    
    try {
      const { workspaceId } = request.body as { workspaceId: string }
      
      if (!workspaceId) {
        throw new Error('workspaceId 是必需的')
      }
      
      // 更新 workspace
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { setupCompleted: true }
      })
      
      // 写入审计日志
      await writeAuditLog({
        traceId,
        workspaceId,
        actor: 'user',
        action: 'SETUP_COMPLETED',
        tool: 'setup-wizard',
        request: { workspaceId },
        response: { success: true }
      })
      
      return { success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      fastify.log.error({ traceId, err: errMsg }, '标记配置完成失败')
      
      // 写入失败审计日志
      try {
        await writeAuditLog({
          traceId,
          actor: 'user',
          action: 'SETUP_COMPLETED',
          tool: 'setup-wizard',
          request: request.body,
          response: { success: false, error: errMsg }
        })
      } catch (logError) {
        const logMsg = logError instanceof Error ? logError.message : String(logError)
        fastify.log.error({ traceId, err: logMsg }, '写入审计日志失败：SETUP_COMPLETED')
      }
      
      throw new Error(`标记配置完成失败：${errMsg}`)
    }
  })
  
  // ==================== Connection Profiles ====================
  fastify.get('/api/profiles', async () => {
    return await prisma.connectionProfile.findMany()
  })
  
  fastify.post('/api/profiles', { schema: createProfileBodySchema }, async (request, reply) => {
    const { name, baseUrl, wsUrl, authMode, token, password, edgeToken } = request.body as {
      name: string
      baseUrl: string
      wsUrl: string
      authMode: string
      token?: string
      password?: string
      edgeToken?: string
      eventPath?: string
    }
    
    // 检查是否已存在同名配置
    const existing = await prisma.connectionProfile.findUnique({ where: { name } })
    if (existing) {
      reply.code(409)
      return { message: `连接名称 "${name}" 已存在，请使用其他名称` }
    }
    
    // 存储敏感信息到 Keychain
    if (token) {
      await KeychainService.setPassword(`${name}-token`, token)
    }
    if (password) {
      await KeychainService.setPassword(`${name}-password`, password)
    }
    if (edgeToken) {
      await KeychainService.setPassword(`${name}-edge-token`, edgeToken)
    }
    
    // 只存储非敏感信息到数据库
    return await prisma.connectionProfile.create({
      data: { name, baseUrl, wsUrl, authMode }
    })
  })
  
  fastify.get('/api/profiles/:id/credentials', async (request) => {
    const { id } = request.params as { id: string }
    const profile = await prisma.connectionProfile.findUnique({ where: { id } })
    if (!profile) throw new Error('Profile not found')
    
    const token = await KeychainService.getPassword(`${profile.name}-token`)
    const password = await KeychainService.getPassword(`${profile.name}-password`)
    const edgeToken = await KeychainService.getPassword(`${profile.name}-edge-token`)
    
    return {
      token: KeychainService.maskValue(token),
      password: KeychainService.maskValue(password),
      edgeToken: KeychainService.maskValue(edgeToken),
      hasToken: !!token,
      hasPassword: !!password,
      hasEdgeToken: !!edgeToken
    }
  })
  
  // ==================== Health Check ====================
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })
  
  // ==================== Connection Profiles Extended ====================
  fastify.put('/api/profiles/:id', async (request) => {
    const { id } = request.params as { id: string }
    const { name, baseUrl, wsUrl, authMode, token, password, edgeToken } = request.body as {
      name?: string; baseUrl?: string; wsUrl?: string; authMode?: string
      token?: string; password?: string; edgeToken?: string
    }
    
    const profile = await prisma.connectionProfile.findUnique({ where: { id } })
    if (!profile) throw new Error('Profile not found')
    
    const profileName = name || profile.name
    
    if (token) await KeychainService.setPassword(`${profileName}-token`, token)
    if (password) await KeychainService.setPassword(`${profileName}-password`, password)
    if (edgeToken) await KeychainService.setPassword(`${profileName}-edge-token`, edgeToken)
    
    return await prisma.connectionProfile.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(baseUrl && { baseUrl }),
        ...(wsUrl && { wsUrl }),
        ...(authMode && { authMode })
      }
    })
  })
  
  fastify.delete('/api/profiles/:id', async (request) => {
    const { id } = request.params as { id: string }
    const profile = await prisma.connectionProfile.findUnique({ where: { id } })
    if (!profile) throw new Error('Profile not found')
    
    // 清理 Keychain
    await KeychainService.deletePassword(`${profile.name}-token`)
    await KeychainService.deletePassword(`${profile.name}-password`)
    await KeychainService.deletePassword(`${profile.name}-edge-token`)
    
    // 断开连接
    const client = openClawClients.get(id)
    if (client) {
      client.disconnect()
      openClawClients.delete(id)
    }
    
    return await prisma.connectionProfile.delete({ where: { id } })
  })
  
  // ==================== OpenClaw Client ====================
  fastify.post('/api/openclaw/ping', async (request) => {
    const { profileId } = request.body as { profileId: string }
  
    const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
    if (!profile) throw new Error('Profile not found')
  
    const client = await createOpenClawClientFromProfile(profile)
  
    const result = await client.ping()
    
    // 更新健康检查状态
    await prisma.connectionProfile.update({
      where: { id: profileId },
      data: {
        lastHealthCheck: new Date(),
        lastHealthStatus: result.success ? 'healthy' : 'unhealthy'
      }
    })
    
    return result
  })
  
  fastify.post('/api/openclaw/detect', async (request) => {
    const { workspaceId } = request.body as { workspaceId?: string }
    const traceId = uuidv4()
    const resolvedWorkspaceId = workspaceId || TEST_WORKSPACE_ID
  
    try {
      const { OpenClawDetectorService } = await import('../openclaw-detector')
      const detector = new OpenClawDetectorService()
      const result = await detector.detect()
  
      const detectionId = await detector.saveDetection(
        resolvedWorkspaceId,
        result
      )
  
      await writeApiAuditLog({
        ticketId: undefined,
        traceId,
        actor: 'admin',
        action: 'OPENCLAW_DETECTED',
        tool: 'openclaw-detector',
        request: { workspaceId },
        response: { detectionId, detection: result }
      })
  
      return { success: true, detection: result, detectionId }
    } catch (error) {
      await writeApiAuditLog({
        ticketId: undefined,
        traceId,
        actor: 'admin',
        action: 'OPENCLAW_DETECT_FAILED',
        tool: 'openclaw-detector',
        request: { workspaceId },
        response: { success: false, error: String(error) }
      })
      throw error
    }
  })
  
  fastify.post('/api/openclaw/start', async (request, reply) => {
    const traceId = uuidv4()
    const { workspaceId, detectionId, port = 18789, mode } = request.body as {
      workspaceId?: string
      detectionId?: string
      port?: number
      mode?: 'docker' | 'native' | 'auto'
    }
  
    try {
      const detection = detectionId
        ? await prisma.openClawDetection.findUnique({ where: { id: detectionId } })
        : null
  
      if (!detection) {
        reply.code(400)
        return fail('缺少有效的检测记录，无法判断启动方式')
      }
  
      const details = detection.detailsJson ? JSON.parse(detection.detailsJson) as {
        docker?: { available?: boolean; running?: boolean; containerName?: string; image?: string; status?: string }
        installation?: { available?: boolean; executablePath?: string }
      } : {}
  
      const dockerInfo = details.docker
      const installationInfo = details.installation
  
      if (mode === 'docker') {
        if (!dockerInfo?.available) {
          reply.code(400)
          return fail('当前检测结果没有可启动的 Docker 容器')
        }
  
        const template = DeploymentTemplateFactory.getTemplate('LOCAL_DOCKER')
        const result = await template.start({ port, projectName: 'openclaw-gateway' })
  
        await writeApiAuditLog({
          traceId,
          actor: 'admin',
          action: 'OPENCLAW_START',
          tool: 'openclaw-detector',
          request: { workspaceId, detectionId, port, mode: 'docker' },
          response: result
        })
  
        return { success: result.success, message: result.message, mode: 'docker' as const }
      }
  
      if (mode !== 'native' && dockerInfo?.available) {
        const template = DeploymentTemplateFactory.getTemplate('LOCAL_DOCKER')
        const result = await template.start({ port, projectName: 'openclaw-gateway' })
  
        await writeApiAuditLog({
          traceId,
          actor: 'admin',
          action: 'OPENCLAW_START',
          tool: 'openclaw-detector',
          request: { workspaceId, detectionId, port, mode: 'docker' },
          response: result
        })
  
        return { success: result.success, message: result.message, mode: 'docker' as const }
      }
  
      if (!installationInfo?.available) {
        reply.code(400)
        return fail('未找到可启动的 OpenClaw 安装痕迹')
      }
  
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)
      const commandInfo = buildLocalOpenClawStartCommand({
        executablePath: installationInfo.executablePath,
        port
      })
  
      const result = await execAsync(commandInfo.command)
  
      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'OPENCLAW_START',
        tool: 'openclaw-detector',
        request: { workspaceId, detectionId, port, mode: 'native', workDir: commandInfo.workDir },
        response: { success: true, stdout: result.stdout }
      })
  
      return { success: true, message: 'OpenClaw 已启动', mode: 'native' as const }
    } catch (error) {
      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'OPENCLAW_START_FAILED',
        tool: 'openclaw-detector',
        request: { workspaceId, detectionId, port },
        response: { success: false, error: String(error) }
      })
  
      reply.code(500)
      return fail(`启动 OpenClaw 失败：${String(error)}`)
    }
  })
  
  fastify.post('/api/openclaw/auto-bootstrap', async (request) => {
    const { 
      workspaceId = TEST_WORKSPACE_ID,
      imageName = 'openclaw/gateway:latest',
      skipDeploy = false 
    } = request.body as { workspaceId?: string; imageName?: string; skipDeploy?: boolean }
    
    const traceId = uuidv4()
    const steps: Array<{ step: string; status: string; message?: string; error?: string; result?: unknown }> = []
    
    try {
      // Step 1: 检测
      steps.push({ step: 'detect', status: 'running' })
      const { OpenClawDetectorService } = await import('../openclaw-detector')
      const detector = new OpenClawDetectorService()
      const detection = await detector.detect()
      steps[0].status = 'completed'
      steps[0].result = detection
      
      if (!detection.detected && !skipDeploy) {
        // Step 2: 检查镜像
        steps.push({ step: 'check_image', status: 'running' })
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execFileAsync = promisify(execFile)
        
        try {
          const { stdout } = await execFileAsync('docker', ['images', imageName, '--format', '{{.Repository}}:{{.Tag}}'])
          const imageExists = stdout.trim().length > 0
          
          if (!imageExists) {
            steps[1].status = 'failed'
            steps[1].error = `镜像 ${imageName} 不存在，请先构建或拉取镜像`
            
            await writeApiAuditLog({
              traceId,
              actor: 'admin',
              action: 'OPENCLAW_AUTO_BOOTSTRAP_FAILED',
              tool: 'openclaw-bootstrap',
              request: JSON.stringify({ workspaceId, imageName, skipDeploy }),
              response: JSON.stringify({ success: false, steps })
            })
            
            return { success: false, steps, message: '镜像不存在' }
          }
          steps[1].status = 'completed'
        } catch (error) {
          steps[1].status = 'failed'
          steps[1].error = `Docker 不可用: ${String(error)}`
          
          await writeApiAuditLog({
            traceId,
            actor: 'admin',
            action: 'OPENCLAW_AUTO_BOOTSTRAP_FAILED',
            tool: 'openclaw-bootstrap',
            request: JSON.stringify({ workspaceId, imageName, skipDeploy }),
            response: JSON.stringify({ success: false, steps })
          })
          
          return { success: false, steps, message: 'Docker 不可用' }
        }
        
        // Step 3: 部署
        steps.push({ step: 'deploy', status: 'running' })
        const template = new LocalDockerTemplate()
        
        try {
          const deployResult = await template.install({
            port: 18789,
            version: imageName.split(':')[1] || 'latest',
            projectName: 'openclaw-gateway'
          })
          
          if (!deployResult.success) {
            steps[2].status = 'failed'
            steps[2].error = deployResult.message
            
            await writeApiAuditLog({
              traceId,
              actor: 'admin',
              action: 'OPENCLAW_AUTO_BOOTSTRAP_FAILED',
              tool: 'openclaw-bootstrap',
              request: JSON.stringify({ workspaceId, imageName, skipDeploy }),
              response: JSON.stringify({ success: false, steps })
            })
            
            return { success: false, steps }
          }
          steps[2].status = 'completed'
        } catch (error) {
          steps[2].status = 'failed'
          steps[2].error = String(error)
          
          await writeApiAuditLog({
            traceId,
            actor: 'admin',
            action: 'OPENCLAW_AUTO_BOOTSTRAP_FAILED',
            tool: 'openclaw-bootstrap',
            request: JSON.stringify({ workspaceId, imageName, skipDeploy }),
            response: JSON.stringify({ success: false, steps })
          })
          
          return { success: false, steps }
        }
        
        // Step 4: 健康检查（30秒超时，2秒间隔）
        steps.push({ step: 'health_check', status: 'running' })
        let healthy = false
        
        for (let i = 0; i < 15; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          try {
            const healthResult = await template.healthCheck({ port: 18789 })
            if (healthResult.healthy) {
              healthy = true
              break
            }
          } catch (error) {
            // 继续重试
          }
        }
        
        if (!healthy) {
          steps[3].status = 'failed'
          steps[3].error = '健康检查超时（30秒）'
          
          // 自动清理
          try {
            await template.stop({ projectName: 'openclaw-gateway' })
          } catch (cleanupError) {
            // 清理失败也记录
          }
          
          await writeApiAuditLog({
            traceId,
            actor: 'admin',
            action: 'OPENCLAW_AUTO_BOOTSTRAP_FAILED',
            tool: 'openclaw-bootstrap',
            request: JSON.stringify({ workspaceId, imageName, skipDeploy }),
            response: JSON.stringify({ success: false, steps })
          })
          
          return { success: false, steps }
        }
        steps[3].status = 'completed'
      }
      
      // Step 5: 创建连接配置
      steps.push({ step: 'create_profile', status: 'running' })
      const existingProfile = await prisma.connectionProfile.findFirst({
        where: { name: 'Local OpenClaw' }
      })
      
      let profileId: string
      if (existingProfile) {
        profileId = existingProfile.id
        steps[4].status = 'skipped'
        steps[4].message = '连接配置已存在'
      } else {
        const profile = await prisma.connectionProfile.create({
          data: {
            name: 'Local OpenClaw',
            baseUrl: 'http://127.0.0.1:18789',
            wsUrl: 'ws://127.0.0.1:18789',
            authMode: 'token',
            lastHealthStatus: 'unknown'
          }
        })
        profileId = profile.id
        steps[4].status = 'completed'
      }
      
      // Step 6: 绑定 Workspace
      steps.push({ step: 'bind_workspace', status: 'running' })
      const existingBinding = await prisma.workspaceProfile.findFirst({
        where: { workspaceId, profileId }
      })
      
      if (!existingBinding) {
        await prisma.workspaceProfile.create({
          data: { workspaceId, profileId, isDefault: true }
        })
      }
      steps[5].status = 'completed'
      
      // Step 7: 测试连接
      steps.push({ step: 'test_connection', status: 'running' })
      const client = await createOpenClawClientFromProfile({
        name: 'Local OpenClaw',
        baseUrl: 'http://127.0.0.1:18789',
        wsUrl: 'ws://127.0.0.1:18789',
        authMode: 'token',
        eventPath: null
      }, workspaceId)
  
      const pingResult = await client.ping()
      
      if (!pingResult.success) {
        steps[6].status = 'failed'
        steps[6].error = pingResult.error
        
        await writeApiAuditLog({
          traceId,
          actor: 'admin',
          action: 'OPENCLAW_AUTO_BOOTSTRAP_FAILED',
          tool: 'openclaw-bootstrap',
          request: JSON.stringify({ workspaceId, imageName, skipDeploy }),
          response: JSON.stringify({ success: false, steps })
        })
        
        return { success: false, steps }
      }
      steps[6].status = 'completed'
      
      // 成功审计
      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'OPENCLAW_AUTO_BOOTSTRAP',
        tool: 'openclaw-bootstrap',
        request: JSON.stringify({ workspaceId, imageName, skipDeploy }),
        response: JSON.stringify({ success: true, steps })
      })
      
      return { success: true, steps, profileId }
      
    } catch (error) {
      // 失败审计
      await writeApiAuditLog({
        traceId,
        actor: 'admin',
        action: 'OPENCLAW_AUTO_BOOTSTRAP_FAILED',
        tool: 'openclaw-bootstrap',
        request: JSON.stringify({ workspaceId, imageName, skipDeploy }),
        response: JSON.stringify({ success: false, error: String(error), steps })
      })
      
      throw error
    }
  })
  
  fastify.get('/api/openclaw/detections', async (request) => {
    const { workspaceId, limit = 10 } = request.query as { workspaceId?: string; limit?: number }
  
    try {
      const detections = await prisma.openClawDetection.findMany({
        where: workspaceId ? { workspaceId } : {},
        orderBy: { detectedAt: 'desc' },
        take: Number(limit)
      })
  
      return { success: true, detections }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
  
  fastify.post('/api/openclaw/connect', async (request) => {
    const { profileId } = request.body as { profileId: string }
    
    const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
    if (!profile) throw new Error('Profile not found')
  
    // 如果已连接，先断开
    const existing = openClawClients.get(profileId)
    if (existing) {
      existing.disconnect()
      openClawClients.delete(profileId)
    }
  
    const client = await createOpenClawClientFromProfile(profile)
  
    try {
      await client.connect()
      openClawClients.set(profileId, client)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
  
  fastify.post('/api/openclaw/disconnect', async (request) => {
    const { profileId } = request.body as { profileId: string }
    const client = openClawClients.get(profileId)
    if (client) {
      client.disconnect()
      openClawClients.delete(profileId)
    }
    return { success: true }
  })
  
  fastify.get('/api/openclaw/docker/check-image', async (request, reply) => {
    const { imageName = 'openclaw/gateway:latest' } = request.query as { imageName?: string }
  
    if (!isSafeDockerImageName(imageName)) {
      reply.code(400)
      return {
        success: false,
        exists: false,
        imageName,
        message: 'Docker 镜像名格式不合法'
      }
    }
  
    try {
      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const execFileAsync = promisify(execFile)
  
      const { stdout } = await execFileAsync('docker', ['images', imageName, '--format', '{{.Repository}}:{{.Tag}}'])
      const exists = stdout.trim().length > 0
  
      return {
        success: true,
        exists,
        imageName,
        message: exists
          ? 'Image found locally'
          : 'Image not found. Please build or pull the image first.'
      }
    } catch (error) {
      return {
        success: false,
        exists: false,
        imageName,
        error: String(error),
        message: 'Docker not available or image check failed'
      }
    }
  })
  
  fastify.get('/api/openclaw/:profileId/status', async (request) => {
    const { profileId } = request.params as { profileId: string }
    const client = await ensureOpenClawClientConnected(profileId)
    return { connected: client?.isConnected() || false }
  })
  
  // ==================== OpenClaw Config ====================
  fastify.get('/api/openclaw/:profileId/config', async (request, reply) => {
    const { profileId } = request.params as { profileId: string }
  
    try {
      // 优先使用已连接的客户端
      let client = openClawClients.get(profileId)
  
      // 如果没有已连接的客户端，创建临时客户端用于获取配置
      if (!client) {
        const profile = await prisma.connectionProfile.findUnique({ where: { id: profileId } })
        if (!profile) {
          reply.code(404)
          return fail('连接档案不存在')
        }
  
        client = await createOpenClawClientFromProfile(profile)
      }
  
      return await client.getConfig()
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ profileId, err: errMsg }, '获取 OpenClaw 配置失败')
      reply.code(502)
      return fail(`获取 OpenClaw 配置失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/config/apply', async (request, reply) => {
    let profileId: string
    let config: unknown
    try {
      const validated = validateConfigApplyBody(request.body)
      profileId = validated.profileId
      config = validated.config
    } catch (error) {
      reply.code(400)
      return fail(toErrorMessage(error))
    }
    
    // 限频检查
    const rateCheck = ConfigManager.checkRateLimit(profileId)
    if (!rateCheck.allowed) {
      return {
        status: 'rate_limited',
        message: `写入限频中，请在 ${Math.ceil(rateCheck.resetIn / 1000)} 秒后重试`,
        resetIn: rateCheck.resetIn,
        remaining: rateCheck.remaining
      }
    }
    
    // trustedProxies 校验
    const configObj = config as Record<string, unknown>
    const gateway = configObj?.gateway as Record<string, unknown> | undefined
    if (gateway?.trustedProxies && Array.isArray(gateway.trustedProxies)) {
      const validation = ConfigManager.validateTrustedProxies(gateway.trustedProxies as string[])
      if (!validation.valid) {
        return { status: 'validation_error', errors: validation.errors }
      }
    }
    
    // 审批检查
    const approvalResult = await ApprovalGuard.executeProtected(
      'CHANGE_CONFIG',
      { profileId, config },
      'admin',
      async () => {
        const client = openClawClients.get(profileId)
        if (!client) throw new Error('Client not connected')
        
        const traceId = uuidv4()
        
        // 保存快照（应用前）
        await ConfigManager.saveSnapshot(profileId, config)
        
        // 应用配置
        const result = await client.applyConfig(config, traceId)
        
        // 记录写入
        ConfigManager.recordWrite(profileId)
        
        // 审计日志
        await writeAuditLog({
          traceId,
          actor: 'admin',
          action: 'APPLY_CONFIG',
          request: config,
          response: result
        })
        
        return result
      }
    )
    
    if (approvalResult.needsApproval) {
      return {
        status: 'pending_approval',
        approvalId: approvalResult.approvalId,
        message: '配置变更需要审批'
      }
    }
    
    return { status: 'success', result: approvalResult.result }
  })
  
  // ==================== Config Snapshots ====================
  fastify.get('/api/config/snapshots', async (request) => {
    const { profileId } = request.query as { profileId: string }
    if (!profileId) throw new Error('profileId is required')
    return await ConfigManager.listSnapshots(profileId)
  })
  
  fastify.get('/api/config/snapshots/:id', async (request) => {
    const { id } = request.params as { id: string }
    const config = await ConfigManager.getSnapshot(id)
    if (!config) throw new Error('Snapshot not found')
    return config
  })
  
  fastify.post('/api/config/rollback', async (request, reply) => {
    let profileId: string
    let snapshotId: string
    try {
      const validated = validateConfigRollbackBody(request.body)
      profileId = validated.profileId
      snapshotId = validated.snapshotId
    } catch (error) {
      reply.code(400)
      return fail(toErrorMessage(error))
    }
    
    // 限频检查
    const rateCheck = ConfigManager.checkRateLimit(profileId)
    if (!rateCheck.allowed) {
      return {
        status: 'rate_limited',
        message: `写入限频中，请在 ${Math.ceil(rateCheck.resetIn / 1000)} 秒后重试`,
        resetIn: rateCheck.resetIn
      }
    }
    
    // 审批检查（回滚也属于 CHANGE_CONFIG）
    const approvalResult = await ApprovalGuard.executeProtected(
      'CHANGE_CONFIG',
      { profileId, snapshotId, action: 'rollback' },
      'admin',
      async () => {
        const config = await ConfigManager.rollback(snapshotId)
        const client = openClawClients.get(profileId)
        if (!client) throw new Error('Client not connected')
        
        const traceId = uuidv4()
        const result = await client.applyConfig(config, traceId)
        
        ConfigManager.recordWrite(profileId)
        
        await writeAuditLog({
          traceId,
          actor: 'admin',
          action: 'ROLLBACK_CONFIG',
          request: { snapshotId },
          response: result
        })
        
        return result
      }
    )
    
    if (approvalResult.needsApproval) {
      return {
        status: 'pending_approval',
        approvalId: approvalResult.approvalId,
        message: '配置回滚需要审批'
      }
    }
    
    return { status: 'success', result: approvalResult.result }
  })
  
  fastify.get('/api/config/rate-limit', async (request) => {
    const { profileId } = request.query as { profileId: string }
    if (!profileId) throw new Error('profileId is required')
    return ConfigManager.checkRateLimit(profileId)
  })
  

  // ==================== Config Drafts（本地草稿，不直接调用 OpenClaw） ====================
  interface SaveConfigDraftBody {
    workspaceId: string
    category: string
    content: unknown
    createdBy?: string
  }
  
  fastify.get('/api/config-drafts', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { workspaceId, category } = request.query as { workspaceId?: string; category?: string }
    try {
      const wid = (workspaceId || '').trim()
      if (!wid) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
  
      const row = await prisma.configDraft.findFirst({
        where: {
          workspaceId: wid,
          ...(category ? { category } : {})
        },
        orderBy: { updatedAt: 'desc' }
      })
  
      const parsed = row ? safeParseJson<unknown>(row.contentJson, {}) : null
      const response = row
        ? {
            ...row,
            content: parsed
          }
        : null
  
      await writeAuditLog({
        workspaceId: wid,
        traceId,
        actor,
        action: 'CONFIG_DRAFT_GET',
        tool: 'config-drafts',
        request: { workspaceId: wid, category: category || null },
        response: { found: Boolean(row) }
      })
  
      return ok(response)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '获取配置草稿失败')
      reply.code(500)
      return fail(`获取配置草稿失败：${errMsg}`)
    }
  })
  
  fastify.post('/api/config-drafts', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const body = request.body as SaveConfigDraftBody
    try {
      const workspaceId = (body.workspaceId || '').trim()
      const category = (body.category || '').trim()
      if (!workspaceId) {
        reply.code(400)
        return fail('workspaceId 不能为空')
      }
      if (!category) {
        reply.code(400)
        return fail('category 不能为空')
      }
  
      const sanitized = sanitizeDraftContent(body.content)
      const contentJson = JSON.stringify(sanitized)
      const contentHash = createHash('sha256').update(contentJson).digest('hex')
      const createdBy = (body.createdBy || actor).trim() || actor
  
      const existing = await prisma.configDraft.findFirst({
        where: { workspaceId, category },
        orderBy: { updatedAt: 'desc' }
      })
  
      const saved = existing
        ? await prisma.configDraft.update({
            where: { id: existing.id },
            data: {
              contentJson,
              contentHash,
              version: existing.version + 1,
              createdBy
            }
          })
        : await prisma.configDraft.create({
            data: {
              workspaceId,
              category,
              contentJson,
              contentHash,
              version: 1,
              createdBy
            }
          })
  
      await writeAuditLog({
        workspaceId,
        traceId,
        actor,
        action: 'CONFIG_DRAFT_SAVE',
        tool: 'config-drafts',
        request: { workspaceId, category, contentHash },
        response: { draftId: saved.id, version: saved.version }
      })
  
      await emitApiEvent({
        workspaceId,
        sourceType: 'CONFIG',
        sourceId: saved.id,
        eventType: 'CONFIG_DRAFT_SAVED',
        severity: 'INFO',
        title: '配置草稿已保存',
        summary: `已保存 ${category} 分类草稿，版本 ${saved.version}`,
        payload: {
          draftId: saved.id,
          category,
          version: saved.version,
          contentHash
        },
        traceId
      })
  
      return ok({ ...saved, content: sanitized })
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '保存配置草稿失败')
      reply.code(500)
      return fail(`保存配置草稿失败：${errMsg}`)
    }
  })
  
  fastify.delete('/api/config-drafts/:id', async (request, reply) => {
    const traceId = uuidv4()
    const actor = 'admin'
    const { id } = request.params as { id: string }
  
    try {
      const row = await prisma.configDraft.findUnique({ where: { id } })
      if (!row) {
        reply.code(404)
        return fail('配置草稿不存在')
      }
  
      await prisma.configDraft.delete({ where: { id } })
  
      await writeAuditLog({
        workspaceId: row.workspaceId,
        traceId,
        actor,
        action: 'CONFIG_DRAFT_RESET',
        tool: 'config-drafts',
        request: { draftId: id, category: row.category },
        response: { deleted: true }
      })
  
      await emitApiEvent({
        workspaceId: row.workspaceId,
        sourceType: 'CONFIG',
        sourceId: row.id,
        eventType: 'CONFIG_DRAFT_RESET',
        severity: 'WARN',
        title: '配置草稿已重置',
        summary: `已删除 ${row.category} 分类草稿`,
        payload: {
          draftId: row.id,
          category: row.category,
          lastVersion: row.version
        },
        traceId
      })
  
      return ok({ deleted: true })
    } catch (error) {
      reply.code(500)
      return fail(`重置配置草稿失败：${toErrorMessage(error)}`)
    }
  })
  
  // ==================== Gateway ====================
  fastify.post('/api/gateway/validate', async (request, reply) => {
    const traceId = uuidv4()
    try {
      const config = request.body as GatewayConfig
      const result = GatewayValidator.validate(config)
      return ok(result)
    } catch (error) {
      const errMsg = toErrorMessage(error)
      fastify.log.error({ traceId, err: errMsg }, '校验网关配置失败')
      reply.code(500)
      return fail(`校验网关配置失败：${errMsg}`)
    }
  })
  
}
