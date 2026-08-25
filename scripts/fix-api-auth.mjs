/**
 * 修复 API 认证问题：将所有裸 fetch 调用替换为 apiFetch
 * 
 * 问题：很多页面使用 `fetch(\`http://127.0.0.1:${port}/api/...\`)` 没有携带认证 Token
 * 解决：使用 `apiFetch('/api/...')` 自动携带认证头
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pagesDir = join(__dirname, '../src/renderer/pages')

const files = readdirSync(pagesDir).filter(f => f.endsWith('.tsx'))

let fixed = 0
let errors = 0

for (const file of files) {
  const filePath = join(pagesDir, file)
  let content = readFileSync(filePath, 'utf-8')
  const originalContent = content

  // 1. 替换 import { getApiPort } 为 import { apiFetch }
  content = content.replace(
    /import\s*\{([^}]*)\s*,\s*getApiPort\s*([^}]*)\}\s*from\s*['"]\.\.\/lib\/api['"]/g,
    (match, before, after) => {
      // 移除 getApiPort，保留其他导入
      const parts = (before + ',' + after).split(',').filter(p => p.trim() !== 'getApiPort')
      return `import { apiFetch${parts.length > 0 ? ', ' + parts.join(',') : ''} } from '../lib/api'`
    }
  )
  
  // 2. 替换纯 getApiPort 导入
  content = content.replace(
    /import\s*\{\s*getApiPort\s*\}\s*from\s*['"]\.\.\/lib\/api['"]/g,
    `import { apiFetch } from '../lib/api'`
  )

  // 3. 替换 apiPort 状态变量声明
  content = content.replace(
    /const\s*\[\s*apiPort\s*,\s*setApiPort\s*\]\s*=\s*useState<number\s*\|\s*null>\s*\(\s*null\s*\)/g,
    ''
  )

  // 4. 替换 getApiPort().then(async port => { ... }) 模式
  // 这是一个复杂的模式，需要小心处理
  content = content.replace(
    /getApiPort\(\)\.then\(async\s*\(?\s*port\s*\)?\s*=>\s*\{([\s\S]*?)\}\s*\)/g,
    (match, body) => {
      // 移除 body 中的 setApiPort(port) 调用
      let cleanBody = body.replace(/setApiPort\(port\)\s*;?\s*/g, '')
      // 替换 fetch 调用中的 port 变量
      cleanBody = cleanBody.replace(/fetch\(`http:\/\/127\.0\.0\.1:\$\{port\}/g, 'apiFetch(')
      cleanBody = cleanBody.replace(/fetch\(`http:\/\/localhost:\$\{port\}/g, 'apiFetch(')
      cleanBody = cleanBody.replace(/\$\{port\}\//g, "'/")
      cleanBody = cleanBody.replace(/\$\{port\}\)/g, "')")
      cleanBody = cleanBody.replace(/\$\{apiPort\}/g, '') // 对于 apiPort 变量也处理
      cleanBody = cleanBody.replace(/apiPort\)/g, "')") // 修复参数闭合
      return `{\n${cleanBody}}`
    }
  )

  // 5. 替换 fetch(`http://127.0.0.1:${port}/ 模式
  content = content.replace(
    /fetch\(`http:\/\/127\.0\.0\.1:\$\{port\}\//g,
    'apiFetch(\'/', 
  )
  content = content.replace(
    /fetch\(`http:\/\/127\.0\.0\.1:\$\{apiPort\}\//g,
    'apiFetch(\'/', 
  )
  content = content.replace(
    /fetch\(`http:\/\/localhost:\$\{port\}\//g,
    'apiFetch(\'/', 
  )

  // 6. 替换 .then(port => { ... }) 模式
  content = content.replace(
    /\.then\(async\s*\(?\s*port\s*\)?\s*=>\s*\{([\s\S]*?)\}\s*\)/g,
    (match, body) => {
      let cleanBody = body.replace(/setApiPort\(port\)\s*;?\s*/g, '')
      cleanBody = cleanBody.replace(/fetch\(`http:\/\/127\.0\.0\.1:\$\{port\}/g, 'apiFetch(')
      cleanBody = cleanBody.replace(/fetch\(`http:\/\/localhost:\$\{port\}/g, 'apiFetch(')
      cleanBody = cleanBody.replace(/\$\{port\}\//g, "'/")
      cleanBody = cleanBody.replace(/\$\{port\}\)/g, "')")
      cleanBody = cleanBody.replace(/\$\{apiPort\}/g, '')
      cleanBody = cleanBody.replace(/apiPort\)/g, "')")
      return `{\n${cleanBody}}`
    }
  )

  // 7. 处理简单的 fetch 调用
  content = content.replace(
    /fetch\(`http:\/\/127\.0\.0\.1:\$\{port\}([^`]*`)\)/g,
    (match, path) => `apiFetch(${path})`
  )
  content = content.replace(
    /fetch\(`http:\/\/localhost:\$\{port\}([^`]*`)\)/g,
    (match, path) => `apiFetch(${path})`
  )
  content = content.replace(
    /fetch\(`http:\/\/127\.0\.0\.1:\$\{apiPort\}([^`]*`)\)/g,
    (match, path) => `apiFetch(${path})`
  )

  // 8. 处理带 response.json() 的模式
  content = content.replace(
    /const\s+\w+\s*=\s*await\s+fetch\(`([^`]+)`\)\s*;?\s*const\s+\w+\s*=\s*await\s+\w+\.json\(\)/g,
    (match, url) => `const result = await apiFetch(${url})`
  )

  // 9. 替换 fetchWorkspaces 等函数
  content = content.replace(
    /const\s+fetchWorkspaces\s*=\s*async\s*\(\s*port\s*:\s*number\s*\)\s*=>\s*\{([^}]+)\}/g,
    (match, body) => {
      let cleanBody = body.replace(/const\s+response\s*=\s*await\s+fetch\(`[^`]+`\)\s*;?\s*const\s+\w+\s*=\s*await\s+\w+\.json\(\)/g, '')
      return `const fetchWorkspaces = async () => { ${cleanBody}}`
    }
  )

  // 10. 移除对 apiPort 的检查
  content = content.replace(/if\s*\(\s*!\s*apiPort\s*\)\s*return/g, '')

  // 11. 处理 fetch with async/await pattern
  content = content.replace(
    /const\s+(\w+)\s*=\s*await\s+fetch\(`([^`]+)`\)/g,
    (match, varName, url) => {
      if (url.includes('${port}') || url.includes('${apiPort}')) {
        // 跳过包含变量的 URL，它们在其他规则中处理
        return match
      }
      return `const ${varName} = await apiFetch('${url}')`
    }
  )

  // 12. 移除 useEffect 中的 getApiPort
  content = content.replace(
    /getApiPort\(\)\.then\(async\s*\(?\s*port\s*\)?\s*=>\s*\{/g,
    'const init = async () => {'
  )

  // 13. 移除 response.json() 模式
  content = content.replace(
    /const\s+response\s*=\s*await\s+fetch\(`([^`]+)`\)\s*;?\s*const\s+(\w+)\s*=\s*await\s+response\.json\(\)/g,
    (match, url, varName) => `const ${varName} = await apiFetch(${url})`
  )

  // 14. 移除多余的 }) 结尾
  content = content.replace(/\}\s*\)\s*\.finally\(\s*\(\)\s*=>\s*setLoading\(false\)\s*\)/g, 
    '}.finally(() => setLoading(false))')
  
  // 15. 修复 apiFetch 后的 await response.json()
  content = content.replace(/}\s*;\s*const\s+\w+\s*=\s*await\s+\w+\.json\(\)/g, '}')

  if (content !== originalContent) {
    try {
      writeFileSync(filePath, content)
      fixed++
      console.log(`✅ Fixed: ${file}`)
    } catch (e) {
      errors++
      console.error(`❌ Error writing ${file}: ${e.message}`)
    }
  }
}

console.log(`\n📊 Summary: ${fixed} files fixed, ${errors} errors`)
