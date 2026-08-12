export function heartbeatMessage(event: string, at: Date = new Date()): string {
  return `[SlugPath] service worker heartbeat: ${event} @ ${at.toISOString()}`
}
