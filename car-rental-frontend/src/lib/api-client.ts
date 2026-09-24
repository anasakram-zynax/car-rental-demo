export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type ApiRequestOptions = Omit<RequestInit, "body" | "method"> & {
  body?: unknown;
};

function getApiBaseUrl() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiBaseUrl) {
    throw new ApiError(
      "NEXT_PUBLIC_API_URL is not configured.",
      0,
    );
  }

  return apiBaseUrl.replace(/\/$/, "");
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("message" in payload)) {
    return fallback;
  }

  const message = payload.message;

  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message.join(" ");
  }

  return fallback;
}

async function parseJson(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type");

  if (!contentType?.includes("application/json")) {
    return null;
  }

  return response.json() as Promise<unknown>;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers, ...requestOptions } = options;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const requestHeaders = new Headers(headers);

  requestHeaders.set("Accept", "application/json");
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormData && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getApiBaseUrl()}${normalizedPath}`, {
    ...requestOptions,
    method,
    headers: requestHeaders,
    body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await parseJson(response);
  const fallbackMessage = response.ok
    ? "The API returned an invalid response."
    : `Request failed with status ${response.status}.`;

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(payload, fallbackMessage),
      response.status,
      payload,
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("success" in payload) ||
    !("message" in payload) ||
    !("data" in payload)
  ) {
    throw new ApiError(fallbackMessage, response.status, payload);
  }

  const envelope = payload as ApiEnvelope<T>;

  if (!envelope.success) {
    throw new ApiError(envelope.message, response.status, envelope.data);
  }

  return envelope.data;
}

export const apiClient = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>("POST", path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>("PATCH", path, { ...options, body }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    request<T>("DELETE", path, options),
};
