import type { AnalysisResult, StoredFix } from "./types";

const A = "sitefix.analyses";
const F = "sitefix.fixes";

const read = <T,>(k: string): T[] => {
  try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; }
};
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

export const loadAnalyses = () => read<AnalysisResult>(A);
export const saveAnalysis = (a: AnalysisResult) => write(A, [a, ...loadAnalyses().filter((x) => x.id !== a.id)].slice(0, 20));
export const deleteAnalysis = (id: string) => write(A, loadAnalyses().filter((x) => x.id !== id));
export const loadFixes = () => read<StoredFix>(F);
export const saveFix = (f: StoredFix) => write(F, [f, ...loadFixes().filter((x) => x.id !== f.id)]);
