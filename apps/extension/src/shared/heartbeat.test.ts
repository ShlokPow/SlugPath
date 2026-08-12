import { describe, expect, it } from 'vitest'
import { heartbeatMessage } from './heartbeat'

describe('heartbeatMessage', () => {
  it('includes the event name and an ISO timestamp', () => {
    const at = new Date('2026-08-11T00:00:00.000Z')
    expect(heartbeatMessage('onInstalled', at)).toBe(
      '[SlugPath] service worker heartbeat: onInstalled @ 2026-08-11T00:00:00.000Z',
    )
  })
})
