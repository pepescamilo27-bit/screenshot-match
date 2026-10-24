import { parse, type HTMLElement } from "node-html-parser";
import { normalizeUrl, safeFetch } from "./ssrf.server";
import type { AnalysisResult, Finding } from "./types";

const clip = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + "…" : s);

export async function analyzeUrl(input: string): Promise<AnalysisResult> {
  const url = normalizeUrl(input);
  const res = await safeFetch(url);
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  const ok = res.status >= 200 && res.status < 400;
  add({
    id: "disponibilidade",
    category: "Disponibilidade",
    title: ok ? "Página acessível" : `Página respondeu com erro ${res.status}`,
    description: ok ? "O site respondeu normalmente à requisição." : "O servidor não entregou a página corretamente.",
    evidence: `HTTP ${res.status} em ${res.ms} ms${res.redirects ? `, após ${res.redirects} redirecionamento(s)` : ""}. URL final: ${res.finalUrl}`,
    impact: ok ? "Visitantes conseguem abrir o site." : "Visitantes e o Google não conseguem acessar o conteúdo.",
    priority: ok ? "baixa" : "alta",
    status: ok ? "ok" : "problema",
    solution: ok ? "Nenhuma ação necessária." : "Verifique a hospedagem e a configuração do servidor.",
  });
  if (res.ms > 4000 && ok) {
    add({
      id: "lentidao",
      category: "Desempenho",
      title: "Resposta lenta do servidor",
      description: "O servidor demorou mais de 4 segundos para responder.",
      evidence: `Tempo total da resposta: ${res.ms} ms.`,
      impact: "Visitantes no celular podem desistir antes da página carregar.",
      priority: "media",
      status: "problema",
      solution: "Avalie cache, plano de hospedagem e plugins pesados.",
    });
  }

  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("html") || !res.body) {
    add({
      id: "conteudo",
      category: "Conteúdo",
      title: "Conteúdo HTML",
      description: "Não foi possível verificar o conteúdo da página.",
      evidence: `Content-Type recebido: ${ctype || "ausente"}`,
      impact: "As demais verificações não puderam ser feitas.",
      priority: "baixa",
      status: "nao_verificado",
      solution: "Não foi possível verificar.",
    });
    return result(input, res, null, findings);
  }

  const root = parse(res.body, { comment: false });
  const head = root.querySelector("head") ?? root;
  const base = new URL(res.finalUrl);

  // Title
  const title = root.querySelector("title")?.text.trim() || null;
  if (!title) {
    add({ id: "titulo", category: "SEO", title: "Página sem título", description: "A tag <title> está ausente ou vazia.", evidence: "Nenhuma tag <title> com texto encontrada no HTML.", impact: "O Google exibe um título genérico e a página perde cliques.", priority: "alta", status: "problema", solution: "Adicione um título com até 60 caracteres, ex.: 'Nome — Corretor de Imóveis em Cidade'.", snippet: clip(head.toString(), 400) });
  } else if (title.length < 15 || title.length > 65) {
    add({ id: "titulo", category: "SEO", title: title.length < 15 ? "Título muito curto" : "Título muito longo", description: "O título está fora do tamanho recomendado (15–65 caracteres).", evidence: `<title>${title}</title> (${title.length} caracteres)`, impact: "O título pode ser cortado ou pouco descritivo nos resultados de busca.", priority: "media", status: "recomendacao", solution: "Reescreva com nome, especialidade e cidade, entre 30 e 60 caracteres.", snippet: `<title>${title}</title>` });
  } else {
    add({ id: "titulo", category: "SEO", title: "Título adequado", description: "O título tem tamanho adequado.", evidence: `<title>${title}</title>`, impact: "—", priority: "baixa", status: "ok", solution: "Nenhuma ação necessária." });
  }

  // Description
  const desc = head.querySelector('meta[name="description"]')?.getAttribute("content")?.trim();
  if (!desc) {
    add({ id: "descricao", category: "SEO", title: "Sem meta descrição", description: "A página não possui a tag meta description.", evidence: 'Nenhuma <meta name="description"> encontrada.', impact: "O Google escolhe um trecho aleatório para mostrar abaixo do título.", priority: "media", status: "problema", solution: "Adicione uma descrição de 120–160 caracteres resumindo seus serviços.", snippet: title ? `<title>${title}</title>` : undefined });
  } else if (desc.length < 50 || desc.length > 170) {
    add({ id: "descricao", category: "SEO", title: "Meta descrição fora do tamanho ideal", description: "Recomendado entre 50 e 160 caracteres.", evidence: `"${clip(desc, 200)}" (${desc.length} caracteres)`, impact: "A descrição pode ser cortada ou pouco convincente.", priority: "baixa", status: "recomendacao", solution: "Reescreva a descrição com 120–160 caracteres.", snippet: `<meta name="description" content="${desc}">` });
  } else {
    add({ id: "descricao", category: "SEO", title: "Meta descrição presente", description: "Descrição com tamanho adequado.", evidence: `"${clip(desc, 200)}"`, impact: "—", priority: "baixa", status: "ok", solution: "Nenhuma ação necessária." });
  }

  // Viewport / mobile
  const vp = head.querySelector('meta[name="viewport"]')?.getAttribute("content");
  if (!vp) {
    add({ id: "viewport", category: "Mobile", title: "Sem configuração para celular", description: "A tag meta viewport está ausente.", evidence: 'Nenhuma <meta name="viewport"> encontrada.', impact: "No celular a página aparece minúscula, exigindo zoom.", priority: "alta", status: "problema", solution: 'Adicione <meta name="viewport" content="width=device-width, initial-scale=1"> no <head>.', snippet: clip(head.toString(), 400) });
  } else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp)) {
    add({ id: "viewport", category: "Mobile", title: "Zoom bloqueado no celular", description: "A configuração impede o visitante de ampliar a página.", evidence: `<meta name="viewport" content="${vp}">`, impact: "Pessoas com baixa visão não conseguem ampliar textos e números de telefone.", priority: "media", status: "problema", solution: "Remova user-scalable=no e maximum-scale=1.", snippet: `<meta name="viewport" content="${vp}">` });
  } else {
    add({ id: "viewport", category: "Mobile", title: "Configuração para celular presente", description: "A meta viewport está configurada.", evidence: `<meta name="viewport" content="${vp}">`, impact: "—", priority: "baixa", status: "ok", solution: "Nenhuma ação necessária. Observação: o layout visual não foi renderizado." });
  }

  // lang
  const lang = root.querySelector("html")?.getAttribute("lang");
  if (!lang) {
    add({ id: "lang", category: "Acessibilidade", title: "Idioma da página não declarado", description: "A tag <html> não tem o atributo lang.", evidence: "<html> sem atributo lang.", impact: "Leitores de tela podem pronunciar o conteúdo com o idioma errado.", priority: "baixa", status: "problema", solution: 'Use <html lang="pt-BR">.', snippet: "<html>" });
  }

  // Images alt
  const imgs = root.querySelectorAll("img");
  const noAlt = imgs.filter((i) => i.getAttribute("alt") === undefined);
  if (imgs.length && noAlt.length) {
    add({ id: "alt", category: "Acessibilidade", title: `${noAlt.length} de ${imgs.length} imagens sem texto alternativo`, description: "Imagens sem atributo alt.", evidence: noAlt.slice(0, 3).map((i) => clip(i.toString(), 160)).join("\n"), impact: "Pessoas com deficiência visual não sabem o que a imagem mostra; o Google também perde contexto.", priority: noAlt.length > 5 ? "media" : "baixa", status: "problema", solution: "Adicione alt descritivo, ex.: alt=\"Apartamento 3 quartos no Centro\".", snippet: noAlt.slice(0, 3).map((i) => i.toString()).join("\n") });
  }

  // H1
  const h1s = root.querySelectorAll("h1");
  if (h1s.length === 0) {
    add({ id: "h1", category: "SEO", title: "Sem título principal (H1)", description: "A página não tem um cabeçalho H1.", evidence: "Nenhuma tag <h1> encontrada no HTML entregue pelo servidor.", impact: "Buscadores e leitores de tela não identificam o assunto principal.", priority: "baixa", status: "recomendacao", solution: "Inclua um único <h1> descrevendo o que você oferece." });
  }

  // Forms without labels
  const inputs = root.querySelectorAll("input, textarea, select").filter((el) => !["hidden", "submit", "button", "checkbox", "radio", "image"].includes((el.getAttribute("type") || "").toLowerCase()));
  const unlabeled = inputs.filter((el) => {
    const id = el.getAttribute("id");
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")) return false;
    if (id && root.querySelector(`label[for="${id.replace(/"/g, "")}"]`)) return false;
    let p: HTMLElement | null = el.parentNode as HTMLElement | null;
    while (p) {
      if (p.tagName === "LABEL") return false;
      p = p.parentNode as HTMLElement | null;
    }
    return true;
  });
  if (unlabeled.length) {
    add({ id: "labels", category: "Acessibilidade", title: `${unlabeled.length} campo(s) de formulário sem rótulo`, description: "Campos sem <label> ou aria-label.", evidence: unlabeled.slice(0, 3).map((e) => clip(e.toString(), 160)).join("\n"), impact: "Leitores de tela não informam o que preencher, e o formulário pode perder contatos.", priority: "media", status: "problema", solution: "Associe cada campo a um <label> visível.", snippet: unlabeled.slice(0, 3).map((e) => e.toString()).join("\n") });
  }

  // Contacts
  const anchors = root.querySelectorAll("a[href]");
  const hrefs = anchors.map((a) => a.getAttribute("href")!.trim());
  const text = root.querySelector("body")?.text ?? "";
  const tel = hrefs.filter((h) => h.toLowerCase().startsWith("tel:"));
  const mail = hrefs.filter((h) => h.toLowerCase().startsWith("mailto:"));
  const wa = hrefs.filter((h) => /wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp:\/\//i.test(h));
  const phoneText = text.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);
  const emailText = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);

  if (wa.length === 0) {
    add({ id: "whatsapp", category: "Contato", title: "Nenhum link de WhatsApp encontrado", description: "Não foi identificado link para wa.me ou api.whatsapp.com no HTML.", evidence: `Analisados ${hrefs.length} links. Observação: botões inseridos via JavaScript após o carregamento podem não ser detectados.`, impact: "A maioria dos clientes de imóveis prefere contato por WhatsApp; sem botão, muitos desistem.", priority: "alta", status: "problema", solution: "Adicionar um botão flutuante de WhatsApp com mensagem pré-preenchida.", needsInput: { label: "Número do WhatsApp (com DDD)", placeholder: "Ex.: 11 98765-4321" } });
  } else {
    const bad = wa.filter((h) => { const m = h.match(/(?:wa\.me\/|phone=)(\+?\d*)/); return !m || (m[1] ?? "").replace(/\D/g, "").length < 10; });
    add({ id: "whatsapp", category: "Contato", title: bad.length ? "Link de WhatsApp possivelmente sem número" : "Link de WhatsApp encontrado", description: bad.length ? "O link não contém um número completo com DDI/DDD." : "Há pelo menos um link de WhatsApp.", evidence: wa.slice(0, 3).join("\n"), impact: bad.length ? "O visitante pode cair numa tela de erro do WhatsApp." : "—", priority: bad.length ? "alta" : "baixa", status: bad.length ? "problema" : "ok", solution: bad.length ? "Use o formato https://wa.me/55DDDNUMERO." : "Nenhuma ação necessária.", needsInput: bad.length ? { label: "Número do WhatsApp (com DDD)", placeholder: "Ex.: 11 98765-4321" } : undefined, snippet: bad.length ? anchors.filter((a) => bad.includes(a.getAttribute("href")!.trim())).slice(0, 2).map((a) => a.toString()).join("\n") : undefined });
  }

  if (tel.length === 0) {
    add({ id: "telefone", category: "Contato", title: phoneText ? "Telefone não clicável" : "Nenhum telefone encontrado", description: phoneText ? "Há um número no texto, mas sem link tel:." : "Não foi encontrado telefone no HTML.", evidence: phoneText ? `Texto encontrado: "${phoneText[0]}" — sem link tel: correspondente.` : "Nenhum link tel: nem padrão de telefone no texto.", impact: "No celular, o visitante precisa copiar o número manualmente para ligar.", priority: "media", status: phoneText ? "problema" : "recomendacao", solution: phoneText ? `Transforme o número em link: <a href="tel:+55...">${phoneText[0]}</a>` : "Exiba um telefone com link tel:.", snippet: phoneText ? phoneText[0] : undefined });
  }
  if (mail.length === 0 && !emailText) {
    add({ id: "email", category: "Contato", title: "Nenhum e-mail de contato visível", description: "Não foi encontrado e-mail no HTML.", evidence: "Nenhum link mailto: nem endereço de e-mail no texto.", impact: "Alguns clientes preferem enviar documentos ou propostas por e-mail.", priority: "baixa", status: "recomendacao", solution: "Inclua um e-mail de contato no rodapé." });
  }

  // Broken links
  const candidates = Array.from(new Set(hrefs
    .filter((h) => h && !h.startsWith("#") && !/^(mailto|tel|javascript|whatsapp|data):/i.test(h))
    .map((h) => { try { return new URL(h, base).toString().split("#")[0]; } catch { return null; } })
    .filter((h): h is string => !!h && /^https?:/.test(h)))).slice(0, 20);
  if (candidates.length) {
    const results = await Promise.all(candidates.map(async (link) => {
      try {
        let r = await safeFetch(new URL(link), { method: "HEAD", timeoutMs: 6000, readBody: false });
        if (r.status === 405 || r.status === 403) r = await safeFetch(new URL(link), { method: "GET", timeoutMs: 6000, maxBytes: 20000 });
        return { link, status: r.status as number | null, err: null as string | null };
      } catch (e) { return { link, status: null, err: (e as Error).message }; }
    }));
    const broken = results.filter((r) => r.status !== null && r.status >= 400 && r.status !== 403 && r.status !== 429);
    const unverified = results.filter((r) => r.status === null);
    if (broken.length) {
      add({ id: "links", category: "Links", title: `${broken.length} link(s) quebrado(s)`, description: "Links que retornam erro ao serem acessados.", evidence: broken.map((b) => `${b.status} → ${b.link}`).join("\n"), impact: "Visitantes encontram páginas de erro e perdem confiança.", priority: broken.length > 2 ? "alta" : "media", status: "problema", solution: "Corrija ou remova os links listados.", snippet: anchors.filter((a) => { try { return broken.some((b) => b.link === new URL(a.getAttribute("href")!, base).toString().split("#")[0]); } catch { return false; } }).slice(0, 4).map((a) => clip(a.toString(), 300)).join("\n") });
    } else {
      add({ id: "links", category: "Links", title: "Links verificados sem erro", description: `${results.length - unverified.length} de ${results.length} links testados responderam normalmente.`, evidence: `Amostra de ${candidates.length} links (limite de 20 por análise).`, impact: "—", priority: "baixa", status: "ok", solution: "Nenhuma ação necessária." });
    }
    if (unverified.length) {
      add({ id: "links-nv", category: "Links", title: `${unverified.length} link(s) não puderam ser verificados`, description: "Não foi possível verificar.", evidence: unverified.slice(0, 5).map((u) => `${u.link} — ${u.err}`).join("\n"), impact: "Desconhecido.", priority: "baixa", status: "nao_verificado", solution: "Teste esses links manualmente." });
    }
  }

  add({ id: "layout", category: "Mobile", title: "Layout visual no celular", description: "Não foi possível verificar.", evidence: "Esta versão analisa o HTML entregue pelo servidor e não renderiza a página em um navegador real.", impact: "—", priority: "baixa", status: "nao_verificado", solution: "Teste no seu celular; a verificação visual depende de uma integração adicional." });

  return result(input, res, title, findings);
}

function result(input: string, res: { status: number; finalUrl: string; ms: number }, title: string | null, findings: Finding[]): AnalysisResult {
  const order = { alta: 0, media: 1, baixa: 2 };
  const sorder = { problema: 0, recomendacao: 1, nao_verificado: 2, ok: 3 };
  findings.sort((a, b) => sorder[a.status] - sorder[b.status] || order[a.priority] - order[b.priority]);
  return { id: crypto.randomUUID(), url: input, finalUrl: res.finalUrl, analyzedAt: new Date().toISOString(), httpStatus: res.status, responseMs: res.ms, title, findings };
}
