import { describe, expect, it, vi } from 'vitest'
import { fetchWithRetry } from './fetch-with-retry.ts'

const noopSleep = async () => {}

function ok(body: string) {
  return { ok: true, status: 200, text: async () => body }
}

describe('fetchWithRetry', () => {
  it('returns the body on first-try success without sleeping', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('hello'))
    const sleepImpl = vi.fn(noopSleep)

    const result = await fetchWithRetry('https://example.com', { fetchImpl, sleepImpl })

    expect(result).toBe('hello')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleepImpl).not.toHaveBeenCalled()
  })

  it('retries on failure and succeeds once a later attempt works', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
      .mockResolvedValueOnce(ok('third time lucky'))
    const sleepImpl = vi.fn(noopSleep)

    const result = await fetchWithRetry('https://example.com', { retries: 3, fetchImpl, sleepImpl })

    expect(result).toBe('third time lucky')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleepImpl).toHaveBeenCalledTimes(2)
  })

  it('gives up gracefully (returns null, does not throw) after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'))
    const sleepImpl = vi.fn(noopSleep)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await fetchWithRetry('https://example.com', { retries: 2, fetchImpl, sleepImpl })

    expect(result).toBeNull()
    // 1 initial attempt + 2 retries = 3 total calls, 2 sleeps between them
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleepImpl).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    errorSpy.mockRestore()
  })
})
