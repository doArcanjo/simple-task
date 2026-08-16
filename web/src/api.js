// Thin fetch wrapper: attaches the bearer token, sends/reads JSON, and always
// throws ApiError so callers get a consistent {status, code, message} shape.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let token = null;
let unauthorizedHandler = null;

export function setToken(value) {
  token = value;
}

// Called once per app instance to react to any 401 "unauthenticated" reply.
export function onSessionExpired(handler) {
  unauthorizedHandler = handler;
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection.');
  }

  if (response.status === 204) {
    return null;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const code = data && data.error && data.error.code;
    const message = (data && data.error && data.error.message) || 'Something went wrong. Please try again.';
    if (response.status === 401 && code === 'unauthenticated' && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(response.status, code || 'unknown_error', message);
  }

  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path, body) => request('DELETE', path, body),
};
