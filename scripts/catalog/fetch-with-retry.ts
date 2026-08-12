export type FetchImpl = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export interface FetchWithRetryOptions {
  /** Extra attempts after the first, e.g. 3 = up to 4 total tries. Default 3. */
  retries?: number
  /** Delay between attempts, in ms. Default 1000. */
  delayMs?: number
  fetchImpl?: FetchImpl
  sleepImpl?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Fetches a URL, retrying on network error or non-2xx response with a fixed
 * delay between attempts. This script runs manually on release (not in CI),
 * so a simple fixed backoff is enough — no need for jitter/exponential
 * complexity here.
 *
 * Gives up gracefully after exhausting retries: logs and returns null rather
 * than throwing, so one bad subject page doesn't crash the whole run.
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<string | null> {
  const { retries = 3, delayMs = 1000, fetchImpl = fetch as unknown as FetchImpl, sleepImpl = defaultSleep } =
    options

  let lastError: unknown
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetchImpl(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return await res.text()
    } catch (err) {
      lastError = err
      if (attempt <= retries) await sleepImpl(delayMs)
    }
  }

  console.error(`[catalog-snapshot] giving up on ${url} after ${retries + 1} attempt(s):`, lastError)
  return null
}
