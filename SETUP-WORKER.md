# Setup Cloudflare Worker per dismiss persistente cross-device

Lo scopo: quando premi `×` su una card del Command Center, la card sparisce su **tutti** i tuoi browser e device (Mac, iPhone, iPad, Chrome al lavoro, ecc.) — non solo sul browser corrente.

Architettura:

```
[Dashboard ×]
    │
    │ POST { action: "add", key: "..." }
    ▼
[Cloudflare Worker]  ←─ secret GITHUB_PAT
    │
    │ PUT /repos/.../dismissed.json
    ▼
[GitHub repo: dismissed.json] ← fetched by dashboard al prossimo load
```

Tempo totale di setup: ~10 minuti, una sola volta nella vita.

---

## 1. Generare il GitHub PAT

1. Apri https://github.com/settings/personal-access-tokens/new
2. **Token name**: `fmm-dismiss-worker`
3. **Expiration**: 1 year
4. **Repository access**: *Only select repositories* → seleziona `advfmosca/fmm-command-center`
5. **Repository permissions** → trova `Contents` → seleziona **Read and write**
6. Tutti gli altri permessi lasciali su *No access*
7. Click *Generate token*
8. Copia il token (inizia con `github_pat_...`) — lo userai tra un attimo, **non chiudere la pagina finché non l'hai incollato in Cloudflare**

---

## 2. Creare l'account Cloudflare (se non ce l'hai già)

1. https://dash.cloudflare.com/sign-up
2. Email + password, conferma. Free tier abbondante (100k richieste/giorno).

---

## 3. Deploy del Worker

1. Vai su https://dash.cloudflare.com/ → menu sinistra → **Workers & Pages**
2. Click **Create application** → **Create Worker**
3. Nome consigliato: `fmm-dismiss` (genererà l'URL `https://fmm-dismiss.<tuo-subdomain>.workers.dev`)
4. Click **Deploy** (il Worker parte con un "Hello World" placeholder, lo rimpiazziamo subito)
5. Click **Edit code**
6. Cancella tutto il contenuto del file `worker.js` (lato sinistro)
7. Apri https://github.com/advfmosca/fmm-command-center/blob/main/worker/dismiss.js
8. Click "Copy raw file" o seleziona tutto e copia
9. Incolla nell'editor Cloudflare
10. Click **Save and Deploy** in alto a destra
11. Tornando alla pagina del Worker, prendi l'URL — qualcosa tipo `https://fmm-dismiss.fmosca.workers.dev` — e tienilo da parte.

---

## 4. Aggiungere il PAT come Secret

1. Sempre nella pagina del Worker, vai su **Settings** → **Variables and Secrets**
2. Click **Add** → tipo **Secret**
3. **Variable name**: `GITHUB_PAT` (esatto, MAIUSCOLO)
4. **Value**: incolla il PAT generato al passo 1
5. Click **Deploy**

---

## 5. Incollare l'URL del Worker nel dashboard

Mandami l'URL del Worker in chat — qualcosa tipo `https://fmm-dismiss.fmosca.workers.dev` — e te lo incarto io in `index.html` (riga `const WORKER_URL = "";` in cima al `<script>`). Faccio commit + push e da quel momento il `×` è persistente cross-device.

In alternativa, se vuoi farlo tu:

```bash
cd ~/Documents/Cowork/fmm-command-center
# Sostituisci la riga const WORKER_URL = "";
sed -i '' 's|const WORKER_URL = "";|const WORKER_URL = "https://fmm-dismiss.TUOSUB.workers.dev";|' index.html
git add index.html && git commit -m "wire Worker URL" && git push
```

---

## 6. Verifica

1. Apri https://advfmosca.github.io/fmm-command-center/
2. Premi `×` su una card qualsiasi
3. Dovresti vedere un toast verde in basso a destra: **"Nascosto su tutti i device ✓"**
4. Apri lo stesso URL su iPhone/altro browser → la card non c'è
5. Se vedi un toast giallo *"Locale OK · sync remoto fallito"* → il Worker risponde KO. Vai sul Worker in Cloudflare → tab **Logs** → guarda l'errore (di solito PAT scaduto, o secret name sbagliato).

---

## Rotation del PAT

Tra ~11 mesi GitHub ti manderà email "il PAT sta per scadere". Genera un nuovo PAT identico, sostituisci il secret `GITHUB_PAT` in Cloudflare (Settings → Variables and Secrets → Edit), redeploy. Fatto.

## Disinstallazione

Se vuoi tornare al `×` solo-locale: svuota `const WORKER_URL = ""` in `index.html` e push. Il Worker continua a esistere ma non viene chiamato.

## Costi

Free tier Cloudflare Workers: 100k richieste/giorno. Tu farai max una manciata di dismiss al giorno → costo perpetuo: 0€.
