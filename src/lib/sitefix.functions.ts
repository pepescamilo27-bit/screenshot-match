import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AnalysisResult, FixProposal } from "./types";

export const analyzeSite = createServerFn({ method: "POST" })
  .validator((d: { url: string }) => z.object({ url: z.string().min(1).max(2048) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; result: AnalysisResult } | { ok: false; error: string }> => {
    const { analyzeUrl } = await import("./analyzer.server");
    try {
      return { ok: true, result: await analyzeUrl(data.url) };
    } catch (e) {
      return { ok: false, error: (e as Error).message || "Falha ao analisar o site." };
    }
  });

const fixInput = z.object({
  url: z.string().max(2048),
  finding: z.object({
    title: z.string().max(300),
    description: z.string().max(1000),
    evidence: z.string().max(3000),
    impact: z.string().max(1000),
    solution: z.string().max(1000),
    snippet: z.string().max(4000).optional(),
  }),
  ownerInput: z.string().max(300).optional(),
});

export const prepareFix = createServerFn({ method: "POST" })
  .validator((d: z.infer<typeof fixInput>) => fixInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; proposal: FixProposal } | { ok: false; error: string }> => {
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) return { ok: false, error: "Serviço de IA não configurado." };
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");

    const openai = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const system = `Você é um especialista em desenvolvimento web que prepara correções para sites de corretores de imóveis.
Responda SOMENTE com um objeto JSON válido (sem markdown) com as chaves:
"explanation" (string, explicação simples do problema para um leigo, em português do Brasil),
"solution" (string, resumo da solução),
"original" (string, trecho de código original relevante; use o snippet fornecido ou "" se não houver),
"proposed" (string, código HTML/CSS proposto pronto para colar),
"language" (string: "html"),
"instructions" (array de strings, passos para aplicar a correção manualmente, inclusive no WordPress),
"previewHtml" (string, documento HTML autocontido e pequeno que demonstra visualmente a correção, sem scripts).
Regras: nunca invente dados do proprietário (telefone, endereço, serviços). Se um dado necessário não foi fornecido, use um marcador como [SEU NÚMERO] e mencione nas instruções. Não afirme que a correção foi aplicada. Não inclua <script> em previewHtml.`;

    const prompt = `Site: ${data.url}
Problema: ${data.finding.title}
Descrição: ${data.finding.description}
Evidência: ${data.finding.evidence}
Impacto: ${data.finding.impact}
Solução sugerida: ${data.finding.solution}
${data.finding.snippet ? `Trecho original:\n${data.finding.snippet}` : "Sem trecho original disponível."}
${data.ownerInput ? `Dado confirmado pelo proprietário: ${data.ownerInput}` : ""}`;

    try {
      const result = streamText({
        model: openai.responses("openai/gpt-6-astra") as unknown as Parameters<typeof streamText>[0]["model"],
        system,
        prompt,
        providerOptions: {
          openai: { forceReasoning: true, reasoningEffort: "low", store: false, include: ["reasoning.encrypted_content"] },
        },
      });
      const text = await result.text;
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return { ok: false, error: "A IA não retornou uma correção válida. Tente novamente." };
      const p = JSON.parse(m[0]) as Partial<FixProposal>;
      return {
        ok: true,
        proposal: {
          explanation: String(p.explanation ?? ""),
          solution: String(p.solution ?? ""),
          original: String(p.original ?? data.finding.snippet ?? ""),
          proposed: String(p.proposed ?? ""),
          language: String(p.language ?? "html"),
          instructions: Array.isArray(p.instructions) ? p.instructions.map(String) : [],
          previewHtml: String(p.previewHtml ?? "").replace(/<script[\s\S]*?<\/script>/gi, ""),
        },
      };
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      if (err.statusCode === 429) return { ok: false, error: "Muitas solicitações no momento. Aguarde alguns segundos e tente novamente." };
      if (err.statusCode === 402) return { ok: false, error: "Créditos de IA esgotados no workspace." };
      if (err.statusCode === 403) return { ok: false, error: "Acesso ao modelo de IA negado para este workspace." };
      return { ok: false, error: "Não foi possível preparar a correção agora." };
    }
  });
