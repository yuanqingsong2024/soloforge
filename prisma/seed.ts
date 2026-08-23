import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const LOCAL_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

async function main() {
  console.log('开始种子数据填充...')

  // 创建默认 Workspace（用于 workspace 隔离系统的兜底）
  await prisma.workspace.upsert({
    where: { id: LOCAL_WORKSPACE_ID },
    update: {
      name: 'Local',
      description: '本地默认工作区'
    },
    create: {
      id: LOCAL_WORKSPACE_ID,
      name: 'Local',
      description: '本地默认工作区'
    }
  })
  console.log('✓ 创建默认 Workspace: Local')

  // 创建 5 个默认岗位
  const roles = [
    {
      name: 'Support',
      description: '客户支持专员 - 负责接收咨询、澄清需求、转化为结构化工单',
      riskLevel: 'LOW',
      defaultPrompt: `你是一名专业的客户支持专员。你的职责是：
1. 倾听客户需求，提出澄清问题
2. 将模糊需求转化为结构化的工单
3. 识别需求的目标、范围、约束、时间、预算、风险

请以友好、专业的态度与客户沟通，确保充分理解需求后再转交给后续团队。`,
      outputSchema: JSON.stringify({
        type: 'object',
        required: ['goal', 'scope', 'constraints', 'clarifications'],
        properties: {
          goal: { type: 'string', description: '客户的核心目标' },
          scope: { type: 'string', description: '需求范围边界' },
          constraints: { type: 'array', items: { type: 'string' }, description: '约束条件（时间/预算/技术）' },
          timeline: { type: 'string', description: '期望时间线' },
          budget: { type: 'string', description: '预算范围' },
          risks: { type: 'array', items: { type: 'string' }, description: '识别的风险点' },
          clarifications: { type: 'array', items: { type: 'string' }, description: '需要进一步澄清的问题' }
        }
      })
    },
    {
      name: 'PM&Writer',
      description: '产品经理 & 技术写作 - 负责方案设计、需求文档、技术方案撰写',
      riskLevel: 'MEDIUM',
      defaultPrompt: `你是一名资深产品经理兼技术写作专家。你的职责是：
1. 基于结构化需求，设计 2-3 个可行方案（方案A/B/C）
2. 明确范围边界、验收标准、里程碑
3. 评估风险并给出报价区间（不承诺最终价格）
4. 撰写清晰的 PRD 和技术方案文档

输出必须结构化、可执行、可验收。`,
      outputSchema: JSON.stringify({
        type: 'object',
        required: ['solutions', 'scope', 'acceptance', 'milestones', 'risks', 'priceRange'],
        properties: {
          solutions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                pros: { type: 'array', items: { type: 'string' } },
                cons: { type: 'array', items: { type: 'string' } },
                effort: { type: 'string' }
              }
            }
          },
          scope: { type: 'string', description: '范围边界' },
          acceptance: { type: 'array', items: { type: 'string' }, description: '验收标准' },
          milestones: { type: 'array', items: { type: 'object' }, description: '里程碑' },
          risks: { type: 'array', items: { type: 'string' }, description: '风险评估' },
          priceRange: { type: 'string', description: '报价区间（不承诺最终）' }
        }
      })
    },
    {
      name: 'Dev',
      description: '开发工程师 - 负责任务分解、代码实现、技术方案落地',
      riskLevel: 'HIGH',
      defaultPrompt: `你是一名资深开发工程师。你的职责是：
1. 将技术方案分解为可执行的任务清单
2. 设计接口、数据结构、代码改动清单
3. 明确测试点、部署步骤、回滚预案
4. 编写高质量、可维护的代码

输出必须包含：任务分解、接口设计、代码改动清单、测试点、部署/回滚方案。`,
      outputSchema: JSON.stringify({
        type: 'object',
        required: ['tasks', 'interfaces', 'codeChanges', 'testPoints', 'deployment'],
        properties: {
          tasks: { type: 'array', items: { type: 'object' }, description: '任务分解' },
          interfaces: { type: 'array', items: { type: 'object' }, description: '接口设计' },
          dataStructures: { type: 'array', items: { type: 'object' }, description: '数据结构' },
          codeChanges: { type: 'array', items: { type: 'string' }, description: '代码改动清单' },
          testPoints: { type: 'array', items: { type: 'string' }, description: '测试点' },
          deployment: { type: 'object', description: '部署步骤' },
          rollback: { type: 'object', description: '回滚预案' }
        }
      })
    },
    {
      name: 'QA',
      description: '质量保证工程师 - 负责测试计划、用例设计、质量把关',
      riskLevel: 'MEDIUM',
      defaultPrompt: `你是一名专业的 QA 工程师。你的职责是：
1. 基于需求和代码改动，设计完整的测试计划
2. 编写测试用例（功能/边界/异常/回归）
3. 明确验收清单和质量标准
4. 识别潜在的质量风险

输出必须包含：测试计划、测试用例、边界条件、回归范围、验收清单。`,
      outputSchema: JSON.stringify({
        type: 'object',
        required: ['testPlan', 'testCases', 'boundaryConditions', 'regressionScope', 'acceptanceCriteria'],
        properties: {
          testPlan: { type: 'string', description: '测试计划概述' },
          testCases: { type: 'array', items: { type: 'object' }, description: '测试用例' },
          boundaryConditions: { type: 'array', items: { type: 'string' }, description: '边界条件' },
          regressionScope: { type: 'array', items: { type: 'string' }, description: '回归测试范围' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: '验收清单' },
          risks: { type: 'array', items: { type: 'string' }, description: '质量风险' }
        }
      })
    },
    {
      name: 'Ops',
      description: '运维工程师 - 负责部署、监控、回滚、权限管理',
      riskLevel: 'CRITICAL',
      defaultPrompt: `你是一名资深运维工程师。你的职责是：
1. 设计安全的部署流程（灰度/蓝绿/金丝雀）
2. 配置监控点和告警规则
3. 准备详细的回滚预案
4. 管理权限清单和访问控制

输出必须包含：部署步骤、监控点、回滚预案、权限清单。所有高危操作必须有审批流程。`,
      outputSchema: JSON.stringify({
        type: 'object',
        required: ['deploymentSteps', 'monitoring', 'rollbackPlan', 'permissions'],
        properties: {
          deploymentSteps: { type: 'array', items: { type: 'object' }, description: '部署步骤（含灰度策略）' },
          monitoring: { type: 'array', items: { type: 'object' }, description: '监控点和告警规则' },
          rollbackPlan: { type: 'object', description: '回滚预案' },
          permissions: { type: 'array', items: { type: 'object' }, description: '权限清单' },
          securityChecklist: { type: 'array', items: { type: 'string' }, description: '安全检查清单' }
        }
      })
    }
  ]

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role
    })
    console.log(`✓ 创建岗位: ${role.name}`)
  }

  // 创建示例 Agent
  const supportRole = await prisma.role.findUnique({ where: { name: 'Support' } })
  if (supportRole) {
    await prisma.agent.upsert({
      where: { workspaceId_name: { workspaceId: LOCAL_WORKSPACE_ID, name: 'Alice (Support)' } },
      update: {},
      create: {
        name: 'Alice (Support)',
        workspaceId: LOCAL_WORKSPACE_ID,
        roleId: supportRole.id,
        model: 'gpt-4',
        runtime: 'cloud',
        enabled: true
      }
    })
    console.log('✓ 创建示例 Agent: Alice (Support)')
  }

  // 创建示例工具
  const tools = [
    {
      name: 'read_file',
      scope: 'filesystem',
      riskClass: 'LOW',
      configSchema: JSON.stringify({
        type: 'object',
        properties: {
          allowedPaths: { type: 'array', items: { type: 'string' } }
        }
      })
    },
    {
      name: 'write_file',
      scope: 'filesystem',
      riskClass: 'HIGH',
      configSchema: JSON.stringify({
        type: 'object',
        properties: {
          allowedPaths: { type: 'array', items: { type: 'string' } },
          maxFileSize: { type: 'number' }
        }
      })
    },
    {
      name: 'execute_command',
      scope: 'system',
      riskClass: 'CRITICAL',
      configSchema: JSON.stringify({
        type: 'object',
        properties: {
          allowedCommands: { type: 'array', items: { type: 'string' } },
          timeout: { type: 'number' }
        }
      })
    },
    {
      name: 'send_email',
      scope: 'external',
      riskClass: 'MEDIUM',
      configSchema: JSON.stringify({
        type: 'object',
        properties: {
          allowedRecipients: { type: 'array', items: { type: 'string' } }
        }
      })
    }
  ]

  for (const tool of tools) {
    await prisma.tool.upsert({
      where: { name: tool.name },
      update: {},
      create: tool
    })
    console.log(`✓ 创建工具: ${tool.name}`)
  }

  // 创建默认连接配置
  await prisma.connectionProfile.upsert({
    where: { name: 'Local' },
    update: {},
    create: {
      name: 'Local',
      baseUrl: 'http://127.0.0.1:18789',
      wsUrl: 'ws://127.0.0.1:18789',
      authMode: 'token'
    }
  })
  console.log('✓ 创建默认连接配置: Local')

  // 创建默认标签
  const tags = [
    { name: 'bug', color: '#EF4444' },      // 红色
    { name: 'feature', color: '#10B981' },  // 绿色
    { name: 'urgent', color: '#F59E0B' },   // 橙色
    { name: 'backend', color: '#3B82F6' },  // 蓝色
    { name: 'frontend', color: '#8B5CF6' }, // 紫色
    { name: 'docs', color: '#6B7280' }      // 灰色
  ]

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag
    })
    console.log(`✓ 创建标签: ${tag.name}`)
  }

  // 创建内置消息模板（最小可用）
  const templates = [
    {
      name: '需求澄清模板',
      scenario: 'REQUIREMENTS_CLARIFY',
      channelConstraints: JSON.stringify(['email', 'slack', 'wechat']),
      contentFormat: 'MARKDOWN',
      subjectTemplate: '关于 {{ticketTitle}} 的需求澄清',
      bodyTemplate: `您好，{{customerName}}：

关于「{{ticketTitle}}」的需求，我们希望先与您确认以下信息，以避免理解偏差：

## 需求确认
我们当前对需求的理解为：
- （请在回复中补充/纠正，如有）

## 待确认问题
{{questions}}

如您方便，也可补充：期望交付时间、使用场景、优先级与不做的范围。

感谢您的配合，我们收到确认后会尽快整理并推进下一步。`,
      variablesSchema: JSON.stringify({
        properties: {
          ticketTitle: { title: '工单标题' },
          customerName: { title: '客户姓名' },
          questions: { title: '待确认问题' }
        }
      }),
      defaults: JSON.stringify({
        ticketTitle: '项目需求',
        customerName: '客户',
        questions: '1. 具体需求是什么？\n2. 预期交付时间？'
      })
    },
    {
      name: '报价与方案沟通模板',
      scenario: 'QUOTE',
      channelConstraints: JSON.stringify(['email']),
      contentFormat: 'MARKDOWN',
      subjectTemplate: '{{ticketTitle}} - 方案与报价',
      bodyTemplate: `您好，{{customerName}}：

## 方案概述
我们建议先基于当前信息交付最小可用版本（MVP），在完成核心流程后再按优先级迭代扩展。

## 工作量估算
预估工作日：{{estimatedDays}}（含联调与验收配合）。

## 报价范围
{{priceRange}}

## 免责声明
本报价为初步估算，最终价格和工期以实际开发为准。`,
      variablesSchema: JSON.stringify({
        properties: {
          ticketTitle: { title: '工单标题' },
          customerName: { title: '客户姓名' },
          estimatedDays: { title: '预估工作日' },
          priceRange: { title: '报价范围' }
        }
      }),
      defaults: JSON.stringify({
        ticketTitle: '项目',
        customerName: '客户',
        estimatedDays: '5-10',
        priceRange: '待评估'
      })
    },
    {
      name: '交付通知模板',
      scenario: 'DELIVERY_NOTICE',
      channelConstraints: JSON.stringify(['email', 'slack', 'wechat']),
      contentFormat: 'MARKDOWN',
      subjectTemplate: '{{ticketTitle}} 已完成交付',
      bodyTemplate: `您好，{{customerName}}：

## 交付内容
{{deliveryItems}}

## 使用说明
1. 请按随附文档/说明完成配置与环境准备。
2. 建议优先验证主流程，再覆盖边界与异常场景。

## 后续支持
如在使用过程中遇到问题或需要调整，请直接回复本消息或在工单中反馈，我们会尽快跟进。

感谢您的信任与配合。`,
      variablesSchema: JSON.stringify({
        properties: {
          ticketTitle: { title: '工单标题' },
          customerName: { title: '客户姓名' },
          deliveryItems: { title: '交付物清单' }
        }
      }),
      defaults: JSON.stringify({
        ticketTitle: '项目',
        customerName: '客户',
        deliveryItems: '- 功能实现\n- 文档说明'
      })
    }
  ]

  for (const template of templates) {
    await prisma.messageTemplate.upsert({
      where: { name: template.name },
      update: {
        scenario: template.scenario,
        channelConstraints: template.channelConstraints,
        contentFormat: template.contentFormat,
        subjectTemplate: template.subjectTemplate,
        bodyTemplate: template.bodyTemplate,
        variablesSchema: template.variablesSchema,
        defaults: template.defaults,
        enabled: true,
        version: 1
      },
      create: {
        ...template,
        enabled: true,
        version: 1
      }
    })
    console.log(`✓ 创建消息模板: ${template.name}`)
  }

  // 创建示例联系人
  const sampleContactName = '示例客户-张女士'
  const existingContact = await prisma.contact.findFirst({ where: { name: sampleContactName } })
  const sampleContact = existingContact || await prisma.contact.create({
    data: {
      name: sampleContactName,
      company: '示例科技',
      tags: JSON.stringify(['VIP', '重点客户']),
      notes: '用于演示联系人绑定与模板外发流程。'
    }
  })
  console.log(`✓ 创建示例联系人: ${sampleContact.name}`)

  // 如存在 allowlisted 目标，则自动绑定一个主目标用于演示
  const firstTarget = await prisma.commsTarget.findFirst({
    where: { allowlisted: true },
    orderBy: { createdAt: 'asc' }
  })

  if (firstTarget) {
    const existingBinding = await prisma.contactTarget.findFirst({
      where: {
        contactId: sampleContact.id,
        commsTargetId: firstTarget.id
      }
    })

    if (!existingBinding) {
      await prisma.contactTarget.create({
        data: {
          contactId: sampleContact.id,
          commsTargetId: firstTarget.id,
          isPrimary: true,
          channel: firstTarget.channel,
          toMasked: `${firstTarget.to.slice(0, 2)}****${firstTarget.to.slice(-2)}`,
          displayName: firstTarget.displayName
        }
      })
      console.log(`✓ 绑定示例联系人主目标: ${firstTarget.displayName}`)
    }
  }

  // ============================================
  // Release & Upgrade Center 默认数据
  // ============================================
  await prisma.upgradePolicy.upsert({
    where: {
      id: 'upgrade-policy-dev-default'
    },
    update: {
      workspaceId: LOCAL_WORKSPACE_ID,
      name: '默认开发升级策略',
      enabled: true,
      targetScopeJson: JSON.stringify({ envTypes: ['DEV', 'STAGING'] }),
      releaseChannelScopeJson: JSON.stringify({ allowedChannels: ['STABLE', 'BETA', 'CUSTOM'] }),
      autoDetectUpdates: true,
      requireBackup: true,
      requireApproval: false,
      requireMaintenanceWindow: false,
      allowAutoRollback: true
    },
    create: {
      id: 'upgrade-policy-dev-default',
      workspaceId: LOCAL_WORKSPACE_ID,
      name: '默认开发升级策略',
      enabled: true,
      targetScopeJson: JSON.stringify({ envTypes: ['DEV', 'STAGING'] }),
      releaseChannelScopeJson: JSON.stringify({ allowedChannels: ['STABLE', 'BETA', 'CUSTOM'] }),
      autoDetectUpdates: true,
      requireBackup: true,
      requireApproval: false,
      requireMaintenanceWindow: false,
      allowAutoRollback: true
    }
  })
  console.log('✓ 创建默认开发升级策略')

  await prisma.upgradePolicy.upsert({
    where: {
      id: 'upgrade-policy-prod-default'
    },
    update: {
      workspaceId: LOCAL_WORKSPACE_ID,
      name: '默认生产升级策略',
      enabled: true,
      targetScopeJson: JSON.stringify({ envTypes: ['PROD'] }),
      releaseChannelScopeJson: JSON.stringify({ allowedChannels: ['STABLE'] }),
      autoDetectUpdates: true,
      requireBackup: true,
      requireApproval: true,
      requireMaintenanceWindow: true,
      allowAutoRollback: true
    },
    create: {
      id: 'upgrade-policy-prod-default',
      workspaceId: LOCAL_WORKSPACE_ID,
      name: '默认生产升级策略',
      enabled: true,
      targetScopeJson: JSON.stringify({ envTypes: ['PROD'] }),
      releaseChannelScopeJson: JSON.stringify({ allowedChannels: ['STABLE'] }),
      autoDetectUpdates: true,
      requireBackup: true,
      requireApproval: true,
      requireMaintenanceWindow: true,
      allowAutoRollback: true
    }
  })
  console.log('✓ 创建默认生产升级策略')

  await prisma.maintenanceWindow.upsert({
    where: { id: 'maintenance-window-default' },
    update: {
      workspaceId: LOCAL_WORKSPACE_ID,
      name: '默认维护窗口',
      enabled: true,
      timezone: 'Asia/Shanghai',
      cronOrRule: 'weekly:sun:02:00-04:00',
      notes: '默认每周日凌晨 02:00-04:00 允许执行升级。'
    },
    create: {
      id: 'maintenance-window-default',
      workspaceId: LOCAL_WORKSPACE_ID,
      name: '默认维护窗口',
      enabled: true,
      timezone: 'Asia/Shanghai',
      cronOrRule: 'weekly:sun:02:00-04:00',
      notes: '默认每周日凌晨 02:00-04:00 允许执行升级。'
    }
  })
  console.log('✓ 创建默认维护窗口')

  const versionCatalogSeeds = [
    {
      component: 'OPENCLAW',
      version: '0.9.0',
      releaseChannel: 'STABLE',
      source: 'MANUAL',
      metadataJson: JSON.stringify({ notes: '稳定版本', targetTypes: ['LOCAL_HOST', 'REMOTE_HOST'] }),
      releaseNotesSummary: '稳定版 OpenClaw 控制平面。'
    },
    {
      component: 'GATEWAY',
      version: '0.9.1',
      releaseChannel: 'STABLE',
      source: 'MANUAL',
      metadataJson: JSON.stringify({ notes: '推荐网关版本', requiresRestart: true }),
      releaseNotesSummary: '修复网关健康检查与重连稳定性。'
    },
    {
      component: 'DOCKER_IMAGE',
      version: 'openclaw/gateway:0.9.1',
      releaseChannel: 'STABLE',
      source: 'DOCKER_REGISTRY',
      metadataJson: JSON.stringify({ image: 'openclaw/gateway', tag: '0.9.1' }),
      releaseNotesSummary: 'Docker 镜像稳定标签。'
    },
    {
      component: 'GATEWAY',
      version: '0.10.0-beta.1',
      releaseChannel: 'BETA',
      source: 'MANUAL',
      metadataJson: JSON.stringify({ notes: '测试版本', requiresBackup: true }),
      releaseNotesSummary: 'Beta 版本，包含新的升级校验链路。'
    }
  ]

  for (const item of versionCatalogSeeds) {
    await prisma.versionCatalog.upsert({
      where: {
        workspaceId_component_version_releaseChannel: {
          workspaceId: LOCAL_WORKSPACE_ID,
          component: item.component,
          version: item.version,
          releaseChannel: item.releaseChannel
        }
      },
      update: {
        source: item.source,
        metadataJson: item.metadataJson,
        releaseNotesSummary: item.releaseNotesSummary
      },
      create: {
        workspaceId: LOCAL_WORKSPACE_ID,
        component: item.component,
        version: item.version,
        releaseChannel: item.releaseChannel,
        source: item.source,
        metadataJson: item.metadataJson,
        releaseNotesSummary: item.releaseNotesSummary
      }
    })
  }
  console.log('✓ 创建版本目录示例数据')

  const firstDeploymentTarget = await prisma.deploymentTarget.findFirst({
    where: { workspaceId: LOCAL_WORKSPACE_ID },
    orderBy: { createdAt: 'asc' }
  })

  if (firstDeploymentTarget) {
    const detectedVersion = firstDeploymentTarget.targetType.includes('DOCKER')
      ? 'openclaw/gateway:0.9.0'
      : '0.9.0'

    await prisma.installedVersion.upsert({
      where: {
        targetId_component: {
          targetId: firstDeploymentTarget.id,
          component: firstDeploymentTarget.targetType.includes('DOCKER') ? 'DOCKER_IMAGE' : 'GATEWAY'
        }
      },
      update: {
        installedVersion: detectedVersion,
        source: firstDeploymentTarget.targetType.includes('REMOTE') ? 'SSH' : 'LOCAL',
        detailsJson: JSON.stringify({ seeded: true, targetType: firstDeploymentTarget.targetType }),
        detectedAt: new Date()
      },
      create: {
        workspaceId: LOCAL_WORKSPACE_ID,
        targetId: firstDeploymentTarget.id,
        component: firstDeploymentTarget.targetType.includes('DOCKER') ? 'DOCKER_IMAGE' : 'GATEWAY',
        installedVersion: detectedVersion,
        source: firstDeploymentTarget.targetType.includes('REMOTE') ? 'SSH' : 'LOCAL',
        detailsJson: JSON.stringify({ seeded: true, targetType: firstDeploymentTarget.targetType })
      }
    })
    console.log('✓ 创建已安装版本示例数据')
  }

  // ============================================
  // 创建默认 Pipeline（Support→PM→Dev→QA→Ops→Delivery）
  // ============================================
  console.log('创建默认 Pipeline...')
  const pipelineName = '标准交付流程'
  const existingPipeline = await prisma.pipeline.findUnique({ where: { name: pipelineName } })
  if (existingPipeline) {
    console.log(`✓ 默认 Pipeline 已存在: ${existingPipeline.name}`)
  } else {
    const defaultPipeline = await prisma.pipeline.create({
      data: {
        name: pipelineName,
        enabled: true,
        steps: {
          create: [
            {
              order: 1,
              roleName: 'Support',
              inputArtifacts: JSON.stringify([]),
              outputArtifacts: JSON.stringify(['CLIENT_MSG']),
              requireApprovalActions: JSON.stringify([]),
              allowRework: false
            },
            {
              order: 2,
              roleName: 'PM&Writer',
              inputArtifacts: JSON.stringify(['CLIENT_MSG']),
              outputArtifacts: JSON.stringify(['PRD', 'PLAN']),
              requireApprovalActions: JSON.stringify([]),
              allowRework: true
            },
            {
              order: 3,
              roleName: 'Dev',
              inputArtifacts: JSON.stringify(['PRD', 'PLAN']),
              outputArtifacts: JSON.stringify(['CODE_CHANGE']),
              requireApprovalActions: JSON.stringify(['MERGE_MAIN']),
              allowRework: true
            },
            {
              order: 4,
              roleName: 'QA',
              inputArtifacts: JSON.stringify(['CODE_CHANGE']),
              outputArtifacts: JSON.stringify(['TEST_CASES']),
              requireApprovalActions: JSON.stringify([]),
              allowRework: true
            },
            {
              order: 5,
              roleName: 'Ops',
              inputArtifacts: JSON.stringify(['CODE_CHANGE', 'TEST_CASES']),
              outputArtifacts: JSON.stringify(['DEPLOY']),
              requireApprovalActions: JSON.stringify(['DEPLOY_PROD']),
              allowRework: false
            },
            {
              order: 6,
              roleName: 'Support',
              inputArtifacts: JSON.stringify(['DEPLOY']),
              outputArtifacts: JSON.stringify(['DELIVERY_LIST', 'CLIENT_MSG']),
              requireApprovalActions: JSON.stringify(['SEND_EXTERNAL']),
              allowRework: false
            }
          ]
        }
      }
    })
    console.log(`✓ 创建默认 Pipeline: ${defaultPipeline.name}`)
  }

  console.log('✅ 种子数据填充完成！')
}

main()
  .catch((e) => {
    console.error('❌ 种子数据填充失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
