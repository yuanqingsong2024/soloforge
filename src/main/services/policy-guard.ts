import { prisma } from './db'
import { ApprovalGuard } from './approval-guard'
import { logger } from './logger'

export interface WorkspacePolicy {
  tools_policy: {
    allow?: string[]
    deny?: string[]
  }
  comms_policy: {
    allowed_targets?: string[]
  }
  config_policy: {
    allowed_paths?: string[]
  }
  approval_policy: {
    required_actions?: string[]
  }
}

const DEFAULT_POLICY: WorkspacePolicy = {
  tools_policy: {
    deny: ['deploy', 'delete_database', 'execute_shell']
  },
  comms_policy: {
    // 空数组默认表示“不限制目标”（允许所有）。如需更严格策略，可在 workspace policy 中显式指定。
    allowed_targets: []
  },
  config_policy: {
    allowed_paths: ['models.*', 'hooks.enabled', 'tools.allow']
  },
  approval_policy: {
    required_actions: []
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string') out.push(item)
  }
  return out
}

function matchesPath(pattern: string, value: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return pattern === value

  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regexStr = `^${escaped.replace(/\\\*/g, '.*')}$`
  try {
    return new RegExp(regexStr).test(value)
  } catch {
    // pattern 非法时，按不匹配处理
    return false
  }
}

function mergeWithDefaults(parsed: WorkspacePolicy): WorkspacePolicy {
  return {
    tools_policy: {
      allow: parsed.tools_policy.allow ?? DEFAULT_POLICY.tools_policy.allow,
      deny: parsed.tools_policy.deny ?? DEFAULT_POLICY.tools_policy.deny
    },
    comms_policy: {
      allowed_targets: parsed.comms_policy.allowed_targets ?? DEFAULT_POLICY.comms_policy.allowed_targets
    },
    config_policy: {
      allowed_paths: parsed.config_policy.allowed_paths ?? DEFAULT_POLICY.config_policy.allowed_paths
    },
    approval_policy: {
      required_actions:
        parsed.approval_policy.required_actions ?? DEFAULT_POLICY.approval_policy.required_actions
    }
  }
}

function parseWorkspacePolicy(rawJson: string): WorkspacePolicy | null {
  try {
    const parsedUnknown: unknown = JSON.parse(rawJson)
    if (!isRecord(parsedUnknown)) return null

    const toolsPolicyUnknown = parsedUnknown['tools_policy']
    const commsPolicyUnknown = parsedUnknown['comms_policy']
    const configPolicyUnknown = parsedUnknown['config_policy']
    const approvalPolicyUnknown = parsedUnknown['approval_policy']

    const tools_policy = isRecord(toolsPolicyUnknown)
      ? {
          allow: normalizeStringArray(toolsPolicyUnknown['allow']),
          deny: normalizeStringArray(toolsPolicyUnknown['deny'])
        }
      : {}

    const comms_policy = isRecord(commsPolicyUnknown)
      ? {
          allowed_targets: normalizeStringArray(commsPolicyUnknown['allowed_targets'])
        }
      : {}

    const config_policy = isRecord(configPolicyUnknown)
      ? {
          allowed_paths: normalizeStringArray(configPolicyUnknown['allowed_paths'])
        }
      : {}

    const approval_policy = isRecord(approvalPolicyUnknown)
      ? {
          required_actions: normalizeStringArray(approvalPolicyUnknown['required_actions'])
        }
      : {}

    const policy: WorkspacePolicy = {
      tools_policy,
      comms_policy,
      config_policy,
      approval_policy
    }
    return mergeWithDefaults(policy)
  } catch {
    return null
  }
}

export class PolicyGuard {
  /**
   * 检查工具是否允许使用。
   * 规则：deny 优先于 allow；若 allow 非空且不包含 toolName，则拒绝。
   */
  static async checkToolAccess(
    workspaceId: string,
    toolName: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policy = await this.getPolicy(workspaceId)
    const deny = policy.tools_policy.deny ?? []
    if (deny.includes(toolName)) {
      return { allowed: false, reason: `Tool '${toolName}' is denied by workspace policy` }
    }
    const allow = policy.tools_policy.allow
    if (allow && allow.length > 0 && !allow.includes(toolName)) {
      return { allowed: false, reason: `Tool '${toolName}' is not allowlisted by workspace policy` }
    }
    return { allowed: true }
  }

  /**
   * 检查通信目标是否允许。
   * 规则：allowed_targets 为空或未设置时，默认不限制（允许所有）。
   */
  static async checkCommsTarget(
    workspaceId: string,
    targetId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policy = await this.getPolicy(workspaceId)
    const allowlist = policy.comms_policy.allowed_targets
    if (!allowlist || allowlist.length === 0) return { allowed: true }
    if (!allowlist.includes(targetId)) {
      return { allowed: false, reason: `Target '${targetId}' is not allowed by workspace policy` }
    }
    return { allowed: true }
  }

  /**
   * 检查配置路径是否允许修改。
   * 规则：allowed_paths 为空或未设置时，默认允许所有；支持 "*" 通配。
   */
  static async checkConfigPath(
    workspaceId: string,
    configPath: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policy = await this.getPolicy(workspaceId)
    const allowedPaths = policy.config_policy.allowed_paths
    if (!allowedPaths || allowedPaths.length === 0) return { allowed: true }

    const ok = allowedPaths.some((p) => matchesPath(p, configPath))
    if (!ok) {
      return { allowed: false, reason: `Config path '${configPath}' is not allowed by workspace policy` }
    }
    return { allowed: true }
  }

  /**
   * 检查动作是否需要审批。
   * 规则：在 ApprovalGuard 默认高危动作基础上进行扩展（required_actions 追加）。
   */
  static async checkApprovalRequired(
    workspaceId: string,
    action: string
  ): Promise<{ required: boolean; reason?: string }> {
    const policy = await this.getPolicy(workspaceId)
    const baseRequired = ApprovalGuard.requiresApproval(action)
    const extraRequired = (policy.approval_policy.required_actions ?? []).includes(action)
    if (extraRequired) {
      return { required: true, reason: `Action '${action}' requires approval by workspace policy` }
    }
    if (baseRequired) {
      return { required: true, reason: `Action '${action}' requires approval by default policy` }
    }
    return { required: false }
  }

  /**
   * 获取 workspace 的 policy（内部辅助方法）。
   * 失败与缺失时会回退到 DEFAULT_POLICY（安全优先 + 不抛异常）。
   */
  private static async getPolicy(workspaceId: string): Promise<WorkspacePolicy> {
    if (workspaceId.trim() === '') return DEFAULT_POLICY

    try {
      const latest = await prisma.workspacePolicy.findFirst({
        where: { workspaceId },
        orderBy: { version: 'desc' }
      })
      if (!latest) return DEFAULT_POLICY

      const parsed = parseWorkspacePolicy(latest.policyJson)
      if (!parsed) {
        logger.error(`Workspace policy JSON 解析失败（workspaceId=${workspaceId}），已回退默认策略`)
        return DEFAULT_POLICY
      }
      return parsed
    } catch (error) {
      logger.error(`读取 workspace policy 失败（workspaceId=${workspaceId}），已回退默认策略: ${error instanceof Error ? error.message : String(error)}`)
      return DEFAULT_POLICY
    }
  }
}
