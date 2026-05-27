# FMM Command Center · GitHub Pages

Hub centralizzato statico — snapshot dei 5 connettori (Gmail, Asana, Calendar, Canva, Slack) aggiornato ogni 30 minuti da uno scheduled task Cowork che fa git push su questo repo.

## Architettura

```
┌─────────────────────────────────────────────────────────────────┐
│  Scheduled task Cowork: fmm-command-center-refresh              │
│  cron: */30 8-20 * * 1-5                                        │
│  ↓                                                              │
│  1. Pesca dati da 5 MCP (Gmail, Asana, Cal, Canva, Slack)       │
│  2. Normalizza in hub.json (shape definita in SKILL.md)         │
│  3. git push origin main                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Pages: https://advfmosca.github.io/fmm-command-center/    │
│  index.html  ← legge hub.json  ← serve UI a 5 colonne           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                  📱 Apri da QUALSIASI browser
                  (desktop, mobile, anche senza Cowork aperto)
```

## Setup manuale (una tantum)

### Step 1 — Crea il repo su GitHub

1. Vai su https://github.com/new
2. Owner: `advfmosca` · Repo name: `fmm-command-center` · Visibility: **Public** (necessario per GitHub Pages gratis)
3. Non aggiungere README, .gitignore, license (ce li mettiamo noi)
4. Crea

### Step 2 — Clona il repo in locale

```bash
mkdir -p ~/Documents/Cowork
cd ~/Documents/Cowork
git clone https://github.com/advfmosca/fmm-command-center.git
cd fmm-command-center
```

### Step 3 — Copia i file di questa cartella nel repo

Dalla cartella outputs di Cowork, sposta tutto in `~/Documents/Cowork/fmm-command-center/`:

```bash
# da macOS Finder, oppure:
cp "/path/to/outputs/fmm-command-center-github/index.html" ~/Documents/Cowork/fmm-command-center/
cp "/path/to/outputs/fmm-command-center-github/hub.json" ~/Documents/Cowork/fmm-command-center/
cp "/path/to/outputs/fmm-command-center-github/README.md" ~/Documents/Cowork/fmm-command-center/
```

(NON copiare `SKILL.md` nel repo — quello va salvato nello scheduled task, vedi Step 6).

### Step 4 — Primo commit & push

```bash
cd ~/Documents/Cowork/fmm-command-center
git add .
git commit -m "init: command center first deploy"
git push origin main
```

Se git chiede credenziali, usa il tuo PAT GitHub (lo stesso del task `refresh-dashboard-data`).

### Step 5 — Abilita GitHub Pages

1. Vai su `https://github.com/advfmosca/fmm-command-center/settings/pages`
2. Source: **Deploy from a branch**
3. Branch: **main** · Folder: **/ (root)**
4. Salva.
5. Dopo 1-2 minuti, il sito è live su: **https://advfmosca.github.io/fmm-command-center/**

Aprilo per testare che la pagina renderizzi correttamente con `hub.json` di esempio.

### Step 6 — Crea lo scheduled task in Cowork

Da chat in Cowork, dimmi:
> Crea lo scheduled task `fmm-command-center-refresh` usando la SKILL.md in outputs/fmm-command-center-github/SKILL.md

Io leggerò la SKILL.md, lancerò `mcp__scheduled-tasks__create_scheduled_task` con il cron `*/30 8-20 * * 1-5`, e da quel momento parte tutto in automatico.

## File contenuti

- `index.html` — pagina statica, legge `hub.json` e renderizza UI a 5 colonne
- `hub.json` — snapshot dati (verrà sovrascritto a ogni refresh)
- `SKILL.md` — istruzioni per lo scheduled task Cowork (NON va in repo, va in `~/Documents/Claude/Scheduled/fmm-command-center-refresh/`)
- `README.md` — questo file

## Come si usa

Apri **https://advfmosca.github.io/fmm-command-center/** in browser. Funziona ovunque, anche da telefono in coda al supermercato.

I dati sono aggiornati ogni 30 min lun-ven 8-20. Se vedi banner giallo "Dati datati", lo scheduled task è fermo: controlla in Cowork.

I filtri *Tutto / Oggi / Urgenti / Solo clienti AGHC* sono in cima alla pagina. La scelta viene ricordata nel browser tra una visita e l'altra.

## Sicurezza / privacy

Il repo è **public**: il file `hub.json` sarà pubblicamente leggibile su `https://advfmosca.github.io/fmm-command-center/hub.json`.

Cosa significa concretamente:
- **Email**: subject, sender e snippet (200 char) delle email non lette sono pubblicamente leggibili. Se ci sono email sensibili in inbox (preventivi, dati clienti), saranno parzialmente visibili.
- **Asana**: nomi task e progetti sono pubblici.
- **Calendar**: titoli eventi e orari sono pubblici (descrizioni NON le includiamo).
- **Canva**: titoli design + link di edit (chi ha il link può aprire il design — equivale a un link condiviso).
- **Slack**: solo nome canale e prime righe.

**Alternative se la privacy è un problema**:
1. **Repo private + GitHub Pages Pro** (~4$/mese): contenuto non indicizzabile.
2. **URL "ad accesso non listato"**: il repo resta public ma usi un sottocartella con nome random tipo `/x7k2p9q/` invece di root. Sicurezza per oscurità — non strong, ma scoraggia il casual.
3. **Filtra il contenuto sensibile** nello scheduled task: aggiungi una regola nella SKILL.md tipo "non includere email con label `Confidenziale` o `Preventivi`".

Per il MVP useremo public + filtro categorie già attivo. Se vedrai contenuti sensibili leakare, ti chiedo io di aggiornare la SKILL.md per redactarli.

## Manutenzione

- Quando il PAT GitHub scade (vedi task `github-pat-rotation-reminder`), aggiornalo anche per questo task.
- Se aggiungi un nuovo cliente AGHC, aggiungilo alla lista nella SKILL.md (sezione "is_aghc").
- Per aggiungere una sesta colonna (es. WhatsApp se mai integrerai), modifica SKILL.md step 2-3 e index.html: dimmelo, lo faccio in 10 minuti.
