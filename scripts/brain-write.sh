#!/usr/bin/env bash
# Ajoute des recettes (ou des produits de courses) dans le foyer partagé avec le compte agent de Brain.
# Le compte agent n'écrit que dans ce que Brain lui a partagé en droit « modifier » (le foyer) : la sécurité est celle de la base.
# Identifiants : BRAIN_AGENT_EMAIL et BRAIN_AGENT_PASSWORD (environnement ou .env.local à la racine, jamais commité).
# Usage : scripts/brain-write.sh [--dry] fichier.json
#   fichier.json : tableau d'éléments, ex. [{"title": "Crêpes", "duration_min": 30, "tags": ["Rapide"], "body": "…",
#     "meta": {"servings": 4, "seasons": [], "ingredients": [{"id": "a1", "qty": 250, "unit": "g", "name": "farine"}]}}]
#   « kind » vaut recipe par défaut (shop_item possible). Une recette dont le titre existe déjà dans le foyer est ignorée.
#   Projet : ajouter "project": "<titre du projet>" (il doit exister et être partagé en « Peut modifier »). Puis :
#     action  {"project":"P","title":"…","section":"Sport"}          (kind task par défaut ; section optionnelle)
#     section {"project":"P","kind":"section","title":"…","sup":"Section parente"}
#     frise   {"project":"P","kind":"plog","title":"…","body":"recap","meta":{"types":["feature","fix"],"date":"2026-11-08","version":"0.28.0"}}
#             types : feature | code | fix | design (plusieurs possibles)
#     cocher  {"project":"P","done":"titre exact de l'action"}
#     ranger  {"project":"P","move":"titre exact de l'action","section":"Section"}   (section "" = sans section ; sections créées dans le même fichier OK)
#   Tout le reste (compte agent avec statut « agent », schéma 24) : champ "op" ; l'agent modifie tout sauf supprimer pour de bon.
#     créer      {"op":"create","kind":"note","title":"…","body":"…","parent":"titre du parent (option)","meta":{…}, + n'importe quelle colonne}
#     modifier   {"op":"update","id":"uuid"} ou {"op":"update","kind":"task","match":"titre exact","set":{"title":"…","status":"done","body":"…","meta":{"clé":"valeur"}}}
#                (meta est fusionné clé par clé ; colonnes id, user_id, created_at, updated_at, completed_by refusées)
#     corbeille  {"op":"trash","kind":"task","match":"titre exact"}   (ou "id") : status trashed, récupérable dans Brain
#   --dry : affiche ce qui serait ajouté, sans rien écrire.
set -euo pipefail

DRY=0; [ "${1:-}" = "--dry" ] && { DRY=1; shift; }
FILE="${1:?Usage : scripts/brain-write.sh [--dry] fichier.json}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.local" ] && { set -a; . "$ROOT/.env.local"; set +a; }
: "${BRAIN_AGENT_EMAIL:?BRAIN_AGENT_EMAIL manquant}" "${BRAIN_AGENT_PASSWORD:?BRAIN_AGENT_PASSWORD manquant}"

URL="$(sed -n "s/.*url: '\(.*\)'.*/\1/p" "$ROOT/config.js")"
KEY="$(sed -n "s/.*key: '\(.*\)'.*/\1/p" "$ROOT/config.js")"

login=$(python3 -c 'import json,os;print(json.dumps({"email":os.environ["BRAIN_AGENT_EMAIL"],"password":os.environ["BRAIN_AGENT_PASSWORD"]}))' \
  | curl -sS "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "Content-Type: application/json" -d @-)
jwt=$(printf '%s' "$login" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("access_token",""))')
[ -n "$jwt" ] || { echo "Connexion refusée : $(printf '%s' "$login" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("msg") or d.get("error_description") or d)')" >&2; exit 1; }
uid=$(printf '%s' "$login" | python3 -c 'import json,sys;print(json.load(sys.stdin)["user"]["id"])')

api() { curl -sS "$URL/rest/v1/$1" -H "apikey: $KEY" -H "Authorization: Bearer $jwt" "${@:2}"; }
existing=$(api "items?select=*&status=neq.trashed&limit=5000")

owner=$(api "agent_grants?select=owner_id" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d[0]["owner_id"] if isinstance(d,list) and d else "")')
rows=$(EXISTING="$existing" OWNER_ID="$owner" UID_AGENT="$uid" python3 - "$FILE" <<'PY'
import json, os, sys, uuid
ex = json.loads(os.environ["EXISTING"])
items = json.load(open(sys.argv[1]))
low = lambda t: (t or "").strip().lower()
foyers = [i for i in ex if i["kind"] == "foyer"]
foyer = foyers[0]["id"] if foyers else None
have = {(i["kind"], low(i["title"]), i.get("parent_id")) for i in ex}
projects = {low(i["title"]): i for i in ex if i["kind"] == "project"}
out, skipped, done, errors, moved, updates = [], [], [], [], [], []
BLOCK = {"id", "user_id", "created_at", "updated_at", "completed_by"}
def find(r, what):
    if r.get("id"):
        m = [i for i in ex if i["id"] == r["id"]]
    else:
        m = [i for i in ex if i.get("kind") == r.get("kind") and low(i.get("title")) == low(r.get("match"))]
    if len(m) != 1: errors.append(f"{what} : {len(m)} élément(s) trouvé(s) pour {r.get('id') or r.get('match')}, préciser avec id"); return None
    return m[0]
now = __import__("datetime").datetime.utcnow().isoformat() + "Z"
for r in items:
    r = dict(r)
    op = r.pop("op", None)
    if op in ("update", "trash"):
        t = find(r, op)
        if not t: continue
        st = {"status": "trashed"} if op == "trash" else dict(r.get("set") or {})
        bad = [k for k in st if k in BLOCK]
        if bad: errors.append(f"Colonnes refusées : {bad}"); continue
        if "meta" in st: st["meta"] = {**(t.get("meta") or {}), **st["meta"]}
        updates.append({"id": t["id"], "title": t["title"], "set": st})
        continue
    if op == "create":
        owner = os.environ.get("OWNER_ID") or os.environ["UID_AGENT"]
        par = r.pop("parent", None)
        if par:
            pm = [i for i in ex if low(i.get("title")) == low(par)]
            if len(pm) != 1: errors.append(f"Parent « {par} » : {len(pm)} trouvé(s)"); continue
            r["parent_id"] = pm[0]["id"]
        bad = [k for k in r if k in BLOCK]
        if bad: errors.append(f"Colonnes refusées : {bad}"); continue
        title = (r.get("title") or "").strip()
        k = r.get("kind")
        if not k: errors.append("create sans kind"); continue
        if not title and k not in ("inbox",): skipped.append("(sans titre)"); continue
        if title and (k, low(title), r.get("parent_id")) in have: skipped.append(title); continue
        have.add((k, low(title), r.get("parent_id")))
        out.append({"id": str(uuid.uuid4()), "user_id": owner, "status": "active", "source": "agent", **r})
        continue
    pname = r.pop("project", None)
    title = r.get("title", "").strip()
    if pname:  # projet, actions, sections, frise : rattachés à un projet existant
        proj = projects.get(low(pname))
        if not proj:
            errors.append(f"Projet introuvable : « {pname} ». Demander à l'utilisateur de le créer et de le partager en « Peut modifier » avec le compte agent.")
            continue
        tgt = r.pop("done", None)
        if tgt is not None:  # cocher une action existante
            m = [i for i in ex if i["kind"] == "task" and i.get("parent_id") == proj["id"] and low(i["title"]) == low(tgt)]
            if m: done.append({"id": m[0]["id"], "title": m[0]["title"]})
            else: skipped.append(f"action à cocher introuvable : {tgt}")
            continue
        mv = r.pop("move", None)
        if mv is not None:  # ranger une action existante dans une section
            m = [i for i in ex if i["kind"] == "task" and i.get("parent_id") == proj["id"] and low(i["title"]) == low(mv)]
            if not m: skipped.append(f"action à ranger introuvable : {mv}"); continue
            name = r.get("section") or ""
            sid = None
            if name:
                sm = [i for i in ex if i["kind"] == "section" and i.get("parent_id") == proj["id"] and low(i["title"]) == low(name)]
                if not sm: errors.append(f"Section introuvable dans « {pname} » : {name}"); continue
                sid = sm[0]["id"]
            moved.append({"id": m[0]["id"], "title": m[0]["title"], "section": name or "(aucune)", "meta": {**(m[0].get("meta") or {}), "sec": sid}})
            continue
        kind = r.get("kind", "task")
        meta = dict(r.get("meta") or {})
        sec = r.pop("section", None); sup = r.pop("sup", None)
        for key, name in (("sec", sec), ("sup", sup)):
            if name:
                m = [i for i in ex if i["kind"] == "section" and i.get("parent_id") == proj["id"] and low(i["title"]) == low(name)]
                if not m: errors.append(f"Section introuvable dans « {pname} » : {name}"); meta = None; break
                meta[key] = m[0]["id"]
        if meta is None: continue
        if kind == "plog":
            meta.setdefault("types", ["code"]); meta.setdefault("date", now[:10])
            bad = [t for t in meta["types"] if t not in ("feature", "code", "fix", "design")]
            if bad: errors.append(f"Type de frise inconnu : {bad}"); continue
        parent = proj["id"]
        user = proj["user_id"]
        extra = {"meta": meta} if meta else {}
    else:  # recettes et produits : foyer
        if not foyer:
            sys.exit("Aucun foyer partagé avec le compte agent. Dans Brain : Courses > menu ⋯ > Foyer et partage, créer le foyer puis le partager en « Peut modifier ».")
        kind = r.get("kind", "recipe"); parent = foyer; user = os.environ["UID_AGENT"]; extra = {}
    if not title or (kind, low(title), parent) in have:
        skipped.append(title); continue
    have.add((kind, low(title), parent))
    row = {"id": str(uuid.uuid4()), "user_id": user, "kind": kind, "status": "active", "parent_id": parent, "source": "agent", **r, **extra, "title": title}
    if kind == "section":
        ex.append({"id": row["id"], "kind": "section", "title": title, "parent_id": parent})
    out.append(row)
print(json.dumps({"rows": out, "skipped": skipped, "done": done, "moved": moved, "updates": updates, "errors": errors}))
PY
)
errs=$(printf '%s' "$rows" | python3 -c 'import json,sys;print("\n".join(json.load(sys.stdin)["errors"]))')
[ -n "$errs" ] && echo "$errs" >&2
n=$(printf '%s' "$rows" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["rows"]))')
nm=$(printf '%s' "$rows" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["moved"]))')
nu=$(printf '%s' "$rows" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["updates"]))')
nd=$(printf '%s' "$rows" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["done"]))')
skipped=$(printf '%s' "$rows" | python3 -c 'import json,sys;print(", ".join(json.load(sys.stdin)["skipped"]))')
[ -n "$skipped" ] && echo "Ignorés (déjà là, introuvables ou sans titre) : $skipped" >&2
if [ "$DRY" = 1 ]; then
  printf '%s' "$rows" | python3 -c 'import json,sys;d=json.load(sys.stdin);[print("-", r["kind"], r["title"]) for r in d["rows"]];[print("- cocher", x["title"]) for x in d["done"]];[print("- ranger", x["title"], "->", x["section"]) for x in d["moved"]];[print("- modifier", x["title"], ":", json.dumps(x["set"], ensure_ascii=False)) for x in d["updates"]]'
  echo "$n à ajouter, $nd à cocher, $nm à ranger, $nu à modifier (--dry : rien écrit)"; exit 0
fi
[ "$n" -gt 0 ] || [ "$nd" -gt 0 ] || [ "$nm" -gt 0 ] || [ "$nu" -gt 0 ] || { echo "Rien à faire"; exit 0; }
if [ "$n" -gt 0 ]; then
  # PostgREST exige les mêmes clés dans un envoi groupé : un envoi par forme de ligne (les colonnes absentes gardent leur valeur par défaut)
  printf '%s' "$rows" | python3 -c '
import json, sys
g = {}
for r in json.load(sys.stdin)["rows"]: g.setdefault(tuple(sorted(r)), []).append(r)
for b in g.values(): print(json.dumps(b))' | while read -r batch; do
    res=$(printf '%s' "$batch" | api items -X POST -H "Content-Type: application/json" -H "Prefer: return=minimal" -d @-)
    [ -z "$res" ] || { echo "Écriture refusée : $res" >&2; exit 1; }
  done
fi
if [ "$nd" -gt 0 ]; then
  ids=$(printf '%s' "$rows" | python3 -c 'import json,sys;print(",".join(x["id"] for x in json.load(sys.stdin)["done"]))')
  api "items?id=in.($ids)" -X PATCH -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "{\"status\":\"done\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"completed_by\":\"$uid\"}"
fi
if [ "$nm" -gt 0 ]; then
  printf '%s' "$rows" | python3 -c 'import json,sys;[print(x["id"], json.dumps({"meta": x["meta"]})) for x in json.load(sys.stdin)["moved"]]' \
    | while read -r mid body; do api "items?id=eq.$mid" -X PATCH -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "$body"; done
fi
if [ "$nu" -gt 0 ]; then
  printf '%s' "$rows" | python3 -c 'import json,sys;[print(x["id"], json.dumps(x["set"])) for x in json.load(sys.stdin)["updates"]]' \
    | while read -r uid2 body; do api "items?id=eq.$uid2" -X PATCH -H "Content-Type: application/json" -H "Prefer: return=minimal" -d "$body"; done
fi
echo "$n ajouté(s), $nd coché(s), $nm rangé(s), $nu modifié(s)"
