export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function serviceOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    Number(url.port) < 1024
  )
    throw new Error(
      "Use the local dashboard address, e.g. http://127.0.0.1:5173",
    );
  return url.origin;
}
export class RequestError extends Error {
  constructor(code, status = 0, runId) {
    super(code);
    this.status = status;
    this.runId = runId;
  }
}
export async function request(origin, token, path, body, timeoutMs = 675000) {
  let response;
  try {
    response = await fetch(origin + "/extension" + path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      headers: {
        ...(globalThis.chrome?.runtime?.id
          ? { "X-Extension-ID": chrome.runtime.id }
          : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { "X-Extension-Token": token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new RequestError(
      "Local service unavailable or request timed out. Open the dashboard and Recover stored run before submitting again.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new RequestError("Invalid local-service response.", response.status);
  }
  if (!response.ok)
    throw new RequestError(
      typeof data.detail?.code === "string"
        ? data.detail.code
        : "request_validation_failed",
      response.status,
      data.detail?.run_id,
    );
  return data;
}
export function recommendation(run) {
  // Partial candidates and aborted runs can never become a recommendation.
  return run?.status === "completed" &&
    run.result?.outcome === "completed" &&
    run.result?.selected
    ? run.result.selected
    : null;
}
export const messages = {
  provider_rate_limited:
    "Provider rate limit reached. No recommendation. Do not retry until quota is available; inspect the stored trace.",
  conversation_busy:
    "This conversation already has an active run. Recover its stored result before starting another.",
  extension_session_expired_pair_again:
    "Pairing session expired. Restart the dashboard and pair again. Your stored runs are preserved.",
  extension_pairing_not_enabled:
    "Set DASHBOARD_EXTENSION_ID in dashboard/.env and restart the dashboard.",
  pairing_invalid_or_expired_restart_dashboard:
    "Pairing code is invalid, used or expired. Restart the dashboard for a new code.",
  inference_not_configured:
    "Backend inference is not configured. Configure the provider in the backend's .env and restart it.",
  backend_unreachable_or_timed_out:
    "Backend unavailable or timed out. Recover the stored run or open the dashboard before submitting again.",
  request_validation_failed:
    "Invalid text, context or settings. Check the input limits and conversation ID.",
};
export const explain = (error) =>
  messages[error.message] || error.message.replaceAll("_", " ");
