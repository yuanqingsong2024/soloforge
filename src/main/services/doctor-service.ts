import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * 诊断发现
 */
export interface DiagnosticFinding {
  category: string // WS_CONNECTION, AUTH, CONFIG_DRIFT, HOOKS, TRUSTED_PROXIES
  severity: 'OK' | 'WARNING' | 'ERROR' | 'CRITICAL'
  message: string
  details?: string
  recommendation?: string
}

/**
 * 诊断报告
 */
export interface DiagnosticReport {
  id: string
  workspaceId: string
  reportType: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  findings: DiagnosticFinding[]
  summary: string
  severity: 'OK' | 'WARNING' | 'ERROR' | 'CRITICAL'
  createdAt: Date
}

/**
 * DoctorService 服务
 * 负责诊断检查：WS 连接、认证、配置漂移、hooks、trustedProxies
 */
export class DoctorService {
  /**
   * 运行完整诊断
   */
  static async runFullDiagnostic(
    workspaceId: string,
    createdBy: string
  ): Promise<DiagnosticReport> {
    const findings: DiagnosticFinding[] = []

    // 1. 检查 WS/WSS 连接
    const wsFindings = await this.checkWebSocketConnection(workspaceId)
    findings.push(...wsFindings)

    // 2. 检查认证配置
    const authFindings = await this.checkAuthentication(workspaceId)
    findings.push(...authFindings)

    // 3. 检查配置漂移
    const driftFindings = await this.checkConfigDrift(workspaceId)
    findings.push(...driftFindings)

    // 4. 检查 hooks 配置
    const hooksFindings = await this.checkHooks(workspaceId)
    findings.push(...hooksFindings)

    // 5. 检查 trustedProxies 风险
    const proxiesFindings = await this.checkTrustedProxies(workspaceId)
    findings.push(...proxiesFindings)
    // 6. 检查部署目标健康状态
    const deploymentFindings = await this.checkDeploymentTargets(workspaceId)
    findings.push(...deploymentFindings)

    // 7. 检查 Host Agent 心跳与绑定情况
    const hostAgentFindings = await this.checkHostAgents(workspaceId)
    findings.push(...hostAgentFindings)

    // 计算整体严重程度
    const severity = this.calculateOverallSeverity(findings)

    // 生成摘要
    const summary = this.generateSummary(findings)

    // 保存报告
    const report = await prisma.diagnosticReport.create({
      data: {
        workspaceId,
        reportType: 'FULL',
        status: 'COMPLETED',
        findings: JSON.stringify(findings),
        summary,
        severity,
        createdBy
      }
    })

    return {
      id: report.id,
      workspaceId: report.workspaceId,
      reportType: report.reportType,
      status: report.status as any,
      findings,
      summary: report.summary,
      severity: report.severity as any,
      createdAt: report.createdAt
    }
  }

  /**
   * 检查 WebSocket 连接
   */
  private static async checkWebSocketConnection(
    workspaceId: string
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = []

    try {
      // 获取 workspace 的连接配置
      const profiles = await prisma.workspaceProfile.findMany({
        where: { workspaceId },
        include: { profile: true }
      })

      if (profiles.length === 0) {
        findings.push({
          category: 'WS_CONNECTION',
          severity: 'WARNING',
          message: '未配置任何连接配置',
          recommendation: '请在连接管理页面添加 OpenClaw 连接配置'
        })
        return findings
      }

      for (const wp of profiles) {
        const profile = wp.profile

        // 检查 wsUrl 格式
        if (!profile.wsUrl.startsWith('ws://') && !profile.wsUrl.startsWith('wss://')) {
          findings.push({
            category: 'WS_CONNECTION',
            severity: 'ERROR',
            message: `连接配置 "${profile.name}" 的 wsUrl 格式无效`,
            details: `wsUrl: ${profile.wsUrl}`,
            recommendation: 'wsUrl 必须以 ws:// 或 wss:// 开头'
          })
        }

        // 检查是否使用 wss（生产环境）
        if (profile.wsUrl.startsWith('ws://') && !profile.wsUrl.includes('localhost') && !profile.wsUrl.includes('127.0.0.1')) {
          findings.push({
            category: 'WS_CONNECTION',
            severity: 'WARNING',
            message: `连接配置 "${profile.name}" 使用非加密 WebSocket (ws://)`,
            details: '生产环境应使用 wss:// 加密连接',
            recommendation: '配置 OpenResty 反代并使用 wss://'
          })
        }

        // 检查最近健康检查状态
        if (profile.lastHealthStatus === 'FAILED') {
          findings.push({
            category: 'WS_CONNECTION',
            severity: 'ERROR',
            message: `连接配置 "${profile.name}" 最近健康检查失败`,
            details: `最后检查时间: ${profile.lastHealthCheck?.toLocaleString('zh-CN') || '未知'}`,
            recommendation: '检查 OpenClaw 是否运行，网络是否可达'
          })
        } else if (profile.lastHealthStatus === 'SUCCESS') {
          findings.push({
            category: 'WS_CONNECTION',
            severity: 'OK',
            message: `连接配置 "${profile.name}" 健康检查正常`
          })
        }
      }
    } catch (error: any) {
      findings.push({
        category: 'WS_CONNECTION',
        severity: 'ERROR',
        message: 'WebSocket 连接检查失败',
        details: error.message
      })
    }

    return findings
  }

  /**
   * 检查认证配置
   */
  private static async checkAuthentication(
    workspaceId: string
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = []

    try {
      // 获取最新的 DESIRED 配置
      const desiredSnapshot = await prisma.workspaceSnapshot.findFirst({
        where: { workspaceId, kind: 'DESIRED' },
        orderBy: { createdAt: 'desc' }
      })

      if (!desiredSnapshot) {
        findings.push({
          category: 'AUTH',
          severity: 'WARNING',
          message: '未找到期望配置快照',
          recommendation: '请先保存配置'
        })
        return findings
      }

      const config = JSON.parse(desiredSnapshot.contentJson)
      const gateway = config.gateway || {}
      const auth = gateway.auth || {}

      // 检查认证模式
      if (auth.mode === 'none') {
        findings.push({
          category: 'AUTH',
          severity: 'CRITICAL',
          message: '认证模式为 none，网关无任何认证保护',
          recommendation: '生产环境必须启用认证（token/password/trusted-proxy）'
        })
      } else if (auth.mode === 'token') {
        findings.push({
          category: 'AUTH',
          severity: 'OK',
          message: '认证模式为 token，安全性良好'
        })
      } else if (auth.mode === 'password') {
        findings.push({
          category: 'AUTH',
          severity: 'OK',
          message: '认证模式为 password，安全性良好'
        })
      } else if (auth.mode === 'trusted-proxy') {
        findings.push({
          category: 'AUTH',
          severity: 'WARNING',
          message: '认证模式为 trusted-proxy，依赖代理层认证',
          recommendation: '确保 trustedProxies 配置正确，且代理层有认证机制'
        })
      } else {
        findings.push({
          category: 'AUTH',
          severity: 'ERROR',
          message: `未知的认证模式: ${auth.mode}`,
          recommendation: '请使用 token/password/trusted-proxy/none'
        })
      }
    } catch (error: any) {
      findings.push({
        category: 'AUTH',
        severity: 'ERROR',
        message: '认证配置检查失败',
        details: error.message
      })
    }

    return findings
  }

  /**
   * 检查配置漂移
   */
  private static async checkConfigDrift(
    workspaceId: string
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = []

    try {
      // 获取最新漂移
      const latestDrift = await prisma.snapshotDiff.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' }
      })

      if (!latestDrift) {
        findings.push({
          category: 'CONFIG_DRIFT',
          severity: 'OK',
          message: '未检测到配置漂移'
        })
        return findings
      }

      if (latestDrift.severity === 'HIGH') {
        findings.push({
          category: 'CONFIG_DRIFT',
          severity: 'ERROR',
          message: '检测到高危配置漂移',
          details: latestDrift.summary,
          recommendation: '请尽快创建变更单并应用配置'
        })
      } else if (latestDrift.severity === 'MED') {
        findings.push({
          category: 'CONFIG_DRIFT',
          severity: 'WARNING',
          message: '检测到中危配置漂移',
          details: latestDrift.summary,
          recommendation: '建议创建变更单并应用配置'
        })
      } else {
        findings.push({
          category: 'CONFIG_DRIFT',
          severity: 'OK',
          message: '检测到低危配置漂移',
          details: latestDrift.summary
        })
      }
    } catch (error: any) {
      findings.push({
        category: 'CONFIG_DRIFT',
        severity: 'ERROR',
        message: '配置漂移检查失败',
        details: error.message
      })
    }

    return findings
  }

  /**
   * 检查 hooks 配置
   */
  private static async checkHooks(
    workspaceId: string
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = []

    try {
      const desiredSnapshot = await prisma.workspaceSnapshot.findFirst({
        where: { workspaceId, kind: 'DESIRED' },
        orderBy: { createdAt: 'desc' }
      })

      if (!desiredSnapshot) {
        return findings
      }

      const config = JSON.parse(desiredSnapshot.contentJson)
      const hooks = config.hooks || {}

      if (hooks.enabled) {
        if (!hooks.token || hooks.token === '***REDACTED***') {
          findings.push({
            category: 'HOOKS',
            severity: 'ERROR',
            message: 'Hooks 已启用但未配置 token',
            recommendation: '请在 Keychain 中配置 hooks token'
          })
        } else {
          findings.push({
            category: 'HOOKS',
            severity: 'OK',
            message: 'Hooks 配置正常'
          })
        }

        if (!hooks.path) {
          findings.push({
            category: 'HOOKS',
            severity: 'WARNING',
            message: 'Hooks 未配置 path',
            recommendation: '建议配置 hooks.path（如 /hooks）'
          })
        }
      } else {
        findings.push({
          category: 'HOOKS',
          severity: 'OK',
          message: 'Hooks 未启用'
        })
      }
    } catch (error: any) {
      findings.push({
        category: 'HOOKS',
        severity: 'ERROR',
        message: 'Hooks 配置检查失败',
        details: error.message
      })
    }

    return findings
  }

  /**
   * 检查 trustedProxies 风险
   */
  private static async checkTrustedProxies(
    workspaceId: string
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = []

    try {
      const desiredSnapshot = await prisma.workspaceSnapshot.findFirst({
        where: { workspaceId, kind: 'DESIRED' },
        orderBy: { createdAt: 'desc' }
      })

      if (!desiredSnapshot) {
        return findings
      }

      const config = JSON.parse(desiredSnapshot.contentJson)
      const gateway = config.gateway || {}
      const trustedProxies = gateway.trustedProxies || []

      if (trustedProxies.length === 0) {
        findings.push({
          category: 'TRUSTED_PROXIES',
          severity: 'OK',
          message: 'trustedProxies 为空，trusted-proxy 模式不可用'
        })
        return findings
      }

      // 检查危险配置
      const dangerousPatterns = ['0.0.0.0/0', '::/0', '0.0.0.0', '*']
      for (const proxy of trustedProxies) {
        if (dangerousPatterns.includes(proxy)) {
          findings.push({
            category: 'TRUSTED_PROXIES',
            severity: 'CRITICAL',
            message: `检测到危险的 trustedProxies 配置: ${proxy}`,
            recommendation: '立即移除该配置，使用精确 IP 或小网段（/24+）'
          })
        }
      }

      // 检查网段大小
      for (const proxy of trustedProxies) {
        const cidrMatch = proxy.match(/^(\d{1,3}\.){3}\d{1,3}\/(\d{1,2})$/)
        if (cidrMatch) {
          const prefix = parseInt(cidrMatch[2], 10)
          if (prefix < 24) {
            findings.push({
              category: 'TRUSTED_PROXIES',
              severity: 'WARNING',
              message: `trustedProxies 网段过大: ${proxy}`,
              recommendation: '建议使用 /24 或更小的网段'
            })
          }
        }
      }

      if (findings.filter(f => f.category === 'TRUSTED_PROXIES').length === 0) {
        findings.push({
          category: 'TRUSTED_PROXIES',
          severity: 'OK',
          message: 'trustedProxies 配置安全'
        })
      }
    } catch (error: any) {
      findings.push({
        category: 'TRUSTED_PROXIES',
        severity: 'ERROR',
        message: 'trustedProxies 检查失败',
        details: error.message
      })
    }

    return findings
  }

  /**
   * 计算整体严重程度
   */
  private static calculateOverallSeverity(
    findings: DiagnosticFinding[]
  ): 'OK' | 'WARNING' | 'ERROR' | 'CRITICAL' {
    if (findings.some(f => f.severity === 'CRITICAL')) return 'CRITICAL'
    if (findings.some(f => f.severity === 'ERROR')) return 'ERROR'
    if (findings.some(f => f.severity === 'WARNING')) return 'WARNING'
    return 'OK'
  }

  /**
   * 生成摘要
   */
  private static generateSummary(findings: DiagnosticFinding[]): string {
    const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length
    const errorCount = findings.filter(f => f.severity === 'ERROR').length
    const warningCount = findings.filter(f => f.severity === 'WARNING').length
    const okCount = findings.filter(f => f.severity === 'OK').length

    const parts: string[] = []
    if (criticalCount > 0) parts.push(`${criticalCount} 个严重问题`)
    if (errorCount > 0) parts.push(`${errorCount} 个错误`)
    if (warningCount > 0) parts.push(`${warningCount} 个警告`)
    if (okCount > 0) parts.push(`${okCount} 项正常`)

    return `诊断完成：${parts.join('，')}`
  }

  /**
   * 获取诊断历史
   */
  static async getReportHistory(workspaceId: string, limit = 20) {
    return await prisma.diagnosticReport.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }

  /**
   * 获取诊断报告详情
   */
  static async getReport(reportId: string): Promise<DiagnosticReport | null> {
    const report = await prisma.diagnosticReport.findUnique({
      where: { id: reportId }
    })

    if (!report) return null

    return {
      id: report.id,
      workspaceId: report.workspaceId,
      reportType: report.reportType,
      status: report.status as any,
      findings: JSON.parse(report.findings),
      summary: report.summary,
      severity: report.severity as any,
      createdAt: report.createdAt
    }
  }
  /**
   * 检查部署目标健康状态
   */
  private static async checkDeploymentTargets(
    workspaceId: string
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = []
    try {
      // 获取所有部署目标
      const targets = await prisma.deploymentTarget.findMany({
        where: { workspaceId }
      })
      if (targets.length === 0) {
        findings.push({
          category: 'DEPLOYMENT_HEALTH',
          severity: 'OK',
          message: '暂无部署目标',
          details: '当前 workspace 没有配置任何部署目标'
        })
        return findings
      }
      // 统计各状态数量
      const statusCounts = {
        UNKNOWN: 0,
        HEALTHY: 0,
        DEGRADED: 0,
        UNREACHABLE: 0
      }
      targets.forEach(target => {
        const status = target.status as keyof typeof statusCounts
        if (status in statusCounts) {
          statusCounts[status]++
        }
      })
      // 检查 UNREACHABLE 目标
      if (statusCounts.UNREACHABLE > 0) {
        const unreachableTargets = targets.filter(t => t.status === 'UNREACHABLE')
        findings.push({
          category: 'DEPLOYMENT_HEALTH',
          severity: 'CRITICAL',
          message: `${statusCounts.UNREACHABLE} 个部署目标不可达`,
          details: `不可达目标: ${unreachableTargets.map(t => t.name).join(', ')}`,
          recommendation: '请检查网络连接、SSH 凭据或服务状态'
        })
      }
      // 检查 DEGRADED 目标
      if (statusCounts.DEGRADED > 0) {
        const degradedTargets = targets.filter(t => t.status === 'DEGRADED')
        findings.push({
          category: 'DEPLOYMENT_HEALTH',
          severity: 'WARNING',
          message: `${statusCounts.DEGRADED} 个部署目标降级运行`,
          details: `降级目标: ${degradedTargets.map(t => t.name).join(', ')}`,
          recommendation: '请检查服务日志和资源使用情况'
        })
      }
      // 检查 UNKNOWN 目标
      if (statusCounts.UNKNOWN > 0) {
        const unknownTargets = targets.filter(t => t.status === 'UNKNOWN')
        findings.push({
          category: 'DEPLOYMENT_HEALTH',
          severity: 'WARNING',
          message: `${statusCounts.UNKNOWN} 个部署目标状态未知`,
          details: `未知目标: ${unknownTargets.map(t => t.name).join(', ')}`,
          recommendation: '请运行健康检查以更新状态'
        })
      }
      // 检查长时间未检查的目标
      const now = new Date()
      const staleThreshold = 24 * 60 * 60 * 1000 // 24 小时
      const staleTargets = targets.filter(t => {
        if (!t.lastCheckAt) return true
        return now.getTime() - new Date(t.lastCheckAt).getTime() > staleThreshold
      })
      if (staleTargets.length > 0) {
        findings.push({
          category: 'DEPLOYMENT_HEALTH',
          severity: 'WARNING',
          message: `${staleTargets.length} 个部署目标超过 24 小时未检查`,
          details: `过期目标: ${staleTargets.map(t => t.name).join(', ')}`,
          recommendation: '建议定期运行健康检查以确保状态最新'
        })
      }
      // 如果所有目标都健康
      if (statusCounts.HEALTHY === targets.length && staleTargets.length === 0) {
        findings.push({
          category: 'DEPLOYMENT_HEALTH',
          severity: 'OK',
          message: `所有 ${targets.length} 个部署目标运行正常`,
          details: '所有部署目标状态健康'
        })
      }
      // 检查 Docker 可用性（对于 Docker 类型的目标）
      const dockerTargets = targets.filter(t => 
        t.targetType === 'LOCAL_DOCKER' || t.targetType === 'REMOTE_DOCKER'
      )
      if (dockerTargets.length > 0) {
        // 注：实际检查需要调用 DockerManager，这里只做基础检查
        findings.push({
          category: 'DEPLOYMENT_HEALTH',
          severity: 'OK',
          message: `${dockerTargets.length} 个 Docker 部署目标已配置`,
          details: 'Docker 部署目标需要 Docker 环境支持',
          recommendation: '请确保 Docker 已安装并运行'
        })
      }
      // 检查 SSH 连接（对于远程目标）
      const remoteTargets = targets.filter(t => 
        t.targetType === 'REMOTE_HOST' || t.targetType === 'REMOTE_DOCKER'
      )
      if (remoteTargets.length > 0) {
        // 注：实际检查需要调用 SSHExecutor，这里只做基础检查
        const missingCredentials = remoteTargets.filter(t => !t.sshUser)
        if (missingCredentials.length > 0) {
          findings.push({
            category: 'DEPLOYMENT_HEALTH',
            severity: 'ERROR',
            message: `${missingCredentials.length} 个远程目标缺少 SSH 凭据`,
            details: `缺少凭据目标: ${missingCredentials.map(t => t.name).join(', ')}`,
            recommendation: '请在部署目标设置中配置 SSH 用户名和密码'
          })
        }
      }
      // 检查端口冲突
      const portMap = new Map<number, string[]>()
      targets.forEach(target => {
        const port = target.port || 18789
        if (!portMap.has(port)) {
          portMap.set(port, [])
        }
        portMap.get(port)!.push(target.name)
      })
      portMap.forEach((targetNames, port) => {
        if (targetNames.length > 1) {
          findings.push({
            category: 'DEPLOYMENT_HEALTH',
            severity: 'WARNING',
            message: `端口 ${port} 被多个目标使用`,
            details: `使用该端口的目标: ${targetNames.join(', ')}`,
            recommendation: '如果这些目标在同一主机上，可能会导致端口冲突'
          })
        }
      })
    } catch (error) {
      findings.push({
        category: 'DEPLOYMENT_HEALTH',
        severity: 'ERROR',
        message: '检查部署目标失败',
        details: error instanceof Error ? error.message : '未知错误',
        recommendation: '请检查数据库连接和权限'
      })
    }
    return findings
  }

  /**
   * 检查 Host Agent 心跳状态
   */
  private static async checkHostAgents(
    workspaceId: string
  ): Promise<DiagnosticFinding[]> {
    const findings: DiagnosticFinding[] = []
    try {
      const agents: Array<{ name: string; status: string; targetId: string | null }> = await prisma.hostAgent.findMany({
        where: { workspaceId }
      })

      if (agents.length === 0) {
        findings.push({
          category: 'HOST_AGENT',
          severity: 'OK',
          message: '当前 workspace 尚未注册 Host Agent'
        })
        return findings
      }

      const offline = agents.filter(agent => agent.status === 'OFFLINE' || agent.status === 'UNREGISTERED')
      const degraded = agents.filter(agent => agent.status === 'DEGRADED')
      const unbound = agents.filter(agent => !agent.targetId)

      if (offline.length > 0) {
        findings.push({
          category: 'HOST_AGENT',
          severity: 'ERROR',
          message: `${offline.length} 个 Host Agent 离线或未注册`,
          details: offline.map(agent => agent.name).join(', '),
          recommendation: '检查 Agent 进程、注册 token 与网络可达性；必要时回退到 SSH。'
        })
      }

      if (degraded.length > 0) {
        findings.push({
          category: 'HOST_AGENT',
          severity: 'WARNING',
          message: `${degraded.length} 个 Host Agent 心跳降级`,
          details: degraded.map(agent => agent.name).join(', '),
          recommendation: '检查目标主机负载、SoloForge 可达性与 Agent 轮询频率。'
        })
      }

      if (unbound.length > 0) {
        findings.push({
          category: 'HOST_AGENT',
          severity: 'WARNING',
          message: `${unbound.length} 个 Host Agent 未绑定 target`,
          details: unbound.map(agent => agent.name).join(', '),
          recommendation: '建议将 Agent 绑定到对应 deployment target，便于 Doctor / Deployment / Upgrade 优先走 Agent。'
        })
      }

      if (offline.length === 0 && degraded.length === 0) {
        findings.push({
          category: 'HOST_AGENT',
          severity: 'OK',
          message: `全部 ${agents.length} 个 Host Agent 心跳正常`
        })
      }
    } catch (error) {
      findings.push({
        category: 'HOST_AGENT',
        severity: 'ERROR',
        message: 'Host Agent 状态检查失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }

    return findings
  }
}

export { prisma }
