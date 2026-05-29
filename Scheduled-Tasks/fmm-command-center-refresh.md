Refresh snapshot per `fmm-command-center` (GitHub Pages) di Francesco Maria Mosca.

REPO = `github.com/advfmosca/fmm-command-center`
PAGES = `https://advfmosca.github.io/fmm-command-center/`
WORKSPACE host = `/Users/francescomariamosca/Documents/Cowork/fmm-command-center`
WORKSPACE bash = `/sessions/<session>/mnt/fmm-command-center`
SLACK DM Francesco = `U0B0P0N7A2U`
CANVA USER ID Francesco = `oUYTcO2s-ir_7PBAqSw730`

## 0) PRECONDIZIONE workspace

```bash
WORKSPACE=$(ls -d /sessions/*/mnt/fmm-command-center 2>/dev/null | head -1)
```

Se vuoto → `mcp__cowork__request_cowork_directory(path="~/Documents/Cowork/fmm-command-center")` e ri-detect. Se ancora vuoto → Slack DM `U0B0P0N7A2U`: 🔴 fmm-command-center-refresh: workspace non montato. Termina senza errore.

## 1) PULL CALENDAR / ASANA (MCP nativi)

`START_ISO` = inizio oggi Europe/Rome. `END_ISO` = fine domani Europe/Rome.

- **Calendar** → `mcp__06be7a6b-fc77-44b0-a7f6-06390734face__list_events` `startTime=START_ISO, endTime=END_ISO, pageSize=30, orderBy="startTime", timeZone="Europe/Rome"`
- **Asana** → `mcp__7fd03348-d593-43bb-aecb-d7ff87995e0a__get_my_tasks` `completed_since="now", limit=50, opt_fields="gid,name,due_on,completed,notes,projects.name,memberships.project.name,permalink_url"`

⚠️ `get_my_tasks` ritorna SOLO task assegnati a Francesco. Le mention nei commenti su task di altri NON arrivano da qui — vedi step `1e)`.

## 1b) PULL ZOHO PROJECTS (Gmail content-based, NO dipendenza da label triage)

⚠️ **NON usare più `label:"Zoho Projects/Tag Pending Reply"`** — quella label è applicata da un triage esterno che può avere delay/falle e quindi salta i tag freschi.

Strategia content-based: pesca **tutti** i thread Zoho recenti dal mittente diretto, poi filtra in locale per chi tagga davvero Francesco nel body.

Step:

1. **Gmail search** → `mcp__2b66bb57-eb94-4f0b-b11d-016ca0d0f960__search_threads` con:
   - `query='from:notifications@zohoprojects.eu newer_than:7d'`
   - `pageSize=30`

2. Per ciascuno dei primi 20 thread, chiama `get_thread` con `messageFormat: FULL_CONTENT`.

3. Filtra in locale: tieni SOLO i thread il cui `htmlBody` contiene case-insensitive **"francesco maria mosca"** (varianti con accenti/spazi extra: normalizza prima di matchare). Scarta gli altri.

4. Per ogni thread superstite, estrai dai campi:
   - **Subject** → regex `\[([^\]]+?)\]\s*\[([A-Z0-9\-]+-T\d+)\s+([^\]]+)\]` → `project_full`, `codice`, `titolo`. `project_full` ha forma "PORTFOLIO - CLIENTE" (es. "CEA % - ELYSIR"), splittala su " - " per `portfolio` e `cliente` (se non c'è dash, lascia `cliente=project_full` e `portfolio=null`).
   - **Body autore commento** → regex `<strong>([^<]+)</strong>\s*</b>\s*ha aggiunto un commento`
   - **Body commento** → estrai il contenuto dentro `<editor-content>...</editor-content>`, strippa tag HTML, decodifica `&nbsp;`/`&amp;`, comprimi spazi, max **200 char** con `…`.
   - **URL** → estrai dal link "Visualizza commento" (anchor href dentro `zpmailButton`).
   - **Data** → usa `date` del messaggio (ISO UTC); confronta con oggi Europe/Rome per `is_today`.

5. Idempotenza/anti-spam: nessun dedup hard. Se due thread hanno stesso `codice`, mostrali entrambi (sono commenti diversi). Cap a max 15 entry finali, ordinate per data desc.

6. Struttura output per ogni entry:
```json
{
  "name": "<codice> <titolo>",
  "subtitle": "<project_full> · <autore> · <DD/MM>",
  "notes": "<autore>: «<commento troncato>»",
  "status": "Pending reply",
  "status_kind": "danger",
  "url": "<link Visualizza commento>",
  "is_today": <bool>,
  "is_urgent": true,
  "is_aghc": <bool — match AGHC su project_full + body>
}
```

7. Se la search Gmail fallisce o non ritorna nulla → `errors[]` con causa, `zoho_projects: []`, prosegui.

## 1c) PULL CANVA MENTIONS (list-comments → solo tag a Francesco non risposti)

⚠️ **NON usare `search-designs` come prima.** Cerchiamo SOLO i commenti che taggano Francesco e a cui NON ha già risposto.

Step:
1. `mcp__89737a7e-d16d-4770-a99b-4d471215fb96__search-designs` `ownership="shared", sort_by="modified_descending", user_intent="trova design con possibili mention"` → top 15 design shared.
2. Per ciascuno dei 15 design, chiama `mcp__89737a7e-d16d-4770-a99b-4d471215fb96__list-comments` con design_id.
3. Per ogni commento ritornato, considera "mention di Francesco" se:
   - `mentions[]` contiene `user_id == "oUYTcO2s-ir_7PBAqSw730"`, OPPURE
   - testo commento contiene case-insensitive "Francesco Maria Mosca" o "FMM Consulting" o "@Francesco"
4. Filtra: tieni SOLO commenti dove `is_resolved == false` (o equivalente).
5. Per ogni mention candidata, chiama `mcp__89737a7e-d16d-4770-a99b-4d471215fb96__list-replies` con design_id + comment_id.
6. Se tra le replies esiste una con `author.user_id == "oUYTcO2s-ir_7PBAqSw730"` → **SKIP** (Francesco ha già risposto, mention chiusa lato suo).
7. Altrimenti → entry valida.

Output: lista `{design_id, design_title, design_url, comment_id, author, comment_text, created_iso}`.

Cap a max 20 mention finali per evitare payload eccessivi.

## 1d) PULL MONDAY (Python inline GraphQL)

```bash
python3 - <<'PYEOF' > /tmp/monday-snapshot.json
import urllib.request, urllib.error, json, datetime, sys

TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY1MDU4NTczNywiYWFpIjoxMSwidWlkIjo2NTIzOTE1MiwiaWFkIjoiMjAyNi0wNC0yN1QxMzoxMDozOS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6Nzg1NzMwNCwicmduIjoidXNlMSJ9.20luQ4MVfbHbVbrBBKwUayCgThahXVTLyTMk4seL0qs"
MY_UID = 65239152
WORKSPACE_SENAPE = 9647703
API = "https://api.monday.com/v2"
TZ = datetime.timezone(datetime.timedelta(hours=2))
TODAY = datetime.datetime.now(TZ).date()

def gql(q, t=15):
    req = urllib.request.Request(API, data=json.dumps({"query": q}).encode(),
        headers={"Authorization": TOKEN, "Content-Type": "application/json", "API-Version": "2024-10"})
    with urllib.request.urlopen(req, timeout=t) as r:
        return json.loads(r.read())

def parse_persons(v):
    try: d = json.loads(v) if isinstance(v, str) else v
    except: return set()
    out = set()
    for p in (d.get("personsAndTeams") or d.get("personsAndTeams_v2") or []):
        if p.get("kind","person")=="person" and p.get("id"):
            try: out.add(int(p["id"]))
            except: pass
    return out

def parse_date(v):
    try: d = json.loads(v) if isinstance(v, str) else v
    except: return None
    return d.get("date") if isinstance(d, dict) else None

results = []
try:
    boards = gql(f"{{ boards(workspace_ids: [{WORKSPACE_SENAPE}], limit: 100, state: active) {{ id name }} }}").get("data", {}).get("boards", [])
    EXCL_PFX = ("Sotto elementi",)
    EXCL_KW = ("Inspo","FAQ","Sito","Materiale","Report mensili","Strategy","Panoramica PED")
    boards = [b for b in boards if not b["name"].startswith(EXCL_PFX) and not any(k.lower() in b["name"].lower() for k in EXCL_KW)]
    for b in boards[:30]:
        bid = b["id"]
        q = f'{{ boards(ids: [{bid}]) {{ columns {{ id type }} items_page(limit: 50) {{ items {{ id name url created_at column_values {{ id type value }} }} }} }} }}'
        try:
            data = gql(q).get("data", {}).get("boards", [{}])[0]
            cols = data.get("columns", [])
            date_cols = [c["id"] for c in cols if c.get("type")=="date"]
            people_cols = [c["id"] for c in cols if c.get("type")=="people"]
            if not people_cols: continue
            for it in data.get("items_page", {}).get("items", []):
                cv_map = {c["id"]: c.get("value") for c in it.get("column_values", [])}
                if not any(MY_UID in parse_persons(cv_map.get(pid)) for pid in people_cols): continue
                dates = [parse_date(cv_map.get(did)) for did in date_cols if cv_map.get(did)]
                dates = [d for d in dates if d]
                due = min(dates) if dates else None
                days_to_due = None
                if due:
                    try: days_to_due = (datetime.date.fromisoformat(due) - TODAY).days
                    except: pass
                url = it.get("url") or f"https://senapedigital.monday.com/boards/{bid}/pulses/{it['id']}"
                results.append({"name": it["name"][:80], "subtitle": b["name"], "due_iso": due, "days_to_due": days_to_due, "url": url})
        except Exception:
            continue
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)[:200], "items": []}))
    sys.exit(0)
print(json.dumps({"ok": True, "items": results[:50]}, ensure_ascii=False))
PYEOF
cat /tmp/monday-snapshot.json
```

Se `ok=false` → `errors[]` + `monday: []`. Se `/tmp` non scrivibile, redirigi in `$WORKSPACE/.tmp-monday.json` (poi rimuovi).

## 1e) PULL ASANA MENTIONS (Gmail content-based)

⚠️ `get_my_tasks` (step 1) ritorna SOLO task dove sei assignee. Le mention nei commenti su task altrui NON sono incluse. Per intercettarle pesca le notifiche email Asana.

Step:

1. **Gmail search** → `mcp__2b66bb57-eb94-4f0b-b11d-016ca0d0f960__search_threads` con:
   - `query='from:no-reply@asana.com newer_than:7d subject:"ti ha menzionato"'`
   - `pageSize=30`

2. Per ciascun thread chiama `get_thread` con `messageFormat: FULL_CONTENT`. **Parsa SOLO `plaintextBody`** (camelCase): è ~1 KB pulito. L'`htmlBody` è 60+ KB di tracking wrappers Asana — inutilizzabile.

3. Estrai dai campi (regex su `plaintextBody` + `subject`):
   - **Subject** → regex `^.*?ti ha menzionato:\s*(?P<title>.+?)\s*\[(?P<project>[^\]]+)\]\s*$` → `task_title`, `project`. Esempio: `"👋 ambra.sartini ti ha menzionato: aumento budget meta + google Albatros [Albatros]"` → title=`aumento budget meta + google Albatros`, project=`Albatros`.
   - **Author** (plaintextBody) → regex `^\s*(?P<author>\S+)\s+ha aggiunto un commento` con flag MULTILINE. Fallback: `Avatar di\s+(?P<author>\S+)`.
   - **Comment text** (plaintextBody) → regex `https://app\.asana\.com/1/\d+/profile/\d+\s+(?P<comment>.+?)\s*(?:\n\s*\n|\nAttività:)` con flag DOTALL. Normalizza spazi, max **200 char** con `…`.
   - **Task URL** (plaintextBody) → regex `Visualizza attività:\s*(?P<url>https://app\.asana\.com/1/\d+/project/\d+/task/\d+(?:\?focus=true)?)`. Fallback: primo URL canonico `/1/\d+/project/\d+/task/\d+` trovato. Strippa `?focus=true` per chiave deduplicazione.
   - **Date** → `messages[0].date` (ISO UTC). Confronta vs Europe/Rome per `is_today`.

4. Idempotenza: `task_gid` (ultimo `\d+` dell'URL) è la chiave naturale. Se più email per lo stesso `task_gid`, tieni la PIÙ RECENTE.

5. Cap a max **15** entry finali, ordinate per data desc.

6. Struttura output per ogni entry:
```json
{
  "name": "<task_title>",
  "subtitle": "<project> · <author> · <DD/MM>",
  "notes": "<author>: «<comment troncato>»",
  "status": "Mention",
  "status_kind": "danger",
  "url": "<task URL>",
  "is_today": <bool>,
  "is_urgent": true,
  "is_aghc": <bool — match AGHC su project + comment>
}
```

7. Se la search Gmail fallisce o non ritorna nulla → `errors[]` con causa, `asana_mentions: []`, prosegui.


## 1f) PULL MONDAY MENTIONS (Gmail content-based)

⚠️ La query GraphQL Monday (step 1d) filtra SOLO sul workspace SENAPE e SOLO sugli item dove sei in colonna "people". NON pesca:
- Notifiche di **automation** (es. "Fra puoi inserire le promo di Puntebianche Resort").
- Item su **altri workspace** AGHC (es. workspace Adèsso, Magari Estates).
- Mention manuali nei commenti.

Per coprire le prime due classi (le manuali Monday non sempre le manda via email — accettato gap), pesca le email di notifica Monday.

Step:

1. **Gmail search** → `mcp__2b66bb57-eb94-4f0b-b11d-016ca0d0f960__search_threads` con:
   - `query='from:notifications@monday.com newer_than:7d'`
   - `pageSize=30`

2. Per ciascun thread chiama `get_thread` con `messageFormat: FULL_CONTENT`. Devi parsare sia `plaintextBody` (URL canonico) sia `htmlBody` (item name + board name dal breadcrumb).

3. Estrai dai campi:
   - **Notifica/name** → usa direttamente `subject` (è già il testo della notifica, es. "Fra puoi inserire le promo di Puntebianche Resort", "FAI REPORT ADESSO HOTEL").
   - **URL** (plaintextBody) → regex `(https://[a-z0-9_-]+\.monday\.com/boards/\d+(?:/pulses/\d+)?)`. È il deep link canonico senza tracking.
   - **Item name** (htmlBody) → regex `word-break:\s*break-word;\s*overflow-wrap:\s*break-word;">\s*([^<]+?)\s*</span>` (lo span bold del title block). Esempio: "Puntebianche Resort", "Gestione /Adèsso/ Hotel".
   - **Board name** (htmlBody) → regex `class="breadcrumb"[^>]*>\s*([^<]+?)\s*</span>` primo match. Può mancare per notifiche board-level (caso "Adèsso").
   - **Date** → `messages[0].date` (ISO UTC).

4. Idempotenza: chiave naturale = URL canonico. Se duplicato, tieni la PIÙ RECENTE.

5. Cap a max **15** entry, ordinate per data desc.

6. Struttura output per ogni entry:
```json
{
  "name": "<subject>",
  "subtitle": "<item_name>< · ><board_name> · <DD/MM>",
  "notes": null,
  "status": "Notifica",
  "status_kind": "warn",
  "url": "<deep link>",
  "is_today": <bool>,
  "is_urgent": true,
  "is_aghc": <bool — match AGHC su subject + item + board>
}
```

7. Se la search Gmail fallisce → `errors[]` con causa, `monday_mentions: []`, prosegui.

## 2) NORMALIZZAZIONE → hub.json

⚠️ **NOMI DI CAMPO CRITICI** — `index.html` non legge nomi generici (`title`, `url`, `subtitle`). Usa esattamente questi campi, altrimenti la dashboard mostra "(senza titolo)" e link rotti:

- **Calendar** legge `ev.summary` (riga ~519 di index.html) e `ev.html_link` (riga ~514). NON usare `title`/`url` per questi.
- **Asana** raggruppa per `t.project` (riga ~547) e usa `t.permalink` (riga ~558). NON usare `subtitle`/`url` per questi due. Senza `project`, tutto finisce nel gruppo "Generale".

```json
{
  "updated_at": "<ISO Europe/Rome>",
  "source": "fmm-command-center-refresh",
  "errors": [],
  "calendar": [{"summary","start_iso","end_iso","is_today","is_tomorrow","is_urgent","location","conference_url","html_link","alert_kind","is_aghc"}],
  "asana": [{"name","project","notes","due","days_to_due","is_today","is_urgent","permalink","is_aghc"}],
  "asana_mentions": [{"name","subtitle","notes","status","status_kind","url","is_today","is_urgent","is_aghc"}],
  "canva": [{"design_id","design_title","design_url","comment_id","author","comment_text","created_iso","is_aghc"}],
  "monday": [{"name","subtitle","status","status_kind","due","url","is_today","is_urgent","is_aghc"}],
  "monday_mentions": [{"name","subtitle","notes","status","status_kind","url","is_today","is_urgent","is_aghc"}],
  "zoho_projects": [{"name","subtitle","notes","status","status_kind","url","is_today","is_urgent","is_aghc"}]
}
```

Per sicurezza puoi anche emettere alias (`title` accanto a `summary`, `url` accanto a `html_link`/`permalink`) — non rompe nulla. Ma i campi del front-end SONO obbligatori.

**NIENTE** key `email`, `slack`, `zoho`. Solo le 7 sorgenti elencate.

### Regole

**Calendar**: `alert_kind` = "anomaly"/"stop"/null; salta "Blocco disponibilità - no nuove call". `summary` = titolo evento Google; `html_link` = URL evento; `is_urgent` di default false. Se Francesco ha `responseStatus: declined` ma l'evento è ancora in agenda → `alert_kind="anomaly"`.
**Asana**: `project` = nome del progetto Asana (o `null` per stand-alone — il front-end raggruppa i null in "Generale"); `permalink` = `permalink_url` dell'API. `days_to_due` calcolato vs oggi Europe/Rome.
**Asana Mentions**: status="Mention", status_kind="danger", is_urgent=true. Schema identico a `zoho_projects` per coerenza renderer.
**Canva**: solo mention da step 1c, troncamento comment_text a 200 char, `created_iso` dal field timestamp del commento.
**Monday**: due/status come prima; `is_today` = days_to_due===0; `is_urgent` = days_to_due≤2.
**Monday Mentions**: status="Notifica", status_kind="warn", is_urgent=true. Schema identico a `asana_mentions`/`zoho_projects` per coerenza renderer.
**Zoho Projects**: status="Pending reply", status_kind="danger", is_urgent=true, ottieni dal flusso content-based 1b.

### Lista AGHC clienti (LISTA CORRETTA — aggiornata 2026-05-27)

⚠️ **NON includere** BeeFamily, Bee Family, Hotel e Villaggi, Albatros, Bonadies, Hotel Regno — sono clienti separati, NON AGHC.

Match case-insensitive substring nei testi principali:

```
accentodì, accentodi
adèsso, adesso
altafiumara
hotel castello, castello hotel
della piana
hannah hotels, hannah terraces, hannah
hemanaire
livata hotel, hotel livata
lunetta hotel, hotel lunetta
magari estates
marcella royal
mare hotel, hotel mare
tenuta montemagno, montemagno
puntebianche
terrazza flavia
villa ermellina, villa giada, villa miliani
aghc, ag hotel consulting
```

Importante: NON usare match generici come solo "mare", "castello", "magari" — sono parole troppo comuni. Usa la forma combinata ("mare hotel", "hotel castello", "magari estates").

## 3) BUILD + PUSH (mirror /tmp)

```bash
MIRROR=/tmp/fmm-cc-mirror-$(date +%s)
REMOTE_URL=$(git -C "$WORKSPACE" config --get remote.origin.url)
echo "$REMOTE_URL" | grep -q '@github.com' || exit 0
git clone --quiet --depth 5 "$REMOTE_URL" "$MIRROR"
# scrivi hub.json nel mirror
cd "$MIRROR"
git config user.email "moscadv@gmail.com"
git config user.name "Francesco Maria Mosca"
git add hub.json
git diff --cached --quiet && echo "no changes" || { git commit -m "refresh: $(date '+%Y-%m-%d %H:%M')"; git push origin main; }
rm -rf "$MIRROR"
```

## 4) ERRORI

- Singola chiamata fallisce → `errors[]` + array vuoto, prosegui.
- PAT mancante → Slack DM con istruzione fix.
- Push fallito → Slack DM con causa.
- Successo → NO Slack (sito è la conferma).

## 5) NOTE STORICHE — modifiche al flusso

- **2026-05-29 (III)**: aggiunto step `1f) PULL MONDAY MENTIONS`. Motivo: la query GraphQL su workspace SENAPE (step 1d) non vedeva le notifiche di automation Monday né le board su altri workspace AGHC (Adèsso, Magari Estates). Ora pesco anche le email `from:notifications@monday.com newer_than:7d`. Output in `monday_mentions[]` + nuova colonna 📋 Monday @Te in index.html.
- **2026-05-29 (II)**: aggiunto step `1e) PULL ASANA MENTIONS`. Motivo: `get_my_tasks` ritorna SOLO task assegnati, le mention nei commenti su task di altri (es. "ambra.sartini ti ha menzionato: aumento budget meta + google Albatros") non comparivano. Ora le pesco via Gmail content-based, stesso pattern del 1b Zoho. Output in nuovo array `asana_mentions[]` di hub.json + nuova colonna in index.html.
- **2026-05-29**: schema `calendar` e `asana` aggiornato per allinearlo a quello che effettivamente legge `index.html`. Prima usavo `title`/`url` per calendar e `subtitle`/`url` per asana → la dashboard mostrava "(senza titolo)" su tutti gli eventi e raggruppava tutti i task in "Generale". Ora: calendar usa `summary`+`html_link`; asana usa `project`+`permalink`. Vedi blocco "NOMI DI CAMPO CRITICI" in sezione 2.
- **2026-05-28**: cambiata logica PULL ZOHO PROJECTS (sezione 1b). Prima dipendeva dalla label `Zoho Projects/Tag Pending Reply` che viene applicata da un triage esterno (probabile Apps Script); i thread freschi senza ancora la label venivano saltati. Ora pesca tutti i thread `from:notifications@zohoprojects.eu newer_than:7d` e filtra in locale per la presenza del tag "Francesco Maria Mosca" nel body. Allinea l'analoga logica del task `zoho-tag-checker`.
