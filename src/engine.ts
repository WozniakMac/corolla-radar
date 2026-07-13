export type EngineSpec = {
  displacement: "1.8" | "2.0";
  power: number;
  label: string;
};

export function detectEngineSpec(
  year: number,
  text: string,
): EngineSpec | undefined {
  const match = text.match(
    /\b(1[.,]8|2[.,]0)\b.{0,35}(?:hybrid|hybryd|hsd)|(?:hybrid|hybryd|hsd).{0,35}\b(1[.,]8|2[.,]0)\b/i,
  );
  const displacement = (match?.[1] || match?.[2])?.replace(",", ".") as
    "1.8" | "2.0" | undefined;
  if (!displacement) return undefined;
  const power =
    displacement === "1.8"
      ? year >= 2023
        ? 140
        : 122
      : year >= 2025
        ? 178
        : year >= 2023
          ? 196
          : 184;
  return { displacement, power, label: `${displacement} Hybrid ${power} KM` };
}
