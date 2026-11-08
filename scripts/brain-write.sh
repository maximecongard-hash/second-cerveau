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
existing=$(api "items?select=id,kind,title,parent_id,user_id,status,meta&status=neq.trashed&kind=in.(foyer,recipe,shop_item,project,task,section,plog)&limit=5000")

rows=$(EXISTING="$existing" UID_AGENT="$uid" python3 - "$FILE" <<'PY'
import json, os, sys, uuid
ex = json.loads(os.environ["EXISTING"])
items = json.load(open(sys.argv[1]))
low = lambda t: (t or "").strip().lower()
foyers = [i for i in ex if i["kind"] == "foyer"]
foyer = foyers[0]["id"] if foyers else None
have = {(i["kind"], low(i["title"]), i.get("parent_id")) for i in ex}
projects = {low(i["title"]): i for i in ex if i["kind"] == "project"}
out, skipped, done, errors = [], [], [], []
now = __import__("datetime").datetime.utcnow().isoformat() + "Z"
for r in items:
    r = dict(r)
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
print(json.dumps({"rows": out, "skipped": skipped, "done": done, "errors": errors}))
PY
)
errs=$(printf '%s' "$rows" | python3 -c 'import json,sys;print("\n".join(json.load(sys.stdin)["errors"]))')
[ -n "$errs" ] && echo "$errs" >&2
n=$(printf '%s' "$rows" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["rows"]))')
nd=$(printf '%s' "$rows" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["done"]))')
skipped=$(printf '%s' "$rows" | python3 -c 'import json,sys;print(", ".join(json.load(sys.stdin)["skipped"]))')
[ -n "$skipped" ] && echo "Ignorés (déjà là, introuvables ou sans titre) : $skipped" >&2
if [ "$DRY" = 1 ]; then
  printf '%s' "$rows" | python3 -c 'import json,sys;d=json.load(sys.stdin);[print("-", r["kind"], r["title"]) for r in d["rows"]];[print("- cocher", x["title"]) for x in d["done"]]'
  echo "$n à ajouter, $nd à cocher (--dry : rien écrit)"; exit 0
fi
[ "$n" -gt 0 ] || [ "$nd" -gt 0 ] || { echo "Rien à faire"; exit 0; }
if [ "$n" -gt 0 ]; then
  printf '%s' "$rows" | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin)["rows"]))' \
    | api items -X POST -H "Content-Type: application/json" -H "Prefer: return=minimal" -d @-
fi
if [ "$nd" -gt 0 ]; then
  ids=$(printf '%s' "$rows" | python3 -c 'import json,sys;print(",".join(x["id"] for x in json.load(sys.stdin)["done"]))')
  api "items?id=in.($ids)" -X PATCH -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "{\"status\":\"done\",\"completed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"completed_by\":\"$uid\"}"
fi
echo "$n ajouté(s), $nd coché(s)"
