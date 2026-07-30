import { randomUUID } from "node:crypto";
import {
  communicationChannels,
  communicationDirections,
  communicationStatuses,
} from "../src/communication";
import type {
  Car,
  CommunicationAiReport,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  SellerCommunication,
  SellerContactEntry,
} from "../src/types";
import type { Store } from "./store";

export class CommunicationValidationError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (
  value: unknown,
  field: string,
  options: { required?: boolean; max?: number } = {},
) => {
  if (value === undefined && !options.required) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new CommunicationValidationError(
      `Pole ${field} musi być niepustym tekstem`,
    );
  const normalized = value.trim();
  if (normalized.length > (options.max || 10_000))
    throw new CommunicationValidationError(
      `Pole ${field} jest dłuższe niż ${options.max || 10_000} znaków`,
    );
  return normalized;
};

const timestamp = (value: unknown, field: string, fallback?: string) => {
  const normalized = value === undefined ? fallback : text(value, field);
  if (!normalized || Number.isNaN(Date.parse(normalized)))
    throw new CommunicationValidationError(
      `Pole ${field} musi zawierać prawidłową datę ISO 8601`,
    );
  return new Date(normalized).toISOString();
};

const stringList = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50)
    throw new CommunicationValidationError(
      `Pole ${field} musi być tablicą zawierającą maksymalnie 50 pozycji`,
    );
  return value.map((item, index) =>
    text(item, `${field}[${index}]`, { required: true, max: 2_000 }),
  ) as string[];
};

const parseContact = (
  value: unknown,
  index: number,
  now: string,
): SellerContactEntry => {
  if (!isObject(value))
    throw new CommunicationValidationError(
      `Pozycja contacts[${index}] musi być obiektem`,
    );
  const direction = value.direction as CommunicationDirection;
  const channel = value.channel as CommunicationChannel;
  if (!communicationDirections.includes(direction))
    throw new CommunicationValidationError(
      `Nieprawidłowa wartość contacts[${index}].direction`,
    );
  if (!communicationChannels.includes(channel))
    throw new CommunicationValidationError(
      `Nieprawidłowa wartość contacts[${index}].channel`,
    );
  return {
    id: text(value.id, `contacts[${index}].id`, { max: 200 }) || randomUUID(),
    occurredAt: timestamp(
      value.occurredAt,
      `contacts[${index}].occurredAt`,
      now,
    ),
    direction,
    channel,
    summary: text(value.summary, `contacts[${index}].summary`, {
      required: true,
      max: 1_000,
    })!,
    ...(value.details !== undefined
      ? {
          details: text(value.details, `contacts[${index}].details`, {
            required: true,
            max: 20_000,
          }),
        }
      : {}),
    ...(value.contactPerson !== undefined
      ? {
          contactPerson: text(
            value.contactPerson,
            `contacts[${index}].contactPerson`,
            { required: true, max: 300 },
          ),
        }
      : {}),
  };
};

const parseAiReport = (value: unknown, now: string): CommunicationAiReport => {
  if (!isObject(value))
    throw new CommunicationValidationError("Pole aiReport musi być obiektem");
  const sentiment = value.sentiment as CommunicationAiReport["sentiment"];
  if (
    sentiment !== undefined &&
    !["positive", "neutral", "negative", "mixed"].includes(sentiment)
  )
    throw new CommunicationValidationError(
      "Nieprawidłowa wartość aiReport.sentiment",
    );
  const confidence = value.confidence;
  if (
    confidence !== undefined &&
    (typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1)
  )
    throw new CommunicationValidationError(
      "Pole aiReport.confidence musi być liczbą od 0 do 1",
    );
  return {
    generatedAt: timestamp(value.generatedAt, "aiReport.generatedAt", now),
    summary: text(value.summary, "aiReport.summary", {
      required: true,
      max: 20_000,
    })!,
    ...(value.model !== undefined
      ? {
          model: text(value.model, "aiReport.model", {
            required: true,
            max: 200,
          }),
        }
      : {}),
    ...(sentiment !== undefined ? { sentiment } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(value.keyFindings !== undefined
      ? { keyFindings: stringList(value.keyFindings, "aiReport.keyFindings") }
      : {}),
    ...(value.risks !== undefined
      ? { risks: stringList(value.risks, "aiReport.risks") }
      : {}),
    ...(value.unansweredQuestions !== undefined
      ? {
          unansweredQuestions: stringList(
            value.unansweredQuestions,
            "aiReport.unansweredQuestions",
          ),
        }
      : {}),
    ...(value.recommendedNextSteps !== undefined
      ? {
          recommendedNextSteps: stringList(
            value.recommendedNextSteps,
            "aiReport.recommendedNextSteps",
          ),
        }
      : {}),
  };
};

export function emptyCommunication(): SellerCommunication {
  return {
    status: "not_contacted",
    contacts: [],
  };
}

export function applyCommunicationUpdate(
  store: Store,
  carId: string,
  input: unknown,
  now = new Date().toISOString(),
) {
  const car = (store.cars as Car[]).find((item) => item.id === carId);
  if (!car) return undefined;
  if (!isObject(input))
    throw new CommunicationValidationError(
      "Treść żądania musi być obiektem JSON",
    );
  if (
    input.status === undefined &&
    input.note === undefined &&
    input.contacts === undefined &&
    input.aiReport === undefined
  )
    throw new CommunicationValidationError(
      "Podaj co najmniej jedno z pól: status, note, contacts, aiReport",
    );

  const current = car.communication || {
    ...emptyCommunication(),
    statusUpdatedAt: now,
    updatedAt: now,
  };
  let status = current.status;
  let statusUpdatedAt = current.statusUpdatedAt || now;
  if (input.status !== undefined) {
    if (
      typeof input.status !== "string" ||
      !communicationStatuses.includes(input.status as CommunicationStatus)
    )
      throw new CommunicationValidationError(
        "Nieprawidłowy status komunikacji",
      );
    status = input.status as CommunicationStatus;
    statusUpdatedAt = now;
  }

  let note = current.note;
  if (input.note !== undefined) {
    if (input.note !== null && typeof input.note !== "string")
      throw new CommunicationValidationError(
        "Pole note musi być tekstem lub wartością null",
      );
    const normalized = typeof input.note === "string" ? input.note.trim() : "";
    if (normalized.length > 4_000)
      throw new CommunicationValidationError(
        "Pole note jest dłuższe niż 4000 znaków",
      );
    note = normalized || undefined;
  }

  let contacts = current.contacts;
  if (input.contacts !== undefined) {
    if (!Array.isArray(input.contacts) || input.contacts.length > 200)
      throw new CommunicationValidationError(
        "Pole contacts musi być tablicą zawierającą maksymalnie 200 pozycji",
      );
    contacts = input.contacts.map((entry, index) =>
      parseContact(entry, index, now),
    );
    const ids = new Set(contacts.map((entry) => entry.id));
    if (ids.size !== contacts.length)
      throw new CommunicationValidationError(
        "Każda pozycja contacts musi mieć unikalne id",
      );
  }

  let aiReport = current.aiReport;
  if (input.aiReport === null) aiReport = undefined;
  else if (input.aiReport !== undefined)
    aiReport = parseAiReport(input.aiReport, now);

  car.communication = {
    status,
    statusUpdatedAt,
    updatedAt: now,
    ...(note ? { note } : {}),
    contacts,
    ...(aiReport ? { aiReport } : {}),
  };
  return car;
}
