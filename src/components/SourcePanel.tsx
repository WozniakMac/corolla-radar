import { RefreshCw } from "lucide-react";
export function SourcePanel({
  sources,
  scanning,
  onRun,
}: {
  sources: Array<{
    id: string;
    name: string;
    lastRun?: string;
    discovered: number;
    verified: number;
    rejected: number;
    pagesScanned?: number;
    errors: string[];
  }>;
  scanning: boolean;
  onRun: () => void;
}) {
  return (
    <section className="sourcePanel">
      <div>
        <small>ŹRÓDŁA DANYCH</small>
        <strong>{sources.length} adapterów</strong>
        <span>
          {sources.filter((s) => s.errors.length === 0).length} bez błędów
          ostatniego cyklu
        </span>
      </div>
      <div className="sourceDots">
        {sources.map((source) => (
          <span
            key={source.id}
            title={`${source.name}: ${source.discovered} znalezionych / ${source.verified} dodanych / ${source.pagesScanned || 0} stron`}
            className={
              source.errors.length
                ? "sourceError"
                : source.lastRun
                  ? "sourceOk"
                  : "sourceIdle"
            }
          >
            {source.name}
          </span>
        ))}
      </div>
      <button className="scanButton" disabled={scanning} onClick={onRun}>
        <RefreshCw className={scanning ? "spin" : ""} />
        {scanning ? "Skanowanie…" : "Skanuj teraz"}
      </button>
    </section>
  );
}
