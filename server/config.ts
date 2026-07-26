export type ServerConfig = {
  host: string;
  port: number;
  scanIntervalMinutes: number;
  username?: string;
  password?: string;
  allowInsecureNetwork: boolean;
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

const isLoopback = (host: string) =>
  host === "127.0.0.1" || host === "::1" || host === "localhost";

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const host = env.HOST || "127.0.0.1";
  const username = env.APP_USERNAME?.trim() || undefined;
  const password = env.APP_PASSWORD || undefined;
  const allowInsecureNetwork = env.ALLOW_INSECURE_NETWORK === "true";

  if (Boolean(username) !== Boolean(password))
    throw new Error("APP_USERNAME i APP_PASSWORD muszą być ustawione razem");
  if (!isLoopback(host) && !username && !allowInsecureNetwork)
    throw new Error(
      "Publiczne nasłuchiwanie wymaga APP_USERNAME i APP_PASSWORD. " +
        "Wyjątek dla zaufanej sieci można jawnie włączyć przez ALLOW_INSECURE_NETWORK=true.",
    );

  return {
    host,
    port: integer(env.PORT, 4174, "PORT", 1),
    scanIntervalMinutes: integer(
      env.SCAN_INTERVAL_MINUTES,
      240,
      "SCAN_INTERVAL_MINUTES",
      1,
    ),
    username,
    password,
    allowInsecureNetwork,
  };
}
