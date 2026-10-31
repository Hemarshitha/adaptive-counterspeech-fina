export function deadlines(backendRunSeconds = 600, timeoutMs = 660000) {
  const backend = Number(backendRunSeconds);
  const proxy = Number(timeoutMs);
  if (
    !Number.isFinite(backend) ||
    backend <= 0 ||
    backend > 1800 ||
    !Number.isSafeInteger(proxy) ||
    proxy < 1000 ||
    proxy > 3600000 ||
    proxy <= backend * 1000
  ) {
    throw new Error(
      "DASHBOARD_TIMEOUT_MS must exceed backend MAX_RUN_SECONDS * 1000 (proxy maximum 3600000 ms)",
    );
  }
  return { backendRunSeconds: backend, timeoutMs: proxy };
}
