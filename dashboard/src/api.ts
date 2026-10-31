export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public runId?: string,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "dashboard_connection_lost");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(response.status, "invalid_server_response");
  }
  if (!response.ok) {
    const detail = data.detail;
    throw new ApiError(
      response.status,
      typeof detail?.code === "string"
        ? detail.code
        : "request_validation_failed",
      detail?.run_id,
    );
  }
  return data as T;
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? `${error.code.replaceAll("_", " ")}${error.status ? ` (HTTP ${error.status})` : ""}`
    : "Unable to complete the request.";
