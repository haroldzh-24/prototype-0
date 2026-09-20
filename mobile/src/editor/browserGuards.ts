export function shouldInstallBeforeUnload(platform: string, dirty: boolean): boolean {
  return platform === 'web' && dirty;
}
