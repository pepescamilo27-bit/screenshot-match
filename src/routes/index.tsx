import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, Clock, Globe, HelpCircle, Lightbulb, Loader2, Search, Sparkles, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeSite } from "@/lib/sitefix.functions";
import { deleteAnalysis, loadAnalyses, loadFixes, saveAnalysis } from "@/lib/storage";
import type { AnalysisResult, Finding, StoredFix } from "@/lib/types";
import { FixStateBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { FixDialog } from "@/components/FixDialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SiteFix AI — Analise e corrija o site da sua imobiliária" },
      { name: "description", content: "Inteligência artificial que encontra problemas no seu site imobiliário e prepara correções concretas para você aprovar." },
      { property: "og:title", content: "SiteFix AI — Analise e corrija seu site" },
      { property: "og:description", content: "Encontre links quebrados, falta de WhatsApp e problemas de SEO e receba correções prontas." },
    ],
  }),
  component: Index,
});

const STEPS = ["Verificando endereço e segurança", "Baixando a página", "Lendo título, descrição e contatos", "Testando links", "Montando relatório"];

function Index() {
  const analyze = useServerFn(analyzeSite);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [fixes, setFixes] = useState<StoredFix[]>([]);
  const [current, setCurrent] = useState<AnalysisResult | null>(null);
  const [fixFinding, setFixFinding] = useState<Finding | null>(null);

  const refresh = () => { setHistory(loadAnalyses()); setFixes(loadFixes()); };
  useEffect(refresh, []);

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, [loading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) { setError("Informe o endereço do seu site."); return; }
    setLoading(true); setError(null);
    try {
      const r = await analyze({ data: { url } });
      if (!r.ok) { setError(r.error); return; }
      saveAnalysis(r.result); refresh(); setCurrent(r.result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Falha de conexão com o servidor. Tente novamente.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-hero text-primary-foreground">
        <div className="grid-lines">
          <div className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-6">
            <nav className="flex items-center justify-between">
              <button onClick={() => setCurrent(null)} className="flex items-center gap-2 font-display text-lg font-semibold">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-foreground/10 ring-1 ring-primary-foreground/20"><Wrench className="h-4 w-4" /></span>
                SiteFix<span className="text-primary-foreground/60">AI</span>
              </button>
              <span className="hidden text-sm text-primary-foreground/70 sm:block">Para corretores e imobiliárias</span>
            </nav>
            {!current && (
              <div className="mt-12 max-w-2xl">
                <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">Seu site perdendo clientes? A gente encontra e prepara a correção.</h1>
                <p className="mt-4 text-primary-foreground/75 sm:text-lg">Análise real do seu site: contatos, WhatsApp, links quebrados, SEO e acessibilidade — com correções geradas por IA para você aprovar.</p>
              </div>
            )}
            <form onSubmit={submit} className={current ? "mt-8" : "mt-8"}>
              <div className="flex flex-col gap-2 rounded-xl bg-card p-2 shadow-elevated sm:flex-row">
                <div className="flex flex-1 items-center gap-2 px-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <Input aria-label="Endereço do site" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="www.seusite.com.br" className="h-12 border-0 bg-transparent text-base text-foreground shadow-none focus-visible:ring-0" disabled={loading} />
                </div>
                <Button type="submit" size="lg" className="h-12 px-6" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Analisar meu site
                </Button>
              </div>
              {loading && <p className="mt-3 flex items-center gap-2 text-sm text-primary-foreground/80"><Loader2 className="h-3.5 w-3.5 animate-spin" />{STEPS[step]}…</p>}
              {error && <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/90 px-3 py-2 text-sm text-destructive-foreground"><AlertTriangle className="h-4 w-4" />{error}</p>}
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {current ? (
          <Report analysis={current} fixes={fixes} onBack={() => setCurrent(null)} onFix={setFixFinding} />
        ) : (
          <Dashboard history={history} fixes={fixes} onOpen={setCurrent} onDelete={(id) => { deleteAnalysis(id); refresh(); }} onOpenFix={(f) => { const a = history.find((h) => h.id === f.analysisId); if (a) { setCurrent(a); setFixFinding(a.findings.find((x) => x.id === f.findingId) ?? null); } }} />
        )}
      </main>

      {current && (
        <FixDialog
          key={fixFinding ? current.id + fixFinding.id : "none"}
          analysis={current}
          finding={fixFinding}
          existing={fixFinding ? fixes.find((f) => f.analysisId === current.id && f.findingId === fixFinding.id) : undefined}
          open={!!fixFinding}
          onOpenChange={(o) => !o && setFixFinding(null)}
          onSaved={refresh}
        />
      )}
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">SiteFix AI · Histórico salvo apenas neste navegador</footer>
    </div>
  );
}

function counts(a: AnalysisResult) {
  const issues = a.findings.filter((f) => f.status === "problema" || f.status === "recomendacao");
  return { alta: issues.filter((f) => f.priority === "alta").length, media: issues.filter((f) => f.priority === "media").length, baixa: issues.filter((f) => f.priority === "baixa").length, total: issues.length };
}

function Dashboard({ history, fixes, onOpen, onDelete, onOpenFix }: { history: AnalysisResult[]; fixes: StoredFix[]; onOpen: (a: AnalysisResult) => void; onDelete: (id: string) => void; onOpenFix: (f: StoredFix) => void }) {
  const latest = history[0];
  const c = latest ? counts(latest) : null;
  return (
    <div className="space-y-10">
      {latest && c ? (
        <section>
          <h2 className="text-xl font-semibold">Última análise</h2>
          <p className="text-sm text-muted-foreground">{latest.finalUrl}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Prioridade alta" value={c.alta} tone="text-destructive" />
            <Stat label="Prioridade média" value={c.media} tone="text-warning-foreground" />
            <Stat label="Prioridade baixa" value={c.baixa} tone="text-primary" />
            <Stat label="Correções preparadas" value={fixes.filter((f) => f.analysisId === latest.id).length} tone="text-success" />
          </div>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-3">
          {[[Search, "1. Analise", "Cole o endereço e veja problemas reais, com evidências."], [Sparkles, "2. Prepare", "A IA gera a correção sob medida para cada problema."], [CheckCircle2, "3. Aprove", "Compare antes e depois e baixe o arquivo para aplicar."]].map(([Icon, t, d]) => {
            const I = Icon as typeof Search;
            return <div key={t as string} className="rounded-xl border bg-card p-5 shadow-card"><I className="h-5 w-5 text-primary-glow" /><p className="mt-3 font-display font-semibold">{t as string}</p><p className="mt-1 text-sm text-muted-foreground">{d as string}</p></div>;
          })}
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="text-xl font-semibold">Histórico de análises</h2>
          {history.length === 0 ? <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma análise ainda. Comece digitando o endereço do seu site acima.</p> : (
            <ul className="mt-4 divide-y rounded-xl border bg-card shadow-card">
              {history.map((h) => { const k = counts(h); return (
                <li key={h.id} className="flex items-center gap-3 p-4">
                  <button onClick={() => onOpen(h)} className="min-w-0 flex-1 text-left">
                    <p className="truncate font-medium">{h.title || h.finalUrl}</p>
                    <p className="truncate text-xs text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" />{new Date(h.analyzedAt).toLocaleString("pt-BR")} · {h.finalUrl}</p>
                  </button>
                  {k.alta > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{k.alta} alta</span>}
                  <span className="hidden text-xs text-muted-foreground sm:inline">{k.total} itens</span>
                  <Button variant="ghost" size="icon" aria-label="Excluir análise" onClick={() => onDelete(h.id)}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ); })}
            </ul>
          )}
        </section>
        <section className="lg:col-span-2">
          <h2 className="text-xl font-semibold">Correções propostas</h2>
          {fixes.length === 0 ? <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">As correções preparadas aparecem aqui.</p> : (
            <ul className="mt-4 space-y-2">
              {fixes.slice(0, 10).map((f) => (
                <li key={f.id}><button onClick={() => onOpenFix(f)} className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card p-3 text-left shadow-card transition hover:border-primary-glow">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{f.findingTitle}</span><span className="block truncate text-xs text-muted-foreground">{f.url}</span></span>
                  <FixStateBadge state={f.state} />
                </button></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-xl border bg-card p-4 shadow-card"><p className={`font-display text-3xl font-semibold ${tone}`}>{value}</p><p className="text-sm text-muted-foreground">{label}</p></div>;
}

function Report({ analysis, fixes, onBack, onFix }: { analysis: AnalysisResult; fixes: StoredFix[]; onBack: () => void; onFix: (f: Finding) => void }) {
  const [filter, setFilter] = useState<"todos" | "problemas" | "ok" | "nv">("problemas");
  const c = counts(analysis);
  const list = useMemo(() => analysis.findings.filter((f) => filter === "todos" || (filter === "problemas" && (f.status === "problema" || f.status === "recomendacao")) || (filter === "ok" && f.status === "ok") || (filter === "nv" && f.status === "nao_verificado")), [analysis, filter]);
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" />Voltar ao painel</button>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">Relatório do site</h2>
          <p className="truncate text-sm text-muted-foreground">{analysis.finalUrl} · HTTP {analysis.httpStatus} · {analysis.responseMs} ms · {new Date(analysis.analyzedAt).toLocaleString("pt-BR")}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="rounded-lg bg-destructive/10 px-3 py-1.5 font-semibold text-destructive">{c.alta} alta</span>
          <span className="rounded-lg bg-warning/20 px-3 py-1.5 font-semibold text-warning-foreground">{c.media} média</span>
          <span className="rounded-lg bg-secondary px-3 py-1.5 font-semibold text-secondary-foreground">{c.baixa} baixa</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {([["problemas", "Problemas e recomendações", AlertTriangle], ["ok", "Aprovados", CheckCircle2], ["nv", "Não verificados", HelpCircle], ["todos", "Todos", Lightbulb]] as const).map(([k, l, I]) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}><I className="h-3.5 w-3.5" />{l}</Button>
        ))}
      </div>
      <div className="space-y-3">
        {list.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nada nesta categoria.</p>}
        {list.map((f) => {
          const fix = fixes.find((x) => x.analysisId === analysis.id && x.findingId === f.id);
          const actionable = f.status === "problema" || f.status === "recomendacao";
          return (
            <article key={f.id} className="rounded-xl border bg-card p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.category}</span>
                <StatusBadge s={f.status} />
                {actionable && <PriorityBadge p={f.priority} />}
                {fix && <FixStateBadge state={fix.state} />}
              </div>
              <h3 className="mt-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.description}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div><p className="text-xs font-semibold text-foreground">Evidência observada</p><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">{f.evidence}</pre></div>
                <div className="space-y-2 text-sm">
                  <div><p className="text-xs font-semibold">Impacto para visitantes</p><p className="text-muted-foreground">{f.impact}</p></div>
                  <div><p className="text-xs font-semibold">Solução recomendada</p><p className="text-muted-foreground">{f.solution}</p></div>
                </div>
              </div>
              {actionable && (
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => onFix(f)} variant={fix ? "outline" : "default"}>
                    {fix ? <>Ver correção<ArrowRight className="h-4 w-4" /></> : <><Sparkles className="h-4 w-4" />Preparar correção</>}
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
