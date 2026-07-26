import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Play,
  ShieldAlert,
} from "lucide-react";
import { money } from "../format";
import type { FilterState, PurchaseAnalysisResponse } from "../types";

const recommendationLabel = {
  kup: "Kup",
  shortlista: "Shortlista",
  sprawdź: "Sprawdź",
  odrzuć: "Odrzuć",
} as const;

export function PurchaseAdvisor({
  filters,
  authConfigured,
  running,
  result,
  error,
  onAnalyze,
  onOpenCar,
}: {
  filters: FilterState;
  authConfigured: boolean;
  running: boolean;
  result: PurchaseAnalysisResponse | null;
  error: string | null;
  onAnalyze: () => void;
  onOpenCar: (id: string) => void;
}) {
  const candidates = new Map(
    (result?.candidates || []).map((candidate) => [candidate.id, candidate]),
  );
  const winner = result ? candidates.get(result.analysis.winnerId) : undefined;
  const filtersChanged =
    result && JSON.stringify(result.filters) !== JSON.stringify(filters);

  return (
    <section className="purchaseAdvisor">
      <div className="advisorHero">
        <div>
          <small>DECYZJA ZAKUPOWA</small>
          <h2>
            <Bot /> OpenAI analizuje dokładnie TOP 10
          </h2>
          <p>
            Analiza odświeża strony dokładnie dziesięciu ofert, ogląda ich
            zdjęcia i łączy je z historią cen, punktacją oraz wynikami CEPiK.
          </p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!authConfigured || running}
        >
          <Play />
          {running
            ? "Analizuję TOP 10…"
            : result
              ? "Przelicz ponownie"
              : "Analizuj TOP 10"}
        </button>
      </div>

      {!authConfigured && (
        <div className="advisorWarning">
          <ShieldAlert />
          <span>
            Ustaw <code>OPENAI_API_KEY</code> w środowisku kontenera.
          </span>
        </div>
      )}
      {error && <div className="advisorError">{error}</div>}
      {filtersChanged && (
        <div className="advisorWarning">
          <ShieldAlert />
          Filtry zmieniły się od ostatniej analizy. Uruchom przeliczenie, aby
          odświeżyć skład TOP 10.
        </div>
      )}
      {running && (
        <div className="advisorLoading" aria-live="polite">
          <span className="loadingPulse" />
          <div>
            <strong>OpenAI porównuje dziesięć ofert</strong>
            <small>
              Najpierw pobieram galerie, potem OpenAI samodzielnie przegląda
              ogłoszenia w headless Chrome i analizuje tekst oraz zdjęcia. Może
              to potrwać kilka minut.
            </small>
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="advisorVerdict">
            <small>REKOMENDACJA • PEWNOŚĆ {result.analysis.confidence}%</small>
            <h3>{winner?.title || result.analysis.winnerId}</h3>
            <p>{result.analysis.verdict}</p>
            <button
              type="button"
              onClick={() => onOpenCar(result.analysis.winnerId)}
            >
              Otwórz zwycięzcę
            </button>
          </div>

          <p className="advisorSummary">{result.analysis.comparisonSummary}</p>

          <div className="advisorCoverage">
            <div>
              <strong>Inspekcja materiałów</strong>
              <span>
                {result.evidence.pagesRefreshed}/
                {result.evidence.pagesAttempted} stron odświeżonych
              </span>
              <span>{result.evidence.imagesAttached} zdjęć obejrzanych</span>
              <span>zdjęcia dla {result.evidence.carsWithImages}/10 aut</span>
            </div>
            {result.evidence.warnings.map((warning) => (
              <p key={warning}>
                <ShieldAlert /> {warning}
              </p>
            ))}
          </div>

          <div className="advisorRanking">
            {result.analysis.rankings.map((item) => {
              const candidate = candidates.get(item.carId);
              return (
                <article
                  className={`advisorCandidate ${item.recommendation}`}
                  key={item.carId}
                >
                  <div className="advisorCandidateHead">
                    <span className="advisorRank">#{item.rank}</span>
                    <div>
                      <small>
                        KOLEJNOŚĆ RADARU • {candidate?.radarScore ?? "?"} PKT •
                        NIEZALEŻNA OCENA OPENAI
                      </small>
                      <h3>{candidate?.title || item.carId}</h3>
                      <span>
                        {candidate ? money(candidate.effectivePrice) : "—"} •
                        ocena zakupowa {item.purchaseScore}/100
                      </span>
                    </div>
                    <b>{recommendationLabel[item.recommendation]}</b>
                  </div>
                  <p>{item.rationale}</p>
                  <div className="advisorVisualAssessment">
                    <strong>Ocena zdjęć</strong>
                    <p>{item.visualAssessment}</p>
                    {item.visualRisks.length > 0 && (
                      <ul>
                        {item.visualRisks.map((value) => (
                          <li key={value}>{value}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="advisorColumns">
                    <div>
                      <strong>Mocne strony</strong>
                      <ul>
                        {item.strengths.map((value) => (
                          <li key={value}>{value}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Ryzyka</strong>
                      <ul>
                        {item.risks.map((value) => (
                          <li key={value}>{value}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Co zrobić</strong>
                      <ul>
                        {item.nextSteps.map((value) => (
                          <li key={value}>{value}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="advisorCandidateFoot">
                    <span>
                      Cel negocjacji:{" "}
                      {item.negotiationTarget
                        ? money(item.negotiationTarget)
                        : "brak podstaw"}
                    </span>
                    <span>
                      Maksymalna cena:{" "}
                      {item.maxRecommendedPrice
                        ? money(item.maxRecommendedPrice)
                        : "do ustalenia"}
                    </span>
                    <button type="button" onClick={() => onOpenCar(item.carId)}>
                      Szczegóły
                    </button>
                    {candidate?.url && (
                      <a href={candidate.url} target="_blank" rel="noreferrer">
                        Ogłoszenie <ExternalLink />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="advisorChecklist">
            <div>
              <h3>
                <CheckCircle2 /> Wspólna checklista
              </h3>
              <ul>
                {result.analysis.commonChecks.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>
                <ShieldAlert /> Powody do rezygnacji
              </h3>
              <ul>
                {result.analysis.dealBreakers.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </div>
          </div>
          <small className="advisorTimestamp">
            Analiza:{" "}
            {new Date(result.analysis.generatedAt).toLocaleString("pl-PL")}
          </small>
        </>
      )}
    </section>
  );
}
