#!/usr/bin/env python3
"""Vérifications avant un commit, sans dépendance : python3 scripts/check.py

- chaque fichier de js/ est dans SHELL de sw.js, et chaque entrée de SHELL existe ;
- chaque import pointe vers un fichier existant et un nom qu'il exporte ;
- syntaxe des modules (avec node, s'il est installé) ;
- même version dans js/core/config.js et sw.js, même numéro de schéma dans config.js et schema.sql ;
- avertit si des fichiers de l'app ont changé sans nouvelle version : le service worker servant
  les fichiers depuis son cache, personne ne recevrait ces changements.
"""
import os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors, warnings = [], []


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf8') as f:
        return f.read()


def js_files():
    found = []
    for folder, _, names in os.walk(os.path.join(ROOT, 'js')):
        found += [os.path.relpath(os.path.join(folder, n), ROOT) for n in names if n.endswith('.js')]
    return sorted(found)


def check_shell():
    sw = read('sw.js')
    shell = re.findall(r"^\s*'([^']+)',?$", sw[sw.index('const SHELL'):sw.index('];')], re.M)
    for path in shell:
        if not path.startswith('https:') and path != './' and not os.path.exists(os.path.join(ROOT, path)):
            errors.append(f"SHELL de sw.js : {path} n'existe pas")
    for path in js_files():
        if path not in shell:
            errors.append(f'SHELL de sw.js : {path} manque')


def exports_of(source):
    names = set(re.findall(r'^export (?:async )?(?:const|let|function|class) ([\w$]+)', source, re.M))
    for block in re.findall(r'^export \{([^}]*)\}', source, re.M):
        names |= {part.split(' as ')[-1].strip() for part in block.split(',') if part.strip()}
    return names


def check_imports():
    for path in js_files():
        source = read(path)
        for names, target in re.findall(r"^(?:import|export) (?:\{([^}]*)\} from )?'(\.[^']+)'", source, re.M):
            resolved = os.path.normpath(os.path.join(os.path.dirname(path), target))
            if not os.path.exists(os.path.join(ROOT, resolved)):
                errors.append(f'{path} : {target} introuvable')
                continue
            available = exports_of(read(resolved))
            for name in filter(None, (n.split(' as ')[0].strip() for n in names.split(','))):
                if name not in available:
                    errors.append(f"{path} : {resolved} n'exporte pas {name}")


def check_syntax():
    node = shutil.which('node')
    if not node:
        warnings.append('node absent : syntaxe non vérifiée')
        return
    with tempfile.TemporaryDirectory() as tmp:
        for path in js_files() + ['sw.js', 'config.js', 'widget/Brain.js']:
            copy = os.path.join(tmp, 'module.mjs')
            shutil.copy(os.path.join(ROOT, path), copy)
            run = subprocess.run([node, '--check', copy], capture_output=True, text=True)
            if run.returncode:
                errors.append(f'{path} : syntaxe\n{run.stderr.strip()}')


def app_version():
    return re.search(r"VERSION = '([^']+)'", read('js/core/config.js')).group(1)


def check_versions():
    version = app_version()
    cache = re.search(r"CACHE = 'sc-([^']+)'", read('sw.js')).group(1)
    if version != cache:
        errors.append(f'version : {version} dans config.js, {cache} dans sw.js')
    schema = re.search(r'SCHEMA_VERSION = (\d+)', read('js/core/config.js')).group(1)
    sql = re.search(r"'schema', (\d+)", read('supabase/schema.sql')).group(1)
    if schema != sql:
        errors.append(f'schéma : {schema} dans config.js, {sql} dans schema.sql')


def check_released():
    git = lambda *args: subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)
    head = git('show', 'HEAD:sw.js')
    if head.returncode:
        return
    if re.search(r"CACHE = '([^']+)'", head.stdout).group(1) != re.search(r"CACHE = '([^']+)'", read('sw.js')).group(1):
        return
    changed = git('diff', '--name-only', 'HEAD').stdout.split('\n')
    app = [p for p in changed if p == 'index.html' or p == 'styles.css' or p == 'config.js' or p.startswith('js/')]
    if app:
        warnings.append(f"{len(app)} fichier(s) de l'app modifié(s) sans nouvelle version : à changer avant de publier")


for check in (check_shell, check_imports, check_syntax, check_versions, check_released):
    check()
for line in warnings:
    print('Attention :', line)
for line in errors:
    print('Erreur :', line)
if errors:
    sys.exit(1)
print('Tout est bon.')
