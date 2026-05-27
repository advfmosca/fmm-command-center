// fmm-command-center · Cloudflare Worker per dismiss persistente cross-device
//
// Scopo: ricevere POST dal dashboard quando l'utente clicca × su una card e
// aggiungere/rimuovere la "key" in dismissed.json nel repo GitHub
// advfmosca/fmm-command-center, via Contents API.
//
// Secret richiesti (settali nel pannello Cloudflare → Settings → Variables and Secrets):
//   - GITHUB_PAT : Personal Access Token fine-grained con scope "Contents: Read and write"
//                  SOLO sul repo advfmosca/fmm-command-center.
//
// CORS: accetta solo richieste con Origin = https://advfmosca.github.io
//
// Endpoint:
//   POST /            body: {action: "add"|"remove", key: string}
//   risposta:         {ok: true, count: <numero key totali>}
//                     {error: "..."}  con status 4xx/5xx

const ALLOWED_ORIGIN = "https://advfmosca.github.io";
const REPO = "advfmosca/fmm-command-center";
const FILE = "dismissed.json";
const BRANCH = "main";

export default {
  async fetch(request, env) {
    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResp({ error: "Method Not Allowed" }, 405);
    }

    // Origin check (difensivo, oltre al CORS)
    const origin = request.headers.get("Origin") || "";
    if (origin && origin !== ALLOWED_ORIGIN) {
      return jsonResp({ error: "Forbidden origin" }, 403);
    }

    let body;
    try { body = await request.json(); }
    catch { return jsonResp({ error: "Invalid JSON" }, 400); }

    const { action, key } = body || {};
    if (typeof key !== "string" || !key || key.length > 500) {
      return jsonResp({ error: "Bad 'key'" }, 400);
    }
    if (action !== "add" && action !== "remove") {
      return jsonResp({ error: "Bad 'action' (use add|remove)" }, 400);
    }
    if (!env.GITHUB_PAT) {
      return jsonResp({ error: "Worker not configured (missing GITHUB_PAT secret)" }, 500);
    }

    const ghHeaders = {
      "Authorization": `Bearer ${env.GITHUB_PAT}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "fmm-dismiss-worker",
    };

    // GET dismissed.json (per avere sha + contenuto attuale)
    const getUrl = `https://api.github.com/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`;
    const getRes = await fetch(getUrl, { headers: ghHeaders });
    if (!getRes.ok) {
      const txt = await getRes.text();
      return jsonResp({ error: `GitHub GET failed (${getRes.status}): ${txt.slice(0, 200)}` }, 502);
    }
    const file = await getRes.json();
    const decoded = atob((file.content || "").replace(/\n/g, ""));
    let arr;
    try { arr = JSON.parse(decoded); } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];

    const before = arr.length;
    if (action === "add" && !arr.includes(key)) arr.push(key);
    if (action === "remove") arr = arr.filter(k => k !== key);

    if (arr.length === before) {
      return jsonResp({ ok: true, unchanged: true, count: arr.length });
    }

    // PUT aggiornamento
    const newContent = btoa(JSON.stringify(arr, null, 2) + "\n");
    const putRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `dismiss ${action}: ${key.slice(0, 80)}`,
        content: newContent,
        sha: file.sha,
        branch: BRANCH,
        committer: { name: "FMM Dismiss Worker", email: "moscadv@gmail.com" },
      }),
    });

    if (!putRes.ok) {
      const txt = await putRes.text();
      return jsonResp({ error: `GitHub PUT failed (${putRes.status}): ${txt.slice(0, 200)}` }, 502);
    }

    return jsonResp({ ok: true, action, key, count: arr.length });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}
