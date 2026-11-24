"""Genera los permisos de Hasura (rol `user`) por fila: ópticas del usuario + permiso de módulo.
Uso: python3 scripts/gen_permissions.py   (reescribe nhost/metadata/databases/default/tables/public_*.yaml)"""
import yaml, glob, os
class NoAlias(yaml.SafeDumper):
    def ignore_aliases(self, data): return True
T = os.path.join(os.path.dirname(__file__), '..', 'nhost/metadata/databases/default/tables')
UID = {'_eq': 'X-Hasura-User-Id'}
A = {'user_access': {'user_id': UID}}                       # sobre branches / companies
B = {'branch': A}                                           # tablas con sucursal
C = {'company': A}                                          # tablas con compañía
ANY = {'_exists': {'_table': {'schema': 'public', 'name': 'user_module_access'}, '_where': {'user_id': UID}}}
def M(*mods):  # permiso de edición en alguno de los módulos
    return {'_exists': {'_table': {'schema': 'public', 'name': 'user_module_access'}, '_where': {'_and': [{'user_id': UID}, {'module': {'_in': list(mods)}}, {'access': {'_eq': 'editar'}}]}}}
def AND(*xs): return {'_and': [x for x in xs if x]}
IC = {'_or': [{'issuer_company': A}, {'receiver_company': A}]}
TR = {'_or': [{'from_branch': A}, {'to_branch': A}]}
CLI = ('clientes', 'pos', 'examenes', 'agenda', 'cotizaciones', 'cajon', 'rma')
# tabla: (filtro de lectura, filtro de escritura sobre la fila, módulos con permiso de edición, delete permitido)
R = {
 'companies': (ANY, None, ('configuracion',), False),
 'branches': (ANY, None, ('configuracion',), False),
 'staff': (ANY, None, ('configuracion',), False),
 'staff_branches': (ANY, None, ('configuracion',), True),
 'role_permissions': (ANY, None, ('configuracion',), False),
 'consult_reasons': (ANY, None, ('configuracion',), True),
 'suppliers': (ANY, None, ('configuracion', 'stock'), False),
 'products': (ANY, None, ('configuracion', 'stock'), False),
 'customers': (ANY, None, CLI, False),
 'customer_notes': (ANY, None, CLI, True),
 'v_customer_timeline': (ANY, None, (), False),
 'exams': (ANY, B, ('examenes',), False),                         # historia clínica compartida, se escribe en sus ópticas
 'appointments': (B, B, ('agenda', 'clientes', 'examenes'), False),
 'quotes': (B, B, ('cotizaciones', 'cajon', 'examenes', 'pos'), False),
 'quote_items': ({'quote': B}, {'quote': B}, ('cotizaciones', 'examenes'), True),
 'quote_deposits': ({'quote': B}, {'quote': B}, ('cotizaciones', 'cajon'), False),
 'sales': (B, B, ('pos', 'cajon', 'cotizaciones', 'caja', 'ordenes'), False),
 'sale_items': ({'sale': B}, {'sale': B}, ('pos',), False),
 'payments': ({'sale': B}, {'sale': B}, ('pos', 'caja', 'cajon'), False),
 'cash_sessions': (B, B, ('caja', 'pos'), False),
 'cash_movements': ({'cash_session': B}, {'cash_session': B}, ('caja',), False),
 'vouchers': (C, C, ('pos', 'caja', 'rma'), False),
 'lab_orders': (B, B, ('ordenes', 'cajon', 'rma'), False),
 'lab_order_events': ({'lab_order': B}, {'lab_order': B}, ('ordenes', 'cajon', 'rma'), False),
 'stock': (ANY, B, ('stock',), False),                            # disponibilidad visible en todo el grupo
 'stock_movements': (B, B, ('stock',), False),
 'stock_counts': (B, B, ('stock',), False),
 'stock_count_items': ({'count': B}, {'count': B}, ('stock',), True),
 'transfers': (TR, TR, ('stock', 'intercompany'), False),
 'transfer_items': ({'transfer': TR}, {'transfer': TR}, ('stock', 'intercompany'), True),
 'rmas': (B, B, ('rma',), False),
 'rma_events': ({'rma': B}, {'rma': B}, ('rma',), False),
 'intercompany_docs': (IC, IC, ('intercompany',), False),
 'intercompany_items': ({'doc': IC}, {'doc': IC}, ('intercompany',), True),
 'intercompany_rules': (IC, IC, ('intercompany',), False),
 'audit_log': (C, None, (), False),
 'zoho_sync_queue': (C, C, ('zoho',), False),
 'v_alerts': (B, None, (), False),
 'v_funnel_month': (B, None, (), False),
 'v_kpi_branch_month': (B, None, (), False),
 'v_sales_by_seller': (B, None, (), False),
 'v_sales_by_source': (B, None, (), False),
 'v_sales_daily': (B, None, (), False),
 'v_stock_alerts': (B, None, (), False),
 'v_intercompany_balance': (IC, None, (), False),
}
VIEWS = {'user_branch_access': [('branch', 'branch_id', 'branches')], 'user_company_access': [('company', 'company_id', 'companies')], 'user_module_access': []}

def write(name, d):
    with open(os.path.join(T, f'public_{name}.yaml'), 'w') as f: yaml.dump(d, f, Dumper=NoAlias, sort_keys=False, allow_unicode=True)

for name, (read, scope, mods, can_delete) in R.items():
    p = os.path.join(T, f'public_{name}.yaml')
    d = yaml.safe_load(open(p))
    old = {k: d.get(k) for k in ('select_permissions',)}
    agg = any(x.get('permission', {}).get('allow_aggregations') for x in (old['select_permissions'] or []))
    for k in ('insert_permissions', 'select_permissions', 'update_permissions', 'delete_permissions'): d.pop(k, None)
    sel = {'columns': '*', 'filter': read}
    if agg: sel['allow_aggregations'] = True
    d['select_permissions'] = [{'role': 'user', 'permission': sel}]
    if mods:
        w = AND(scope, M(*mods)) if scope else M(*mods)
        d['insert_permissions'] = [{'role': 'user', 'permission': {'check': w, 'columns': '*'}}]
        d['update_permissions'] = [{'role': 'user', 'permission': {'columns': '*', 'filter': w, 'check': w}}]
        if can_delete: d['delete_permissions'] = [{'role': 'user', 'permission': {'filter': w}}]
    write(name, d)

# relaciones manuales a las vistas de acceso
for tbl, view, col in (('branches', 'user_branch_access', 'branch_id'), ('companies', 'user_company_access', 'company_id')):
    p = os.path.join(T, f'public_{tbl}.yaml'); d = yaml.safe_load(open(p))
    arr = [r for r in d.get('array_relationships', []) if r['name'] != 'user_access']
    arr.append({'name': 'user_access', 'using': {'manual_configuration': {'remote_table': {'schema': 'public', 'name': view}, 'column_mapping': {'id': col}}}})
    rest = {k: v for k, v in d.items() if k not in ('array_relationships',)}
    order = ['table', 'object_relationships', 'array_relationships', 'select_permissions', 'insert_permissions', 'update_permissions', 'delete_permissions']
    rest['array_relationships'] = arr
    write(tbl, {k: rest[k] for k in order if k in rest} | {k: v for k, v in rest.items() if k not in order})

inc = open(os.path.join(T, 'tables.yaml')).read()
for v, rels in VIEWS.items():
    d = {'table': {'name': v, 'schema': 'public'}}
    if rels: d['object_relationships'] = [{'name': n, 'using': {'manual_configuration': {'remote_table': {'schema': 'public', 'name': t}, 'column_mapping': {c: 'id'}}}} for n, c, t in rels]
    d['select_permissions'] = [{'role': 'user', 'permission': {'columns': '*', 'filter': {'user_id': UID}}}]
    write(v, d)
    if f'public_{v}.yaml' not in inc: inc += f'- "!include public_{v}.yaml"\n'
open(os.path.join(T, 'tables.yaml'), 'w').write(inc)
missing = [os.path.basename(f)[7:-5] for f in glob.glob(os.path.join(T, 'public_*.yaml')) if os.path.basename(f)[7:-5] not in R and os.path.basename(f)[7:-5] not in VIEWS]
print('tablas sin regla:', missing)
