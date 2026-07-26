import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const equal = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function basicAuth(username?: string, password?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!username || !password || req.path === "/api/health") return next();
    const encoded = req.get("authorization")?.match(/^Basic (.+)$/i)?.[1];
    if (encoded) {
      const separator = Buffer.from(encoded, "base64").toString().indexOf(":");
      if (separator >= 0) {
        const decoded = Buffer.from(encoded, "base64").toString();
        if (
          equal(decoded.slice(0, separator), username) &&
          equal(decoded.slice(separator + 1), password)
        )
          return next();
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="Corolla Radar"');
    return res.status(401).json({ error: "Wymagane uwierzytelnienie" });
  };
}

export function rejectCrossSiteMutations(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    !req.path.startsWith("/api/") ||
    ["GET", "HEAD", "OPTIONS"].includes(req.method)
  )
    return next();
  if (req.get("sec-fetch-site") === "cross-site")
    return res
      .status(403)
      .json({ error: "Żądanie cross-site zostało odrzucone" });
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host"))
        return res.status(403).json({ error: "Nieprawidłowe źródło żądania" });
    } catch {
      return res.status(403).json({ error: "Nieprawidłowy nagłówek Origin" });
    }
  }
  return next();
}

export function limitMutations(maxRequests = 30, windowMs = 60_000) {
  const clients = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (
      !req.path.startsWith("/api/") ||
      ["GET", "HEAD", "OPTIONS"].includes(req.method)
    )
      return next();
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = clients.get(key);
    const entry =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;
    entry.count++;
    clients.set(key, entry);
    res.set("RateLimit-Limit", String(maxRequests));
    res.set(
      "RateLimit-Remaining",
      String(Math.max(0, maxRequests - entry.count)),
    );
    if (entry.count > maxRequests)
      return res
        .status(429)
        .json({ error: "Zbyt wiele żądań administracyjnych" });
    return next();
  };
}
