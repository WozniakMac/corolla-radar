import { useEffect, useState } from "react";
import { MessageCircle, Save, Sparkles } from "lucide-react";
import {
  communicationChannelLabels,
  communicationDirectionLabels,
  communicationStatusLabels,
  communicationStatusTone,
  manualCommunicationStatuses,
} from "../communication";
import type { Car, CommunicationAiReport, CommunicationStatus } from "../types";

const sentimentLabels: Record<
  NonNullable<CommunicationAiReport["sentiment"]>,
  string
> = {
  positive: "pozytywny",
  neutral: "neutralny",
  negative: "negatywny",
  mixed: "mieszany",
};

const ReportList = ({ title, items }: { title: string; items?: string[] }) =>
  items?.length ? (
    <div className="communicationReportList">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  ) : null;

export function CommunicationPanel({
  car,
  saving,
  onUpdate,
}: {
  car: Car;
  saving: boolean;
  onUpdate: (update: {
    status?: CommunicationStatus;
    note?: string;
  }) => Promise<void>;
}) {
  const communication = car.communication;
  const status = communication?.status || "not_contacted";
  const [editedStatus, setEditedStatus] = useState<CommunicationStatus>(status);
  const [note, setNote] = useState(communication?.note || "");
  const contacts = [...(communication?.contacts || [])].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
  const report = communication?.aiReport;
  const lastContact = contacts[0]?.occurredAt;
  const changed =
    editedStatus !== status || note.trim() !== (communication?.note || "");

  useEffect(() => {
    setEditedStatus(status);
    setNote(communication?.note || "");
  }, [car.id, status, communication?.note]);

  return (
    <section className="communicationPanel">
      <div className="communicationHeading">
        <span>
          <MessageCircle />
        </span>
        <div>
          <small>KOMUNIKACJA ZE SPRZEDAJĄCYM</small>
          <strong>{communicationStatusLabels[status]}</strong>
        </div>
        <b className={`communicationStatus ${communicationStatusTone(status)}`}>
          {communicationStatusLabels[status]}
        </b>
      </div>
      <div className="communicationSummary">
        <div>
          <small>OSTATNI KONTAKT</small>
          <strong>
            {lastContact
              ? new Date(lastContact).toLocaleString("pl-PL")
              : "Brak kontaktu"}
          </strong>
        </div>
        <div>
          <small>WPISY</small>
          <strong>{contacts.length}</strong>
        </div>
      </div>

      <form
        className="manualCommunicationForm"
        onSubmit={(event) => {
          event.preventDefault();
          void onUpdate({ status: editedStatus, note });
        }}
      >
        <div>
          <label htmlFor={`communication-status-${car.id}`}>
            RĘCZNY STATUS AUTA
          </label>
          <select
            id={`communication-status-${car.id}`}
            value={editedStatus}
            onChange={(event) =>
              setEditedStatus(event.target.value as CommunicationStatus)
            }
            disabled={saving}
          >
            {!manualCommunicationStatuses.includes(editedStatus) && (
              <option value={editedStatus}>
                {communicationStatusLabels[editedStatus]}
              </option>
            )}
            {manualCommunicationStatuses.map((option) => (
              <option value={option} key={option}>
                {communicationStatusLabels[option]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`communication-note-${car.id}`}>UWAGI</label>
          <textarea
            id={`communication-note-${car.id}`}
            value={note}
            maxLength={4000}
            rows={4}
            placeholder="Np. powód odrzucenia, termin rzeczoznawcy lub ustalenia ze sprzedającym…"
            onChange={(event) => setNote(event.target.value)}
            disabled={saving}
          />
        </div>
        <button type="submit" disabled={saving || !changed}>
          <Save />
          {saving ? "Zapisywanie…" : "Zapisz status i uwagi"}
        </button>
      </form>

      <h3>Historia komunikacji</h3>
      {contacts.length ? (
        <div className="communicationTimeline">
          {contacts.map((contact) => (
            <article key={contact.id}>
              <div>
                <strong>{contact.summary}</strong>
                <time>
                  {new Date(contact.occurredAt).toLocaleString("pl-PL")}
                </time>
              </div>
              <small>
                {communicationDirectionLabels[contact.direction]} •{" "}
                {communicationChannelLabels[contact.channel]}
                {contact.contactPerson ? ` • ${contact.contactPerson}` : ""}
              </small>
              {contact.details && <p>{contact.details}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className="communicationEmpty">
          Historia zostanie wyświetlona po przesłaniu jej przez API.
        </div>
      )}

      <div className="communicationReportHeading">
        <Sparkles />
        <h3>Raport AI o komunikacji</h3>
      </div>
      {report ? (
        <div className="communicationReport">
          <div className="communicationReportMeta">
            <span>
              {new Date(report.generatedAt).toLocaleString("pl-PL")}
              {report.model ? ` • ${report.model}` : ""}
            </span>
            {(report.sentiment || report.confidence !== undefined) && (
              <b>
                {report.sentiment
                  ? `Ton: ${sentimentLabels[report.sentiment]}`
                  : ""}
                {report.sentiment && report.confidence !== undefined
                  ? " • "
                  : ""}
                {report.confidence !== undefined
                  ? `Pewność: ${Math.round(report.confidence * 100)}%`
                  : ""}
              </b>
            )}
          </div>
          <p>{report.summary}</p>
          <ReportList
            title="Najważniejsze ustalenia"
            items={report.keyFindings}
          />
          <ReportList title="Ryzyka" items={report.risks} />
          <ReportList
            title="Pytania bez odpowiedzi"
            items={report.unansweredQuestions}
          />
          <ReportList
            title="Rekomendowane kolejne kroki"
            items={report.recommendedNextSteps}
          />
        </div>
      ) : (
        <div className="communicationEmpty">
          Raport pojawi się po przesłaniu wyniku zewnętrznego AI przez API.
        </div>
      )}
    </section>
  );
}
