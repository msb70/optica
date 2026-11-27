"""Parte los datos de demostración en trozos <900 KB (límite de la API de SQL de Supabase).
Uso: python3 scripts/split_seed.py  → supabase/seed/NN_datos.sql + supabase/seed/99_ajustes.sql (a mano)"""
import os, re, glob
ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'nhost/migrations/default/1758000001000_seed/up.sql')
OUT = os.path.join(ROOT, 'supabase/seed')
LIMIT = 900_000
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, '[0-8][0-9]_datos.sql')): os.remove(f)

lines = open(SRC, encoding='utf-8').read().split('\n')
# agrupar en sentencias: una sentencia termina en una línea que acaba en ';' (fuera de filas de VALUES)
stmts, cur = [], []
for ln in lines:
    cur.append(ln)
    if ln.rstrip().endswith(';'):
        stmts.append(cur); cur = []
if any(x.strip() for x in cur): stmts.append(cur)

pieces = []  # cada pieza: texto SQL completo
for st in stmts:
    lead = []
    while st and (not st[0].strip() or st[0].lstrip().startswith('--')): lead.append(st.pop(0))
    if lead: pieces.append('\n'.join(lead))
    if not st: continue
    text = '\n'.join(st)
    head = st[0]
    if head.startswith('INSERT INTO') and head.rstrip().endswith('VALUES') and len(text) > LIMIT:
        rows = [r.rstrip().rstrip(',;') for r in st[1:] if r.strip()]
        buf, size = [], 0
        for r in rows:
            if size + len(r) > LIMIT and buf:
                pieces.append(head + '\n' + ',\n'.join(buf) + ';'); buf, size = [], 0
            buf.append(r); size += len(r) + 2
        if buf: pieces.append(head + '\n' + ',\n'.join(buf) + ';')
    else:
        pieces.append(text)

# Las sentencias de desactivar/activar disparadores van en cada archivo, porque cada uno se ejecuta por separado
TRIG = [p for p in pieces if 'DISABLE TRIGGER USER' in p]
TRIG_ON = [p for p in pieces if 'ENABLE TRIGGER USER' in p]
body = [p for p in pieces if p not in TRIG and p not in TRIG_ON]
pre = '\n'.join(TRIG); post = '\n'.join(TRIG_ON)
files, buf, size = [], [], 0
for p in body:
    if size + len(p) > LIMIT and buf:
        files.append(buf); buf, size = [], 0
    buf.append(p); size += len(p) + 1
if buf: files.append(buf)
for i, fb in enumerate(files, 1):
    with open(os.path.join(OUT, f'{i:02d}_datos.sql'), 'w', encoding='utf-8') as f:
        f.write(f'-- Datos de demostración · parte {i}/{len(files)} (generado por scripts/split_seed.py)\n{pre}\n' + '\n'.join(fb) + f'\n{post}\n')
print(len(files), 'archivos', [os.path.getsize(os.path.join(OUT, f'{i:02d}_datos.sql')) for i in range(1, len(files) + 1)])
