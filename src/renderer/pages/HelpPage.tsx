import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/ui/PageHeader'

export function HelpPage() {
  const { t } = useTranslation(['help', 'common'])
  const [activeSection, setActiveSection] = useState('quick-start')

  const sections = [
    { id: 'quick-start', label: t('help:sections.quickStart') },
    { id: 'tickets', label: t('help:sections.tickets') },
    { id: 'team', label: t('help:sections.team') },
    { id: 'approvals', label: t('help:sections.approvals') },
    { id: 'config', label: t('help:sections.config') },
    { id: 'deployments', label: t('help:sections.deployments') },
    { id: 'faq', label: t('help:sections.faq') },
    { id: 'shortcuts', label: t('help:sections.shortcuts') }
  ]

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId)
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div data-testid="help-page" className="space-y-6">
      <PageHeader
        title={t('help:title')}
        description={t('help:description')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* 左侧目录导航 */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-4 shadow-workshop-sm">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              {t('help:navigation.title')}
            </div>
            <ul className="space-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className={`w-full rounded-workshop-md px-3 py-2 text-left text-sm transition-colors ${
                      activeSection === section.id
                        ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] font-medium'
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent)_/_0.5)] hover:text-[hsl(var(--foreground))]'
                    }`}
                  >
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* 右侧内容区 */}
        <main className="space-y-8">
          {/* 快速开始 */}
          <section id="quick-start" className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
            <h2 className="mb-4 text-2xl font-bold text-[hsl(var(--foreground))]">{t('help:quickStart.title')}</h2>
            <div className="space-y-4 text-sm text-[hsl(var(--foreground))]">
              <p>{t('help:quickStart.intro')}</p>
              <ol className="ml-6 list-decimal space-y-2">
                <li>{t('help:quickStart.step1')}</li>
                <li>{t('help:quickStart.step2')}</li>
                <li>{t('help:quickStart.step3')}</li>
                <li>{t('help:quickStart.step4')}</li>
              </ol>
            </div>
          </section>

          {/* 工单管理 */}
          <section id="tickets" className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
            <h2 className="mb-4 text-2xl font-bold text-[hsl(var(--foreground))]">{t('help:tickets.title')}</h2>
            <div className="space-y-4 text-sm text-[hsl(var(--foreground))]">
              <p>{t('help:tickets.intro')}</p>
              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:tickets.statusFlow.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:tickets.statusFlow.description')}</p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:tickets.artifacts.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:tickets.artifacts.description')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* 团队管理 */}
          <section id="team" className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
            <h2 className="mb-4 text-2xl font-bold text-[hsl(var(--foreground))]">{t('help:team.title')}</h2>
            <div className="space-y-4 text-sm text-[hsl(var(--foreground))]">
              <p>{t('help:team.intro')}</p>
              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:team.roles.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:team.roles.description')}</p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:team.agents.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:team.agents.description')}</p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:team.tools.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:team.tools.description')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* 审批流程 */}
          <section id="approvals" className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
            <h2 className="mb-4 text-2xl font-bold text-[hsl(var(--foreground))]">{t('help:approvals.title')}</h2>
            <div className="space-y-4 text-sm text-[hsl(var(--foreground))]">
              <p>{t('help:approvals.intro')}</p>
              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:approvals.highRisk.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:approvals.highRisk.description')}</p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:approvals.workflow.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:approvals.workflow.description')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* 配置中心 */}
          <section id="config" className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
            <h2 className="mb-4 text-2xl font-bold text-[hsl(var(--foreground))]">{t('help:config.title')}</h2>
            <div className="space-y-4 text-sm text-[hsl(var(--foreground))]">
              <p>{t('help:config.intro')}</p>
              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:config.models.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:config.models.description')}</p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:config.security.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:config.security.description')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* 部署管理 */}
          <section id="deployments" className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
            <h2 className="mb-4 text-2xl font-bold text-[hsl(var(--foreground))]">{t('help:deployments.title')}</h2>
            <div className="space-y-4 text-sm text-[hsl(var(--foreground))]">
              <p>{t('help:deployments.intro')}</p>
              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:deployments.modes.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:deployments.modes.description')}</p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">{t('help:deployments.operations.title')}</h3>
                  <p className="text-[hsl(var(--muted-foreground))]">{t('help:deployments.operations.description')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* 常见问题 */}
          <section id="faq" className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
            <h2 className="mb-4 text-2xl font-bold text-[hsl(var(--foreground))]">{t('help:faq.title')}</h2>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((num) => (
                <div key={num} className="rounded-workshop-md border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--muted)_/_0.46)] p-4">
                  <h3 className="mb-2 font-semibold text-[hsl(var(--foreground))]">
                    {t(`help:faq.q${num}.question`)}
                  </h3>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {t(`help:faq.q${num}.answer`)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* 键盘快捷键 */}
          <section id="shortcuts" className="rounded-workshop-lg border border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))] p-6 shadow-workshop-sm">
            <h2 className="mb-4 text-2xl font-bold text-[hsl(var(--foreground))]">{t('help:shortcuts.title')}</h2>
            <div className="space-y-3">
              {[
                { key: 'Ctrl/Cmd + K', action: t('help:shortcuts.search') },
                { key: 'Ctrl/Cmd + /', action: t('help:shortcuts.help') },
                { key: 'Ctrl/Cmd + B', action: t('help:shortcuts.sidebar') },
                { key: 'Ctrl/Cmd + R', action: t('help:shortcuts.refresh') },
                { key: 'Esc', action: t('help:shortcuts.close') }
              ].map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between rounded-workshop-md border border-[hsl(var(--border)_/_0.75)] bg-[hsl(var(--muted)_/_0.46)] px-4 py-3">
                  <span className="text-sm text-[hsl(var(--foreground))]">{shortcut.action}</span>
                  <kbd className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs font-mono text-[hsl(var(--muted-foreground))]">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
