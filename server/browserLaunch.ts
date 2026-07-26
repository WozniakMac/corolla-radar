export function chromiumSandboxEnabled(value = process.env.CHROMIUM_SANDBOX) {
  return value === "true";
}
