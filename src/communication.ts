import type {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
} from "./types";

export const communicationStatuses: CommunicationStatus[] = [
  "not_contacted",
  "contact_planned",
  "contacted",
  "awaiting_reply",
  "seller_replied",
  "negotiating",
  "visit_scheduled",
  "closed_won",
  "closed_lost",
];

export const communicationStatusLabels: Record<CommunicationStatus, string> = {
  not_contacted: "Brak kontaktu",
  contact_planned: "Kontakt zaplanowany",
  contacted: "Skontaktowano się",
  awaiting_reply: "Oczekiwanie na odpowiedź",
  seller_replied: "Sprzedający odpowiedział",
  negotiating: "Negocjacje",
  visit_scheduled: "Wizyta umówiona",
  closed_won: "Zakończona — wybrano",
  closed_lost: "Zakończona — odrzucono",
};

export const communicationStatusTone = (
  status: CommunicationStatus,
): "neutral" | "waiting" | "active" | "success" | "closed" => {
  if (status === "not_contacted") return "neutral";
  if (status === "contact_planned" || status === "awaiting_reply")
    return "waiting";
  if (status === "closed_won") return "success";
  if (status === "closed_lost") return "closed";
  return "active";
};

export const communicationDirections: CommunicationDirection[] = [
  "inbound",
  "outbound",
  "internal_note",
];

export const communicationDirectionLabels: Record<
  CommunicationDirection,
  string
> = {
  inbound: "Od sprzedającego",
  outbound: "Do sprzedającego",
  internal_note: "Notatka wewnętrzna",
};

export const communicationChannels: CommunicationChannel[] = [
  "phone",
  "email",
  "sms",
  "whatsapp",
  "portal",
  "in_person",
  "other",
];

export const communicationChannelLabels: Record<CommunicationChannel, string> =
  {
    phone: "Telefon",
    email: "E-mail",
    sms: "SMS",
    whatsapp: "WhatsApp",
    portal: "Portal ogłoszeniowy",
    in_person: "Osobiście",
    other: "Inny kanał",
  };
