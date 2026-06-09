const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const TOKEN_STORAGE_KEY = "aiCommerceAdminToken";

let apiAuthToken = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;

export function setApiAuthToken(token: string | null) {
  apiAuthToken = token;
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getApiAuthToken() {
  return apiAuthToken;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: requestHeaders(),
    cache: "no-store"
  });

  await assertOk(response);

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiSend<T>("POST", path, body);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiSend<T>("PATCH", path, body);
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...(apiAuthToken ? { authorization: `Bearer ${apiAuthToken}` } : {})
    },
    body: formData
  });

  await assertOk(response);
  return response.json() as Promise<T>;
}

export async function apiDelete<T = void>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: requestHeaders()
  });

  await assertOk(response);
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function apiSend<T>(method: "POST" | "PATCH", path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders(),
    body: JSON.stringify(body)
  });

  await assertOk(response);
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function assertOk(response: Response) {
  if (response.ok) {
    return;
  }

  let message = `API request failed: ${response.status}`;
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    message = data.message ?? data.error ?? message;
  } catch {
    // Keep the status-only message when the body is not JSON.
  }
  throw new Error(message);
}

function requestHeaders() {
  return {
    "content-type": "application/json",
    ...(apiAuthToken ? { authorization: `Bearer ${apiAuthToken}` } : {})
  };
}
