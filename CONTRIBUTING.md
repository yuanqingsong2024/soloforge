# Contributing to SoloForge

Thank you for your interest in contributing to SoloForge! This document provides guidelines and instructions for contributing.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

---

## 🤝 Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone. We do not tolerate harassment, discrimination, or inappropriate behavior.

**Expected Behavior:**
- Be respectful and considerate in communication
- Focus on what is best for the community
- Show empathy towards other community members
- Gracefully accept constructive criticism

**Unacceptable Behavior:**
- Harassment, discrimination, or personal attacks
- Trolling, insulting comments, or political attacks
- Public or private harassment
- Publishing others' private information

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (we recommend using [nvm](https://github.com/nvm-sh/nvm))
- npm 9+ or pnpm 8+
- Git 2.30+
- SQLite (bundled with the app)

### Fork the Repository

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/soloforge.git
   cd soloforge
   ```

3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/soloforge/soloforge.git
   ```

---

## 🛠️ Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Database

```bash
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

### 3. Run Development Server

```bash
npm run dev
```

This will:
- Start the Vite dev server at http://localhost:5173
- Start the Electron application
- Start the Fastify API server on a random port

### 4. Build for Production

```bash
npm run build
```

### 5. Run Tests

```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# All tests
npm run test
```

---

## 🔧 Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Branch Naming Conventions

| Type | Prefix | Example |
|------|--------|---------|
| Feature | `feature/` | `feature/add-plugin-system` |
| Bug Fix | `fix/` | `fix/login-redirect-loop` |
| Documentation | `docs/` | `docs/update-api-docs` |
| Refactoring | `refactor/` | `refactor/extract-service` |
| Testing | `test/` | `test/add-auth-tests` |
| Chore | `chore/` | `chore/update-dependencies` |

### 3. Make Your Changes

Follow the coding standards below and ensure:
- All tests pass
- TypeScript compiles without errors
- New code includes tests
- Documentation is updated

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature description"
```

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
git commit -m "feat(auth): add OAuth2 login support"
git commit -m "fix(dashboard): resolve memory leak on refresh"
git commit -m "docs(api): update endpoint documentation"
```

---

## 📤 Submitting Changes

### 1. Sync with Upstream

Before pushing your changes, ensure your branch is up-to-date:

```bash
git fetch upstream
git rebase upstream/main
```

### 2. Push Your Branch

```bash
git push origin feature/your-feature-name
```

### 3. Create a Pull Request

1. Go to the repository on GitHub
2. Click "New Pull Request"
3. Select your branch from the dropdown
4. Fill in the PR template:

```markdown
## Description
<!-- What does this PR do? -->

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature that would cause issues)
- [ ] Documentation update

## Testing
<!-- How was this tested? -->

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] Tests pass locally
- [ ] I have added tests that prove my fix/feature works
```

### 4. Review Process

- PRs require at least one approval
- All CI checks must pass
- No merge conflicts

---

## 📏 Coding Standards

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig.json)
- Avoid `any` type - use `unknown` when type is truly unknown
- Use interfaces for object shapes
- Use type aliases for unions and intersections
- Prefer `const` over `let`
- Use async/await over raw promises

### Example

```typescript
// ✅ Good
interface User {
  id: string
  name: string
  email: string
  createdAt: Date
}

async function getUser(id: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { id } })
  return user
}

// ❌ Bad
async function getUser(id: any): Promise<any> {
  const user = await prisma.user.findUnique({ where: { id } })
  return user
}
```

### React Components

- Use functional components with hooks
- Define prop interfaces above the component
- Use meaningful variable names
- Extract reusable logic into custom hooks
- Co-locate styles with components when possible

### Example

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  onClick?: () => void
}

export function Button({ variant = 'primary', size = 'md', children, onClick }: ButtonProps) {
  const baseClasses = 'rounded font-medium transition-colors'
  const variantClasses = { primary: 'bg-blue-600 text-white', secondary: 'bg-gray-200' }
  
  return (
    <button className={`${baseClasses} ${variantClasses[variant]}`} onClick={onClick}>
      {children}
    </button>
  )
}
```

### Error Handling

- Never use empty catch blocks: `catch (e) {}`
- Always log or handle errors appropriately
- Use custom error types for specific error cases
- Return meaningful error messages

```typescript
// ✅ Good
try {
  await riskyOperation()
} catch (error) {
  logger.error('Operation failed', { error, context })
  throw new OperationError('Failed to complete operation', { cause: error })
}

// ❌ Bad
try {
  await riskyOperation()
} catch (e) {}
```

### Security

- Never commit secrets, API keys, or tokens
- Use environment variables for configuration
- Validate and sanitize user input
- Follow the security guidelines in SECURITY.md

---

## 🧪 Testing

### Test Structure

```
tests/
├── unit/           # Unit tests for individual functions/modules
├── integration/    # Integration tests for API endpoints
└── e2e/           # End-to-end tests with Playwright
```

### Writing Tests

**Unit Tests:**
```typescript
import { describe, it, expect } from 'node:test'
import { calculateHealthScore } from '../../src/main/services/dashboard-service'

describe('calculateHealthScore', () => {
  it('should return 100 for healthy system', () => {
    const result = calculateHealthScore({
      alerts: [],
      drifts: [],
      agentsOnline: 5,
      agentsTotal: 5
    })
    expect(result.score).toBe(100)
  })
})
```

**E2E Tests:**
```typescript
import { test, expect } from '@playwright/test'

test('user can login successfully', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[name="email"]', 'user@example.com')
  await page.fill('[name="password"]', 'password')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/dashboard')
})
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx playwright test tests/e2e/dashboard.spec.ts

# Run with coverage
npm run test:coverage

# Run in debug mode
npm run test:e2e:debug
```

---

## 📚 Documentation

### Code Documentation

- Add JSDoc comments for public functions
- Document complex business logic
- Include type definitions
- Use Chinese comments (per project convention)

```typescript
/**
 * 计算仪表盘健康分数
 * 
 * @param metrics - 指标数据
 * @returns 健康分数 (0-100) 及各因子详情
 * 
 * @example
 * const result = calculateHealthScore({
 *   alerts: [alert1, alert2],
 *   agentsOnline: 5
 * })
 */
export function calculateHealthScore(metrics: DashboardMetrics): HealthScore {
  // implementation
}
```

### README Updates

- Update README.md when adding new features
- Include setup instructions for new dependencies
- Add examples for new functionality
- Keep screenshots up-to-date

---

## 🎯 Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows the coding standards
- [ ] Tests are written and passing
- [ ] Documentation is updated
- [ ] No console.log or debug statements
- [ ] No TODO comments left in code
- [ ] No sensitive data committed
- [ ] TypeScript compiles without errors
- [ ] All E2E tests pass
- [ ] Commit messages follow the convention
- [ ] PR description is complete

---

## 📞 Getting Help

- **Discord**: Join our community at https://discord.gg/soloforge
- **GitHub Issues**: For bug reports and feature requests
- **Email**: contact@soloforge.dev

---

## 📄 License

By contributing to SoloForge, you agree that your contributions will be licensed under the terms of the [LICENSE.md](../LICENSE.md) file.

---

**Thank you for contributing to SoloForge! 🚀**
