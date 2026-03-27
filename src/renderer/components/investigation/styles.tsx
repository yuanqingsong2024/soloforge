export function severityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'text-[hsl(var(--destructive))] bg-[hsl(var(--destructive)_/_0.1)] border-[hsl(var(--destructive)_/_0.2)]'
    case 'ERROR':
      return 'text-[hsl(var(--google-red))] bg-[hsl(var(--google-red)_/_0.1)] border-[hsl(var(--google-red)_/_0.2)]'
    case 'WARN':
      return 'text-[hsl(var(--google-yellow))] bg-[hsl(var(--google-yellow)_/_0.1)] border-[hsl(var(--google-yellow)_/_0.2)]'
    case 'INFO':
      return 'text-[hsl(var(--google-blue))] bg-[hsl(var(--google-blue)_/_0.1)] border-[hsl(var(--google-blue)_/_0.2)]'
    default:
      return 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] border-[hsl(var(--border))]'
  }
}

export function severityDotColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
    case 'ERROR':
      return 'bg-[hsl(var(--google-red))]'
    case 'WARN':
      return 'bg-[hsl(var(--google-yellow))]'
    case 'INFO':
      return 'bg-[hsl(var(--google-blue))]'
    default:
      return 'bg-[hsl(var(--muted-foreground))]'
  }
}

export function traceCardSeverityStyle(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
    case 'ERROR':
      return 'border-[hsl(var(--google-red)_/_0.35)] bg-[hsl(var(--google-red)_/_0.03)]'
    case 'WARN':
      return 'border-[hsl(var(--google-yellow)_/_0.35)] bg-[hsl(var(--google-yellow)_/_0.03)]'
    default:
      return 'border-[hsl(var(--border)_/_0.82)] bg-[hsl(var(--card))]'
  }
}

export function eventRowSeverityStyle(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
    case 'ERROR':
      return 'bg-[hsl(var(--google-red)_/_0.04)] border-[hsl(var(--google-red)_/_0.15)]'
    case 'WARN':
      return 'bg-[hsl(var(--google-yellow)_/_0.04)] border-[hsl(var(--google-yellow)_/_0.15)]'
    case 'INFO':
      return 'bg-[hsl(var(--google-blue)_/_0.02)] border-[hsl(var(--google-blue)_/_0.05)]'
    default:
      return 'bg-[hsl(var(--muted)_/_0.2)] border-[hsl(var(--border)_/_0.3)]'
  }
}

export function sourceTypeColor(type: string): string {
  switch (type) {
    case 'CHANGE_REQUEST':
      return 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)_/_0.1)] border-[hsl(var(--primary)_/_0.2)]'
    case 'DEPLOYMENT_JOB':
      return 'text-[hsl(var(--google-blue))] bg-[hsl(var(--google-blue)_/_0.1)] border-[hsl(var(--google-blue)_/_0.2)]'
    case 'HOST_AGENT':
      return 'text-[#059669] dark:text-[#34d399] bg-[#10b981]/10 border-[#10b981]/20'
    case 'SYSTEM':
      return 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] border-[hsl(var(--border))]'
    case 'ALERT':
      return 'text-[hsl(var(--google-red))] bg-[hsl(var(--google-red)_/_0.1)] border-[hsl(var(--google-red)_/_0.2)]'
    default:
      return 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] border-[hsl(var(--border))]'
  }
}

export function SourceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'CHANGE_REQUEST':
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>
    case 'DEPLOYMENT_JOB':
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 3.82-13.82a1.8 1.8 0 0 1 2.18-.08c.55.43.91 1.09.91 1.82 0 4.29-1.39 8.24-3.91 11.08z"></path><path d="m15 12-3-3a22 22 0 0 0-13.82 3.82 1.8 1.8 0 0 0-.08 2.18c.43.55 1.09.91 1.82.91 4.29 0 8.24-1.39 11.08-3.91z"></path><line x1="10" y1="10" x2="14" y2="14"></line></svg>
    case 'HOST_AGENT':
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
    case 'SYSTEM':
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
    case 'ALERT':
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
    default:
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
  }
}
