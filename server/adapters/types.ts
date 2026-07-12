export type SourceId = "pewneauto" | "otomoto" | "olx";
export type Candidate = { source: SourceId; url: string };
export type SourceStatus = {
  id: SourceId;
  name: string;
  enabled: boolean;
  lastRun?: string;
  lastSuccess?: string;
  discovered: number;
  verified: number;
  rejected: number;
  errors: string[];
  rejectionReasons?: Record<string, number>;
  codexAttempted?: number;
  codexCompleted?: number;
  pagesScanned?: number;
  discoveryComplete?: boolean;
};
export interface SourceAdapter {
  id: SourceId;
  name: string;
  searchUrls: string[];
  pagesScanned?: number;
  discoveryComplete?: boolean;
  discover(): Promise<Candidate[]>;
}
