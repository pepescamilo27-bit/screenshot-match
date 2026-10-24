// SSRF protection: only public http(s) hosts, resolved via DNS-over-HTTPS, manual redirects.

function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function ipv6Private(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb") || s.startsWith("ff")) return true;
  const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return ipv4Private(m[1]);
  return false;
}

const isIPv4 = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
const isIPv6 = (h: string) => h.includes(":");

async function resolve(host: string, type: "A" | "AAAA"): Promise<string[]> {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!r.ok) throw new Error("Falha na resolução DNS");
  const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
  const code = type === "A" ? 1 : 28;
  return (j.Answer ?? []).filter((a) => a.type === code).map((a) => a.data);
}

export function normalizeUrl(input: string): URL {
  let raw = input.trim();
  if (!raw) throw new Error("Informe uma URL.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = "https://" + raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("URL inválida.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Apenas endereços http e https são permitidos.");
  if (u.username || u.password) throw new Error("URLs com credenciais não são permitidas.");
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) throw new Error("Porta não permitida.");
  return u;
}

export async function assertPublicHost(u: URL): Promise<void> {
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !isIPv6(host)) {
    throw new Error("Endereço interno ou inválido não é permitido.");
  }
  if (isIPv4(host)) {
    if (ipv4Private(host)) throw new Error("Endereços IP internos não são permitidos.");
    return;
  }
  if (isIPv6(host)) {
    if (ipv6Private(host)) throw new Error("Endereços IP internos não são permitidos.");
    return;
  }
  const [a, aaaa] = await Promise.all([resolve(host, "A").catch(() => []), resolve(host, "AAAA").catch(() => [])]);
  if (a.length + aaaa.length === 0) throw new Error("Não foi possível encontrar este domínio (DNS).");
  if (a.some(ipv4Private) || aaaa.some(ipv6Private)) throw new Error("O domínio aponta para um endereço interno.");
}

export interface SafeResponse {
  status: number;
  finalUrl: string;
  headers: Headers;
  body: string;
  redirects: number;
  ms: number;
}

const UA = "Mozilla/5.0 (compatible; SiteFixAI/1.0; +https://sitefix.ai)";

export async function safeFetch(
  url: URL,
  opts: { method?: "GET" | "HEAD"; timeoutMs?: number; maxBytes?: number; readBody?: boolean } = {},
): Promise<SafeResponse> {
  const { method = "GET", timeoutMs = 12000, maxBytes = 2_000_000, readBody = true } = opts;
  const start = Date.now();
  let current = url;
  for (let i = 0; i <= 5; i++) {
    await assertPublicHost(current);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method,
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "pt-BR,pt;q=0.9" },
      });
    } catch (e) {
      clearTimeout(t);
      throw new Error((e as Error).name === "AbortError" ? "Tempo de resposta esgotado." : "Não foi possível conectar ao site.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(t);
      current = normalizeUrl(new URL(res.headers.get("location")!, current).toString());
      continue;
    }
    let body = "";
    if (readBody && method === "GET") {
      const reader = res.body?.getReader();
      if (reader) {
        const dec = new TextDecoder();
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          body += dec.decode(value, { stream: true });
          if (total > maxBytes) {
            await reader.cancel();
            break;
          }
        }
      }
    } else {
      await res.body?.cancel().catch(() => {});
    }
    clearTimeout(t);
    return { status: res.status, finalUrl: current.toString(), headers: res.headers, body, redirects: i, ms: Date.now() - start };
  }
  throw new Error("Redirecionamentos em excesso.");
}
