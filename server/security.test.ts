import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { rejectCrossSiteMutations } from "./security";

function runMutation(headers: Record<string, string | undefined>) {
  const req = {
    path: "/api/sources/run",
    method: "POST",
    get: (name: string) => headers[name.toLowerCase()],
  } as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  const next = vi.fn() as NextFunction;

  rejectCrossSiteMutations(req, res, next);
  return { json, next, status };
}

describe("ochrona mutacji API", () => {
  it("akceptuje same-origin za lokalnym proxy przepisującym Host", () => {
    const result = runMutation({
      host: "127.0.0.1:4174",
      origin: "http://127.0.0.1:5173",
      "sec-fetch-site": "same-origin",
    });

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it("odrzuca żądanie cross-site niezależnie od Host", () => {
    const result = runMutation({
      host: "127.0.0.1:4174",
      origin: "http://127.0.0.1:4174",
      "sec-fetch-site": "cross-site",
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({
      error: "Żądanie cross-site zostało odrzucone",
    });
  });

  it("odrzuca obce Origin bez potwierdzenia same-origin", () => {
    const result = runMutation({
      host: "127.0.0.1:4174",
      origin: "https://example.com",
      "sec-fetch-site": "same-site",
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({
      error: "Nieprawidłowe źródło żądania",
    });
  });

  it("odrzuca nieprawidłowy Origin także dla same-origin", () => {
    const result = runMutation({
      host: "127.0.0.1:4174",
      origin: "nie-url",
      "sec-fetch-site": "same-origin",
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({
      error: "Nieprawidłowy nagłówek Origin",
    });
  });
});
