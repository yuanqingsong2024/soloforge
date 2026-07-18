# Security Policy

> Last Updated: 2026-07-08

---

## 🔒 Security Philosophy

SoloForge is designed with security as a core principle. We follow the principle of "secure by default" and implement multiple layers of protection:

1. **Least Privilege**: AI agents have no high-risk tools by default
2. **Human-in-the-Loop**: High-risk actions require manual approval
3. **Complete Audit**: All critical actions are logged in append-only audit logs
4. **Key Security**: Tokens/API keys stored in OS-level secure storage (Keychain)

---

## 🚨 Reporting Security Vulnerabilities

### Responsible Disclosure

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly:

**DO:**
- Report vulnerabilities through private channels
- Give us reasonable time to respond and fix
- Provide detailed reproduction steps
- Avoid accessing or modifying other users' data

**DON'T:**
- Publicly disclose vulnerabilities before fixes are released
- Attempt to exploit vulnerabilities for proof-of-concept
- Share vulnerability details with others until fixed

### How to Report

**Email:** security@soloforge.dev

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

**Response Timeline:**
- Acknowledgment: 24-48 hours
- Initial assessment: 1 week
- Fix timeline: Based on severity (see below)

### Severity Classification

| Severity | Examples | Fix Timeline |
|----------|----------|--------------|
| **Critical** | Remote code execution, data breach | 24-72 hours |
| **High** | Privilege escalation, SQL injection | 1-2 weeks |
| **Medium** | XSS, CSRF, information disclosure | 2-4 weeks |
| **Low** | Minor information leaks, UX issues | Next release |

---

## 🔐 Security Features

### Credential Storage

- API tokens and passwords stored in OS Keychain (Electron safeStorage)
- No sensitive data stored in plain text
- UI only displays masked credentials (e.g., `sk-****abcd`)

### Audit Logging

- All critical actions logged to append-only audit log
- trace_id贯穿调用链
- Tamper-evident hash chain (SHA-256)
- Sensitive fields automatically masked

### Approval Workflow

High-risk actions require manual approval:

| Action Type | Description | Requires Approval |
|-------------|-------------|-------------------|
| `SEND_EXTERNAL` | External communication | ✅ Yes |
| `MERGE_MAIN` | Merge to main branch | ✅ Yes |
| `DEPLOY_PROD` | Production deployment | ✅ Yes |
| `EXPORT_DATA` | Data export | ✅ Yes |
| `CHANGE_CONFIG` | Configuration change | ✅ Yes |
| `ROTATE_TOKEN` | Token rotation | ✅ Yes |

### Workspace Isolation

- Multi-workspace support with data isolation
- Keychain namespace: `soloforge/<workspaceId>/<secretName>`
- Workspace-level policies (Policy-as-Code)

### Host Agent Security

- Bootstrap token with expiration (15 minutes default)
- Long-term agent token stored securely
- Whitelist-based action model (no arbitrary shell execution)
- Actions audited with full trace chain

---

## 🔑 Security Best Practices

### For Users

1. **Keep Software Updated**
   - Always use the latest version of SoloForge
   - Enable automatic updates (if available)

2. **Credential Management**
   - Rotate tokens periodically
   - Never share credentials
   - Use strong, unique passwords

3. **Workspace Security**
   - Set appropriate workspace environment types (DEV/STAGING/PROD)
   - Enable read-only mode for production workspaces
   - Review audit logs regularly

4. **Network Security**
   - Use trusted networks
   - Enable HTTPS/WSS for remote connections
   - Configure trusted proxies properly (never use `0.0.0.0/0`)

### For Developers

1. **Code Security**
   - Never commit secrets to the repository
   - Use environment variables for configuration
   - Validate and sanitize all user input
   - Use parameterized queries (Prisma handles this)

2. **Dependency Security**
   - Regularly update dependencies
   - Use `npm audit` to check for vulnerabilities
   - Review third-party code before integration

3. **API Security**
   - Implement rate limiting
   - Validate request bodies
   - Use proper error handling (no stack traces in production)

---

## 🔒 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SoloForge Security Architecture               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │   Renderer   │────▶│    IPC       │────▶│     Main     │   │
│  │   Process    │     │   Bridge     │     │   Process    │   │
│  └──────────────┘     └──────────────┘     └──────────────┘   │
│         │                                          │            │
│         │              ┌──────────────┐            │            │
│         └─────────────▶│  Local API   │◀───────────┘            │
│                        │   (Fastify)  │                         │
│                        └──────────────┘                         │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         │                    │                    │             │
│  ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐      │
│  │   Prisma    │     │  Approval   │     │  Keychain   │      │
│  │   (SQLite)  │     │   Guard     │     │(safeStorage)│      │
│  └─────────────┘     └─────────────┘     └─────────────┘      │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                   │
│                        ┌─────▼─────┐                            │
│                        │  Audit    │                            │
│                        │   Log     │                            │
│                        │(Append-only)│                           │
│                        └───────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Security Checklist

### Before Release

- [ ] All secrets removed from code
- [ ] No hardcoded credentials
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak sensitive info
- [ ] Audit logs capture all critical actions
- [ ] Approval workflow enforced
- [ ] Keychain used for all credentials
- [ ] CORS configured properly
- [ ] Rate limiting implemented
- [ ] Security headers set

### Production Deployment

- [ ] HTTPS/WSS enforced
- [ ] Trusted proxies configured
- [ ] Logs don't contain sensitive data
- [ ] Backup encryption enabled
- [ ] Monitoring and alerting configured
- [ ] Incident response plan in place

---

## 🔧 Security Updates

### How We Handle Security Issues

1. **Internal Assessment**
   - Confirm the vulnerability
   - Assess severity and impact
   - Identify affected versions

2. **Fix Development**
   - Develop and test the fix privately
   - Prepare security advisory
   - Update affected dependencies

3. **Release Process**
   - Deploy fix to production
   - Publish security advisory
   - Notify affected users
   - Update documentation

4. **Post-Release**
   - Verify fix effectiveness
   - Monitor for exploitation attempts
   - Gather feedback

### Update Channels

- **GitHub Releases**: https://github.com/soloforge/soloforge/releases
- **Security Advisories**: https://github.com/soloforge/soloforge/security/advisories
- **Email Notifications**: Subscribe to security@soloforge.dev

---

## 📞 Contact

For security-related inquiries:

- **Email**: security@soloforge.dev
- **PGP Key**: Available upon request
- **PGP Fingerprint**: To be provided

For non-security issues, use:
- **GitHub Issues**: https://github.com/soloforge/soloforge/issues
- **Discord**: https://discord.gg/soloforge

---

## 📜 Policy Updates

This security policy is reviewed and updated regularly. The latest version is always available at:

https://github.com/soloforge/soloforge/blob/main/SECURITY.md

**Changelog:**
- 2026-07-08: Initial security policy

---

**Thank you for helping keep SoloForge secure! 🛡️**
