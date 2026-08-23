export function isPackagedRuntime(): boolean {
  return process.env.SOLOFORGE_PACKAGED === '1'
}

export function isE2ETestMode(): boolean {
  return !isPackagedRuntime() && process.env.SOLOFORGE_E2E === '1'
}
