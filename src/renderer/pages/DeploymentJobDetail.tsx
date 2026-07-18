import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { getApiPort } from '../lib/api'
import { PageHeader } from '../components/ui/PageHeader'
import { SectionCard } from '../components/ui/SectionCard'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { translateEnum } from '../lib/i18n-helpers'

interface DeploymentTargetSummary {
  id: string
  name: string
  host?: string | null
  gatewayUrl?: string | null
  envType?: string
}

interface DeploymentJob {
  id: string
  workspaceId: string
  targetId: string
  type: string
  traceId: string
  requestJson: string
  status: string
  resultJson?: string | null
  logs?: string | null
  attempts?: number
  nextRetryAt?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
  target: DeploymentTargetSummary
}

interface ParsedDeploymentJobResult {
  actionId?: string
  hostAgentId?: string
  dispatch?: string
  reason?: string
  status?: string
  errorSummary?: string
}

function parseJsonText(text?: string | null): string {
  if (!text) return '—'
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function parseResultMeta(text?: string | null): ParsedDeploymentJobResult | null {
  if (!text) return null
  try {
    return JSON.parse(text) as ParsedDeploymentJobResult
  } catch {
    return null
  }
}

export function DeploymentJobDetail() {
  const { t } = useTranslation(['common'])
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<DeploymentJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('缺少 Deployment Job ID')
        setLoading(false)
        return
      }

      try {
        const port = await getApiPort()
        const response = await fetch(`http://127.0.0.1:${port}/api/deployment-jobs/${id}`)
        const data = await response.json() as DeploymentJob | null
        if (!response.ok || !data) {
          throw new Error('获取 Deployment Job 详情失败')
        }
        setJob(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取 Deployment Job 详情失败')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  if (loading) {
    return <LoadingState message="加载 Deployment Job 中..." />
  }

  if (error || !job) {
    return <EmptyState message={error || 'Deployment Job 不存在'} tone="danger" />
  }

  const parsedResult = parseResultMeta(job.resultJson)
  const jobStatusText = translateEnum(t, 'operationStatusMap', job.status)

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Deployment Job · ${job.type}`}
        description={`${jobStatusText} · ${job.target.name}`}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/deployments" className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--muted))] hover:opacity-90">
              返回部署管理
            </Link>
            <Link to={`/deployments/${job.targetId}`} className="px-4 py-2 text-sm rounded-workshop-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">
              查看部署详情
            </Link>
          </div>
        }
      />

      <SectionCard title="Deployment Job 概览" description="查看作业的目标、状态与时间信息。">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-[hsl(var(--muted-foreground))]">Job ID</div><div className="font-mono text-[hsl(var(--foreground))]">{job.id}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">状态</div><div className="text-[hsl(var(--foreground))]">{jobStatusText}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Target</div><div className="text-[hsl(var(--foreground))]">{job.target.name}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">Trace ID</div><div className="font-mono text-[hsl(var(--foreground))]">{job.traceId}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">创建时间</div><div className="text-[hsl(var(--foreground))]">{new Date(job.createdAt).toLocaleString('zh-CN')}</div></div>
          <div><div className="text-[hsl(var(--muted-foreground))]">更新时间</div><div className="text-[hsl(var(--foreground))]">{new Date(job.updatedAt).toLocaleString('zh-CN')}</div></div>
          <div className="md:col-span-2"><div className="text-[hsl(var(--muted-foreground))]">错误</div><div className="text-[hsl(var(--foreground))]">{job.lastError || '—'}</div></div>
          {parsedResult?.actionId && (
            <div>
              <div className="text-[hsl(var(--muted-foreground))]">关联 Agent Action</div>
              <Link to={`/agent-actions/${parsedResult.actionId}`} className="text-[hsl(var(--google-blue))] hover:underline">
                {parsedResult.actionId}
              </Link>
            </div>
          )}
          {parsedResult?.hostAgentId && (
            <div>
              <div className="text-[hsl(var(--muted-foreground))]">关联 Host Agent</div>
              <Link to={`/host-agents/${parsedResult.hostAgentId}`} className="text-[hsl(var(--google-blue))] hover:underline">
                {parsedResult.hostAgentId}
              </Link>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="请求 / 结果 / 日志" description="用于排查部署作业的完整上下文。">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">请求</div>
            <pre className="text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto max-h-80">{parseJsonText(job.requestJson)}</pre>
          </div>
          <div>
            <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">结果</div>
            <pre className="text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto max-h-80">{parseJsonText(job.resultJson)}</pre>
          </div>
        </div>
        {job.logs && (
          <div className="mt-4">
            <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">日志</div>
            <pre className="text-xs font-mono p-3 rounded-workshop-md bg-[hsl(var(--muted))] overflow-auto max-h-80 whitespace-pre-wrap">{job.logs}</pre>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
