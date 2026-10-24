import { cn } from "@/lib/utils";
import type { CheckStatus, FixState, Priority } from "@/lib/types";

const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function PriorityBadge({ p }: { p: Priority }) {
  const map = { alta: ["Alta", "bg-destructive/10 text-destructive"], media: ["Média", "bg-warning/20 text-warning-foreground"], baixa: ["Baixa", "bg-secondary text-secondary-foreground"] } as const;
  return <span className={cn(base, map[p][1])}>Prioridade {map[p][0]}</span>;
}

export function StatusBadge({ s }: { s: CheckStatus }) {
  const map = { problema: ["Problema confirmado", "bg-destructive text-destructive-foreground"], recomendacao: ["Recomendação", "bg-primary/10 text-primary"], ok: ["OK", "bg-success/15 text-success"], nao_verificado: ["Não foi possível verificar", "bg-muted text-muted-foreground"] } as const;
  return <span className={cn(base, map[s][1])}>{map[s][0]}</span>;
}

export function FixStateBadge({ state }: { state: FixState }) {
  const map = { preparada: ["Preparada", "bg-primary/10 text-primary"], aprovada: ["Aprovada", "bg-success/15 text-success"], aplicada: ["Aplicada", "bg-success text-success-foreground"], precisa_intervencao: ["Precisa de intervenção", "bg-warning/20 text-warning-foreground"] } as const;
  return <span className={cn(base, map[state][1])}>{map[state][0]}</span>;
}
