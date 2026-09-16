#!/usr/bin/env python3
"""Genera la metadata de Hasura (nhost/metadata) a partir del esquema local de Postgres.
Uso: PGPASSWORD=postgres python3 scripts/gen_metadata.py
"""
import os, subprocess, yaml, shutil

ROOT = os.path.join(os.path.dirname(__file__), '..', 'nhost', 'metadata')
TABLES_DIR = os.path.join(ROOT, 'databases', 'default', 'tables')
FUNCS_DIR = os.path.join(ROOT, 'databases', 'default', 'functions')
shutil.rmtree(ROOT, ignore_errors=True)
os.makedirs(TABLES_DIR); os.makedirs(FUNCS_DIR)

def psql(sql):
    out = subprocess.check_output(['psql','-h','localhost','-U','postgres','-d','optica','-At','-F','|','-c',sql], env={**os.environ,'PGPASSWORD':'postgres'})
    return [l.split('|') for l in out.decode().strip().splitlines() if l]

tables = [r[0] for r in psql("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")]
views  = [r[0] for r in psql("select table_name from information_schema.views where table_schema='public' order by 1")]
fks = psql("""select tc.table_name, kcu.column_name, ccu.table_name from information_schema.table_constraints tc
 join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name
 join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name
 where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' order by 1,2""")

def obj_name(col):
    return col[:-3] if col.endswith('_id') else {'opened_by':'opener','closed_by':'closer','requested_by':'requester','created_by':'creator'}.get(col, col+'_ref')

# Nombres de relaciones inversas: <tabla> o <tabla>_by_<col> si hay varias FKs a la misma tabla
from collections import Counter
cnt = Counter((t, ref) for t, _, ref in fks)
def arr_name(t, col, ref):
    if cnt[(t, ref)] == 1: return t
    return f"{t}_{obj_name(col)}"  # ej. sales_seller, sales_optometrist

PERM_ALL = {'columns': '*', 'filter': {}}
def perms():
    return {
        'insert_permissions': [{'role':'user','permission':{'check':{}, 'columns':'*'}}],
        'select_permissions': [{'role':'user','permission':{'columns':'*','filter':{}, 'allow_aggregations': True}}],
        'update_permissions': [{'role':'user','permission':{'columns':'*','filter':{}, 'check': {}}}],
        'delete_permissions': [{'role':'user','permission':{'filter':{}}}],
    }

includes = []
for t in tables:
    doc = {'table': {'name': t, 'schema': 'public'}}
    objs = [{'name': obj_name(col), 'using': {'foreign_key_constraint_on': col}} for (tt, col, ref) in fks if tt == t]
    arrs = [{'name': arr_name(tt, col, ref), 'using': {'foreign_key_constraint_on': {'column': col, 'table': {'name': tt, 'schema': 'public'}}}} for (tt, col, ref) in fks if ref == t]
    if t == 'audit_log':
        objs.append({'name': 'company', 'using': {'manual_configuration': {'remote_table': {'name': 'companies', 'schema': 'public'}, 'column_mapping': {'company_id': 'id'}}}})
    if objs: doc['object_relationships'] = objs
    if arrs: doc['array_relationships'] = arrs
    doc.update(perms())
    fn = f'public_{t}.yaml'
    with open(os.path.join(TABLES_DIR, fn), 'w') as f: yaml.safe_dump(doc, f, sort_keys=False, allow_unicode=True)
    includes.append(fn)

# Vistas: solo select + relaciones manuales a branch/company/customer/product cuando existan
for v in views:
    cols = [r[0] for r in psql(f"select column_name from information_schema.columns where table_schema='public' and table_name='{v}'")]
    doc = {'table': {'name': v, 'schema': 'public'}}
    objs = []
    for col, ref in (('branch_id','branches'),('company_id','companies'),('customer_id','customers'),('product_id','products'),('seller_id','staff'),('issuer_company_id','companies'),('receiver_company_id','companies')):
        if col in cols:
            objs.append({'name': obj_name(col), 'using': {'manual_configuration': {'remote_table': {'name': ref, 'schema': 'public'}, 'column_mapping': {col: 'id'}}}})
    if objs: doc['object_relationships'] = objs
    doc['select_permissions'] = [{'role':'user','permission':{'columns':'*','filter':{}, 'allow_aggregations': True}}]
    fn = f'public_{v}.yaml'
    with open(os.path.join(TABLES_DIR, fn), 'w') as f: yaml.safe_dump(doc, f, sort_keys=False, allow_unicode=True)
    includes.append(fn)

# ---- Tablas de auth y storage (Nhost) — configuración mínima y segura ----
AUTH_TABLES = ['provider_requests','providers','refresh_token_types','refresh_tokens','roles','user_providers','user_roles','user_security_keys','users']
STORAGE_TABLES = ['buckets','files','virus']
def camel(s):
    p = s.split('_'); return p[0] + ''.join(x.title() for x in p[1:])
def root_fields(name):
    single = name[:-1] if name.endswith('s') else name
    Cap = lambda x: x[0].upper()+x[1:]
    return {'delete': f'delete{Cap(name)}', 'delete_by_pk': f'delete{Cap(single)}', 'insert': f'insert{Cap(name)}', 'insert_one': f'insert{Cap(single)}',
            'select': name, 'select_aggregate': f'{name}Aggregate', 'select_by_pk': single, 'update': f'update{Cap(name)}', 'update_by_pk': f'update{Cap(single)}'}
AUTH_CUSTOM = {'provider_requests':'authProviderRequests','providers':'authProviders','refresh_token_types':'authRefreshTokenTypes','refresh_tokens':'authRefreshTokens','roles':'authRoles','user_providers':'authUserProviders','user_roles':'authUserRoles','user_security_keys':'authUserSecurityKeys','users':'users'}
for t in AUTH_TABLES:
    name = AUTH_CUSTOM[t]
    doc = {'table': {'name': t, 'schema': 'auth'}, 'configuration': {'custom_name': name, 'custom_root_fields': root_fields(name)}}
    if t == 'users':
        doc['array_relationships'] = [
            {'name':'refreshTokens','using':{'foreign_key_constraint_on':{'column':'user_id','table':{'name':'refresh_tokens','schema':'auth'}}}},
            {'name':'roles','using':{'foreign_key_constraint_on':{'column':'user_id','table':{'name':'user_roles','schema':'auth'}}}},
            {'name':'userProviders','using':{'foreign_key_constraint_on':{'column':'user_id','table':{'name':'user_providers','schema':'auth'}}}},
        ]
        doc['select_permissions'] = [{'role':'user','permission':{'columns':['id','display_name','email','avatar_url','default_role','created_at'],'filter':{'id':{'_eq':'X-Hasura-User-Id'}}}}]
    if t in ('refresh_tokens','user_roles','user_providers','user_security_keys'):
        doc['object_relationships'] = [{'name':'user','using':{'foreign_key_constraint_on':'user_id'}}]
    fn = f'auth_{t}.yaml'
    with open(os.path.join(TABLES_DIR, fn), 'w') as f: yaml.safe_dump(doc, f, sort_keys=False)
    includes.append(fn)
for t in STORAGE_TABLES:
    name = {'buckets':'buckets','files':'files','virus':'virus'}[t]
    doc = {'table': {'name': t, 'schema': 'storage'}, 'configuration': {'custom_name': name, 'custom_root_fields': root_fields(name)}}
    if t == 'files':
        doc['object_relationships'] = [{'name':'bucket','using':{'foreign_key_constraint_on':'bucket_id'}}]
    if t == 'buckets':
        doc['array_relationships'] = [{'name':'files','using':{'foreign_key_constraint_on':{'column':'bucket_id','table':{'name':'files','schema':'storage'}}}}]
    fn = f'storage_{t}.yaml'
    with open(os.path.join(TABLES_DIR, fn), 'w') as f: yaml.safe_dump(doc, f, sort_keys=False)
    includes.append(fn)

with open(os.path.join(TABLES_DIR, 'tables.yaml'), 'w') as f:
    f.write('\n'.join(f'- "!include {i}"' for i in includes) + '\n')

# Funciones expuestas como mutaciones
FUNCS = ['create_sale','convert_quote','close_cash_session','transfer_send','transfer_receive']
with open(os.path.join(FUNCS_DIR, 'functions.yaml'), 'w') as f:
    yaml.safe_dump([{'function': {'name': fn, 'schema': 'public'}, 'configuration': {'exposed_as': 'mutation'}, 'permissions': [{'role': 'user'}]} for fn in FUNCS], f, sort_keys=False)

with open(os.path.join(ROOT, 'databases', 'databases.yaml'), 'w') as f:
    f.write('''- name: default
  kind: postgres
  configuration:
    connection_info:
      database_url:
        from_env: HASURA_GRAPHQL_DATABASE_URL
      isolation_level: read-committed
      pool_settings:
        connection_lifetime: 600
        idle_timeout: 180
        max_connections: 50
        retries: 1
      use_prepared_statements: true
  tables: "!include default/tables/tables.yaml"
  functions: "!include default/functions/functions.yaml"
''')
for fn, content in {'version.yaml':'version: 3\n','actions.yaml':'actions: []\ncustom_types:\n  enums: []\n  input_objects: []\n  objects: []\n  scalars: []\n','actions.graphql':'','allow_list.yaml':'[]\n','cron_triggers.yaml':'[]\n','query_collections.yaml':'[]\n','remote_schemas.yaml':'[]\n','rest_endpoints.yaml':'[]\n','inherited_roles.yaml':'[]\n','api_limits.yaml':'{}\n','graphql_schema_introspection.yaml':'disabled_for_roles: []\n','network.yaml':'{}\n','backend_configs.yaml':'{}\n','metrics_config.yaml':'{}\n','opentelemetry.yaml':'{}\n'}.items():
    with open(os.path.join(ROOT, fn), 'w') as f: f.write(content)
print('metadata OK:', len(includes), 'tables/views')
