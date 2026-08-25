/**
 * Hermes Agent Mock Server
 * 
 * 用于测试 SoloForge Hermes Worker 集成
 * 模拟 Hermes Agent 的 API 行为
 * 
 * 运行方式：
 *   npx ts-node src/scripts/hermes-mock-server.ts
 *   或者
 *   npx tsx src/scripts/hermes-mock-server.ts
 */

import http from 'http'
import { v4 as uuidv4 } from 'uuid'

interface TaskRequest {
  taskType: string
  prompt: string
  context?: Record<string, unknown>
  traceId: string
}

interface TaskResponse {
  taskId: string
  status: string
  result?: Record<string, unknown>
  error?: string
  logs?: string[]
}

// 存储运行中的任务
const runningTasks = new Map<string, NodeJS.Timeout>()

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, data: unknown, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Trace-ID')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = req.url || '/'

  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`)

  try {
    // 健康检查
    if (url === '/health' && req.method === 'GET') {
      sendJson(res, { status: 'ok', timestamp: new Date().toISOString() })
      return
    }

    // 创建任务
    if (url === '/api/task' && req.method === 'POST') {
      const body = await parseBody(req) as TaskRequest
      const taskId = body.traceId || uuidv4()

      console.log(`  → 创建任务: ${taskId}, 类型: ${body.taskType}`)
      console.log(`  → Prompt: ${body.prompt.slice(0, 100)}...`)

      // 模拟异步执行
      const delay = Math.random() * 3000 + 2000 // 2-5秒

      setTimeout(() => {
        const success = Math.random() > 0.2 // 80% 成功率
        const taskResponse: TaskResponse = {
          taskId,
          status: success ? 'SUCCEEDED' : 'FAILED',
          result: success ? {
            output: `Hermes Mock 响应: 已完成任务 "${body.taskType}"`,
            prompt: body.prompt,
            processedAt: new Date().toISOString(),
            mockResult: true
          } : undefined,
          error: success ? undefined : '模拟执行失败',
          logs: [
            `[${new Date().toISOString()}] 开始处理任务...`,
            `[${new Date().toISOString()}] 分析 prompt...`,
            `[${new Date().toISOString()}] 执行任务...`,
            `[${new Date().toISOString()}] 完成！`
          ]
        }

        runningTasks.delete(taskId)
        console.log(`  → 任务完成: ${taskId}, 状态: ${taskResponse.status}`)
      }, delay)

      sendJson(res, { taskId, status: 'RUNNING' })
      return
    }

    // 查询任务状态
    const matchStatus = url.match(/^\/api\/task\/([^/]+)$/)
    if (matchStatus && req.method === 'GET') {
      const taskId = matchStatus[1]
      console.log(`  → 查询任务状态: ${taskId}`)

      // 模拟任务状态
      const taskResponse: TaskResponse = {
        taskId,
        status: 'SUCCEEDED',
        result: {
          output: `Hermes Mock 响应: 任务 ${taskId} 已完成`,
          mockResult: true
        },
        logs: ['任务已完成']
      }

      sendJson(res, taskResponse)
      return
    }

    // 取消任务
    const matchCancel = url.match(/^\/api\/task\/([^/]+)\/cancel$/)
    if (matchCancel && req.method === 'POST') {
      const taskId = matchCancel[1]
      console.log(`  → 取消任务: ${taskId}`)

      runningTasks.delete(taskId)
      sendJson(res, { taskId, status: 'CANCELED' })
      return
    }

    // 未知路由
    sendJson(res, { error: 'Not Found' }, 404)
  } catch (error) {
    console.error('  → 错误:', error)
    sendJson(res, { error: 'Internal Server Error' }, 500)
  }
}

const PORT = 8080
const server = http.createServer(handleRequest)

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          Hermes Agent Mock Server                            ║
║═══════════════════════════════════════════════════════════════║
║  状态: 运行中                                                 ║
║  端口: ${PORT}                                                  ║
║  地址: http://localhost:${PORT}                                 ║
╠═══════════════════════════════════════════════════════════════╣
║  API 端点:                                                   ║
║  - GET  /health              健康检查                         ║
║  - POST /api/task            创建任务                         ║
║  - GET  /api/task/:id        查询任务状态                     ║
║  - POST /api/task/:id/cancel 取消任务                        ║
╠═══════════════════════════════════════════════════════════════╣
║  模拟行为:                                                   ║
║  - 任务延迟: 2-5秒                                           ║
║  - 成功率: 80%                                                ║
║  - 返回模拟结果                                                ║
╚═══════════════════════════════════════════════════════════════╝
  `)
})

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在关闭 Mock Server...')
  runningTasks.forEach((timeout) => clearTimeout(timeout))
  server.close(() => {
    console.log('Mock Server 已关闭')
    process.exit(0)
  })
})
