export type Priority = "alta" | "media" | "baixa";
export type CheckStatus = "problema" | "recomendacao" | "ok" | "nao_verificado";

export interface Finding {
  id: string;
  category: string;
  title: string;
  description: string;
  evidence: string;
  impact: string;
  priority: Priority;
  status: CheckStatus;
  solution: string;
  /** Snippet of original HTML, when available, for fix preparation */
  snippet?: string;
  /** Whether fix needs owner input (e.g. WhatsApp number) */
  needsInput?: { label: string; placeholder: string };
}

export interface AnalysisResult {
  id: string;
  url: string;
  finalUrl: string;
  analyzedAt: string;
  httpStatus: number;
  responseMs: number;
  title: string | null;
  findings: Finding[];
}

export interface FixProposal {
  explanation: string;
  solution: string;
  original: string;
  proposed: string;
  language: string;
  instructions: string[];
  previewHtml: string;
}

export type FixState = "preparada" | "aprovada" | "aplicada" | "precisa_intervencao";

export interface StoredFix {
  id: string;
  analysisId: string;
  findingId: string;
  findingTitle: string;
  url: string;
  createdAt: string;
  state: FixState;
  proposal: FixProposal;
}
