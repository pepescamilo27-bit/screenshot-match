import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, ShieldCheck, Sparkles, Check, Plug } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { prepareFix } from "@/lib/sitefix.functions";
import { saveFix } from "@/lib/storage";
import type { AnalysisResult, Finding, StoredFix } from "@/lib/types";
import { FixStateBadge } from "./badges";

export function FixDialog({
  analysis, finding, existing, open, onOpenChange, onSaved,
}: {
  analysis: AnalysisResult; finding: Finding | null; existing?: StoredFix | undefined;
  open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const run = useServerFn(prepareFix);
  const [ownerInput, setOwnerInput] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fix, setFix] = useState<StoredFix | undefined>(existing);

  const current = fix ?? existing;
  if (!finding) return null;

  const generate = async () => {
    if (finding.needsInput && (!ownerInput.trim() || !confirmed)) {
      setError("Informe e confirme o dado solicitado antes de preparar a correção.");
      return;
    }
    setLoading(true); setError(null);
    try {
      const r = await run({ data: { url: analysis.finalUrl, finding: { title: finding.title, description: finding.description, evidence: finding.evidence, impact: finding.impact, solution: finding.solution, snippet: finding.snippet }, ownerInput: ownerInput.trim() || undefined } });
      if (!r.ok) { setError(r.error); return; }
      const f: StoredFix = { id: crypto.randomUUID(), analysisId: analysis.id, findingId: finding.id, findingTitle: finding.title, url: analysis.finalUrl, createdAt: new Date().toISOString(), state: "preparada", proposal: r.proposal };
      saveFix(f); setFix(f); onSaved();
      toast.success("Correção preparada. Revise antes de aprovar.");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally { setLoading(false); }
  };

  const approve = () => {
    if (!current) return;
    const f = { ...current, state: "aprovada" as const };
    saveFix(f); setFix(f); onSaved();
    toast.success("Correção aprovada. Baixe o arquivo para aplicar no seu site.");
  };

  const download = () => {
    if (!current) return;
    const p = current.proposal;
    const content = `<!--\n  SiteFix AI — Correção: ${current.findingTitle}\n  Site: ${current.url}\n\n  ${p.solution}\n\n  Como aplicar:\n${p.instructions.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}\n-->\n\n${p.proposed}\n`;
    const blob = new Blob([content], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `correcao-${current.findingId}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setError(null); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display"><Sparkles className="h-5 w-5 text-primary-glow" />Preparar correção</DialogTitle>
          <DialogDescription>{finding.title}</DialogDescription>
        </DialogHeader>

        {!current && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 text-sm">
              <p className="font-medium text-foreground">Problema identificado</p>
              <p className="mt-1 text-muted-foreground">{finding.description}</p>
              <pre className="mt-3 whitespace-pre-wrap break-all rounded-md bg-card p-3 font-mono text-xs text-muted-foreground">{finding.evidence}</pre>
            </div>
            {finding.needsInput && (
              <div className="space-y-3 rounded-lg border p-4">
                <Label htmlFor="owner">{finding.needsInput.label}</Label>
                <Input id="owner" value={ownerInput} onChange={(e) => setOwnerInput(e.target.value)} placeholder={finding.needsInput.placeholder} maxLength={60} />
                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                  Confirmo que sou o proprietário e que este dado está correto.
                </label>
              </div>
            )}
            {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button onClick={generate} disabled={loading} className="w-full" size="lg">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />A IA está preparando a correção…</> : <><Sparkles className="h-4 w-4" />Gerar correção com IA</>}
            </Button>
          </div>
        )}

        {current && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FixStateBadge state={current.state} />
              <span className="text-xs text-muted-foreground">Preparada em {new Date(current.createdAt).toLocaleString("pt-BR")}</span>
            </div>
            <Tabs defaultValue="explicacao">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="explicacao">Explicação</TabsTrigger>
                <TabsTrigger value="comparar">Comparar</TabsTrigger>
                <TabsTrigger value="previa">Prévia</TabsTrigger>
                <TabsTrigger value="aplicar">Aplicar</TabsTrigger>
              </TabsList>
              <TabsContent value="explicacao" className="space-y-3 text-sm">
                <p className="text-foreground">{current.proposal.explanation}</p>
                <div className="rounded-lg border-l-4 border-primary-glow bg-accent/50 p-3"><p className="font-medium">Solução</p><p className="text-muted-foreground">{current.proposal.solution}</p></div>
              </TabsContent>
              <TabsContent value="comparar" className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">Original</p>
                  <pre className="h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-destructive/5 p-3 font-mono text-xs">{current.proposal.original || "Sem trecho original (elemento ausente no site)."}</pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">Proposta</p>
                  <pre className="h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-success/5 p-3 font-mono text-xs">{current.proposal.proposed}</pre>
                </div>
              </TabsContent>
              <TabsContent value="previa">
                {current.proposal.previewHtml ? (
                  <iframe title="Prévia da correção" sandbox="" srcDoc={current.proposal.previewHtml} className="h-80 w-full rounded-md border bg-card" />
                ) : <p className="text-sm text-muted-foreground">Prévia visual indisponível para esta correção.</p>}
                <p className="mt-2 text-xs text-muted-foreground">Prévia isolada, sem scripts. Não representa o site publicado.</p>
              </TabsContent>
              <TabsContent value="aplicar" className="space-y-3 text-sm">
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  {current.proposal.instructions.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
                <div className="flex items-start gap-3 rounded-lg border border-dashed p-3 text-muted-foreground">
                  <Plug className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Nenhuma integração com o seu site está conectada. A aplicação automática (ex.: WordPress) exige uma integração compatível e sua autorização explícita. Por enquanto, baixe o arquivo e aplique manualmente.</p>
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={download} className="flex-1"><Download className="h-4 w-4" />Baixar arquivo de correção</Button>
              {current.state === "preparada" ? (
                <Button onClick={approve} className="flex-1"><ShieldCheck className="h-4 w-4" />Aprovar correção</Button>
              ) : (
                <Button disabled className="flex-1"><Check className="h-4 w-4" />Aprovada — aguardando aplicação manual</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Nada foi alterado no seu site. Aprovar apenas registra sua decisão nesta plataforma.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
