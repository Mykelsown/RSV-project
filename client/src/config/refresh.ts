/* Refresh strategy: live data arrives through SSE and is never polled.
   Slow data (reconciliation history, ledger, analytics) only changes when a
   day closes, so it refreshes on one shared slow interval, paused while the
   tab is hidden, and is refetched immediately after any action or SSE
   reconnect. */

export const SLOW_REFRESH_MS = 30 * 60 * 1000

/* Refetch slow data when the tab was hidden for at least this long. */
export const REFRESH_AFTER_HIDDEN_MS = 5 * 60 * 1000
