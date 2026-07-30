export type Listing = {
  source: string;
  url: string;
  price: number;
  title?: string;
  year?: number;
  mileage?: number;
  power?: number;
  engineVersion?: string;
  location?: string;
  trim?: string;
  seller?: string;
  cashPrice?: number;
  priceHistory?: PriceHistoryEntry[];
  active: boolean;
  missedScans?: number;
  inactiveAt?: string;
  checkedAt: string;
  description?: string;
  images?: string[];
  camera?: boolean;
  parkingSensors?: boolean;
  heatedSeats?: boolean;
  heatedWiperArea?: boolean;
  rainSensor?: boolean;
  autoDimmingMirror?: boolean;
  foldingMirrors?: boolean;
  lumbarAdjustment?: boolean;
  heatedSteeringWheel?: boolean;
  keyless?: boolean;
  wirelessCharging?: boolean;
  ics?: boolean;
  hybridHealthCheck?: boolean;
  toyotaWarranty?: boolean;
  polishSalon?: boolean;
  aso?: boolean;
  oneOwner?: boolean;
  noStructuralDamage?: boolean;
  vat23?: boolean;
  snapshotId?: string;
  reserved?: boolean;
  hybrid?: boolean;
  ecvt?: boolean;
  registrationNumber?: string;
  firstRegistrationDate?: string;
};
export type PriceHistoryEntry = {
  capturedAt: string;
  price: number;
  cashPrice?: number;
};
export type CarPriceHistoryEntry = {
  capturedAt: string;
  price: number;
  source: string;
  url: string;
};
export type Car = {
  id: string;
  title: string;
  year: number;
  power: number;
  engineVersion?: string;
  price: number;
  cashPrice?: number;
  priceHistory?: CarPriceHistoryEntry[];
  scoreHistory?: ScoreHistoryEntry[];
  mileage: number;
  location: string;
  distance: number;
  trim: string;
  tech: boolean;
  techOverride?: "confirmed" | "excluded";
  heatedSeats: boolean;
  heatedWiperArea?: boolean;
  rainSensor?: boolean;
  autoDimmingMirror?: boolean;
  foldingMirrors?: boolean;
  lumbarAdjustment?: boolean;
  heatedSteeringWheel?: boolean;
  keyless?: boolean;
  wirelessCharging?: boolean;
  ics?: boolean;
  hybridHealthCheck?: boolean;
  toyotaWarranty?: boolean;
  reserved?: boolean;
  polishSalon: boolean;
  aso: boolean;
  oneOwner: boolean;
  noStructuralDamage: boolean;
  vat23: boolean;
  camera: boolean;
  parkingSensors?: boolean;
  ecvt: boolean;
  hybrid?: boolean;
  body: "Touring Sports";
  seller: string;
  vin?: string;
  registrationNumber?: string;
  firstRegistrationDate?: string;
  cepik?: CepikReport;
  firstSeen: string;
  verifiedAt: string;
  listings: Listing[];
  notes: string[];
  description?: string;
  images?: string[];
  communication?: SellerCommunication;
};
export type CommunicationStatus =
  | "not_contacted"
  | "contact_planned"
  | "contacted"
  | "awaiting_reply"
  | "seller_replied"
  | "negotiating"
  | "visit_scheduled"
  | "closed_won"
  | "closed_lost";
export type CommunicationDirection = "inbound" | "outbound" | "internal_note";
export type CommunicationChannel =
  "phone" | "email" | "sms" | "whatsapp" | "portal" | "in_person" | "other";
export type SellerContactEntry = {
  id: string;
  occurredAt: string;
  direction: CommunicationDirection;
  channel: CommunicationChannel;
  summary: string;
  details?: string;
  contactPerson?: string;
};
export type CommunicationAiReport = {
  generatedAt: string;
  summary: string;
  model?: string;
  sentiment?: "positive" | "neutral" | "negative" | "mixed";
  confidence?: number;
  keyFindings?: string[];
  risks?: string[];
  unansweredQuestions?: string[];
  recommendedNextSteps?: string[];
};
export type SellerCommunication = {
  status: CommunicationStatus;
  statusUpdatedAt?: string;
  updatedAt?: string;
  contacts: SellerContactEntry[];
  aiReport?: CommunicationAiReport;
};
export type FilterState = {
  query: string;
  source: string[];
  trim: string[];
  engine: string[];
  minPrice: number;
  maxPrice: number;
  maxKm: number;
  maxDistance: number;
  year: string[];
  tech: boolean;
  vat: boolean;
};
export type CepikReport = {
  status: "pending" | "processing" | "ok" | "warning" | "failed";
  checkedAt?: string;
  error?: string;
  registrationStatus?: string;
  inspectionStatus?: string;
  insuranceStatus?: string;
  ownersTotal?: number;
  currentOwners?: number;
  coOwnersTotal?: number;
  timeline?: string[];
  rawSummary?: string;
};
export type ScoreBreakdown = {
  deal: number;
  history: number;
  equipment: number;
  location: number;
  terms: number;
  total: number;
  confidence: number;
};
export type ScoreCategoryKey =
  "deal" | "history" | "equipment" | "location" | "terms";
export type ScoreExplanationSnapshot = {
  key: ScoreCategoryKey;
  label: string;
  points: number;
  max: number;
  detail: string;
  deductions: string[];
};
export type ScoreCategoryChange = {
  key: ScoreCategoryKey;
  label: string;
  previousPoints: number;
  points: number;
  delta: number;
  reasons: string[];
};
export type ScoreHistoryEntry = {
  capturedAt: string;
  trigger?:
    | "manual"
    | "automatic"
    | "cli"
    | "cepik"
    | "codex"
    | "reprocess"
    | "manual-edit";
  source?: string;
  previousTotal?: number;
  score: ScoreBreakdown;
  explanations: ScoreExplanationSnapshot[];
  changes: ScoreCategoryChange[];
};
export type CodexJob = {
  id: string;
  url: string;
  source: string;
  title: string;
  status: "pending" | "processing" | "processed" | "failed";
  missing: string[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  carId?: string;
  potentialScore: number;
  qualityScore: number;
  informationValue: number;
  potentialReasons: string[];
  verificationReasons: string[];
};
export type ScanRun = {
  id: string;
  trigger: "manual" | "automatic" | "cli";
  source?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  discovered: number;
  verified: number;
  rejected: number;
  errors: number;
};
export type MonitoringStats = {
  scheduled: boolean;
  intervalMinutes: number;
  activeScan?: {
    trigger: "manual" | "automatic" | "cli";
    source?: string;
    startedAt: string;
  };
  runs: ScanRun[];
  snapshots?: number;
  snapshotBytes?: number;
  cepikRuns?: Array<{
    id: string;
    carId: string;
    offerUrl?: string;
    vin: string;
    registrationNumber: string;
    firstRegistrationDate: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    outcome: "success" | "warning" | "failed";
    error?: string;
    rawData?: unknown;
  }>;
};

export type PurchaseRecommendation = {
  rank: number;
  carId: string;
  recommendation: "kup" | "shortlista" | "sprawdź" | "odrzuć";
  purchaseScore: number;
  /** Brak w archiwalnych analizach wykonanych przed niezależnym rankingiem. */
  scoreBreakdown?: PurchaseScoreBreakdown;
  rationale: string;
  visualAssessment: string;
  visualRisks: string[];
  strengths: string[];
  risks: string[];
  nextSteps: string[];
  negotiationTarget: number | null;
  maxRecommendedPrice: number | null;
};

export type PurchaseScoreBreakdown = {
  value: number;
  history: number;
  equipment: number;
  convenience: number;
  evidence: number;
  riskPenalty: number;
};

export type PurchaseAnalysis = {
  generatedAt: string;
  winnerId: string;
  verdict: string;
  comparisonSummary: string;
  confidence: number;
  rankings: PurchaseRecommendation[];
  commonChecks: string[];
  dealBreakers: string[];
};

export type PurchaseAnalysisCandidate = {
  id: string;
  title: string;
  radarRank: number;
  radarScore: number;
  effectivePrice: number;
  url?: string;
};

export type PurchaseAnalysisResponse = {
  analysis: PurchaseAnalysis;
  candidates: PurchaseAnalysisCandidate[];
  filters: FilterState;
  evidence: PurchaseEvidenceSummary;
};

export type PurchaseAnalysisRecord = PurchaseAnalysisResponse & {
  id: string;
};

export type PurchaseEvidenceSummary = {
  inspectedAt: string;
  pagesAttempted: number;
  pagesRefreshed: number;
  pagesFailed: number;
  carsWithColor: number;
  warnings: string[];
};
