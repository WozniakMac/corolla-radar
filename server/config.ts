export type ServerConfig = {
  host: string;
  port: number;
  scanIntervalMinutes: number;
};

const integer = (
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
) => {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum)
    throw new Error(`${name} musi być liczbą całkowitą >= ${minimum}`);
  return parsed;
};

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const host = env.HOST || "127.0.0.1";

  return {
    host,
    port: integer(env.PORT, 4174, "PORT", 1),
    scanIntervalMinutes: integer(
      env.SCAN_INTERVAL_MINUTES,
      240,
      "SCAN_INTERVAL_MINUTES",
      1,
    ),
  };
}
