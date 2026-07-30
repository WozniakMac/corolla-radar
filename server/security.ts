import type { NextFunction, Request, Response } from "express";

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
  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite === "cross-site")
    return res
      .status(403)
      .json({ error: "Żądanie cross-site zostało odrzucone" });
  const origin = req.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      // A development/reverse proxy can rewrite Host before the request reaches
      // Express. Sec-Fetch-Site is a browser-controlled, forbidden header, so a
      // same-origin value is authoritative even when the proxy-facing Host differs.
      if (fetchSite !== "same-origin" && originHost !== req.get("host"))
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
