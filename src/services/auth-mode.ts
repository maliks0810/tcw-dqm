export const USE_OKTA =
  (process.env.REACT_APP_USE_OKTA ?? "").toLowerCase() === "true";

// Swagger UI link visibility. Default is ON — only an explicit
// REACT_APP_ENABLE_SWAGGER=false disables it. Anything else (including
// unset, "true", or any typo) keeps it enabled.
export const SWAGGER_ENABLED =
  (process.env.REACT_APP_ENABLE_SWAGGER ?? "true").toLowerCase() !== "false";

// The backend serves swagger under route_prefix + v1/api/swagger/index.html.
// Reuse REACT_APP_DATA_QUALITY_SERVICE_URL as the origin so dev / qa /
// prod each point at their own backend.
const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
export const SWAGGER_URL = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/swagger/index.html`;
