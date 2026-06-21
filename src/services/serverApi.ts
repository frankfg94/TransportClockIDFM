/**
 * Turns a local Nitro API path into the deployed backend URL for a native
 * Capacitor build. In the browser build the base is empty, so current
 * same-origin API calls remain exactly as they were.
 */
const configuredServerApiBaseUrl =
  typeof __SERVER_API_BASE_URL__ === "undefined"
    ? ""
    : __SERVER_API_BASE_URL__;

const SERVER_API_BASE_URL = configuredServerApiBaseUrl
  .trim()
  .replace(/\/+$/u, "");

export function toServerApiUrl(path: string): string {
  if (!SERVER_API_BASE_URL || /^https?:\/\//iu.test(path)) {
    return path;
  }

  return `${SERVER_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
