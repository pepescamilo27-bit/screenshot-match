<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- All outbound site fetches go through `src/lib/ssrf.server.ts` (`safeFetch`): DNS-over-HTTPS resolution + private-IP blocking + manual redirects, to prevent SSRF.
- Analysis/history and fixes are stored in browser localStorage (no backend DB) for the MVP; move to Lovable Cloud when accounts are added.
- Fixes are never reported as applied without a real site integration; future integrations (e.g. WordPress) should set FixState "aplicada" only after confirmed success.
