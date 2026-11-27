"""Pruebas de permisos (RLS + funciones) contra una BD estilo Supabase.
Uso: python3 scripts/test_rls.py [bd]   (por defecto la local 'sb' creada con scripts/test_local_supabase.sh)"""
import sys, json, subprocess
DB = sys.argv[1] if len(sys.argv) > 1 else 'sb'
def psql(sql):
    r = subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', DB, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', sql], capture_output=True, text=True)
    return r.stdout.strip(), r.stderr.strip()
P = lambda s: psql(s)[0]
A, E, N = '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'
P(f"""insert into auth.users(id,email) values ('{A}','a@t'),('{E}','e@t'),('{N}','n@t') on conflict do nothing;
update staff set user_id='{A}' where role='admin';
update staff set user_id='{E}', permissions=null where id=(select id from staff where role='vendedor' order by name limit 1);""")
OB = P(f"select branch_id from staff where user_id='{E}'"); CO = P(f"select company_id from branches where id='{OB}'")
OTHB = P(f"select id from branches where id<>'{OB}' limit 1")
CU = P("select id from customers limit 1")
PR = P(f"select p.id from products p join stock s on s.product_id=p.id and s.branch_id='{OB}' where s.qty>3 limit 1")
MYQ = P(f"select id from quotes where branch_id='{OB}' and status in ('abierta','seguimiento') limit 1")
OTHQ = P(f"select id from quotes where branch_id<>'{OB}' and status in ('abierta','seguimiento') limit 1")
OTHS = P(f"select id from sales where branch_id<>'{OB}' limit 1")
def as_user(uid, sql):
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    return psql(f"begin; set local role authenticated; select set_config('request.jwt.claims', '{claims}', true); {sql}; rollback;")
res = []
def t(name, expect_ok, out, check=None):
    val, err = out
    ok = not err and (check(val.split('\n')[-1]) if check else True)
    res.append(ok == expect_ok)
    print('✔' if ok == expect_ok else '✘', name, '→', (err.split('\n')[0] if err else val.split('\n')[-1])[:90])
items = json.dumps([{'product_id': PR, 'qty': 1}]); pay = json.dumps([{'method': 'efectivo', 'amount': 1000}])
CS = lambda b: f"select number from create_sale('{CO}','{b}','{CU}',null,'{items}','{pay}',0,null,null,null)"
t('anon no ve nada', False, psql("begin; set local role anon; select count(*) from sales; rollback;"))
t('admin ve todas las ventas', True, as_user(A, 'select count(*) from sales'), lambda v: int(v) > 2000)
t('vendedora ve solo su óptica', True, as_user(E, 'select count(*) from sales'), lambda v: 0 < int(v) < 1000)
t('usuario sin ficha no ve nada', True, as_user(N, 'select count(*) from sales'), lambda v: int(v) == 0)
t('usuario sin ficha no ve clientes', True, as_user(N, 'select count(*) from customers'), lambda v: int(v) == 0)
t('vendedora ve todos los clientes del grupo', True, as_user(E, 'select count(*) from customers'), lambda v: int(v) > 200)
t('vendedora ve líneas solo de sus ventas', True, as_user(E, f"select count(*) from sale_items si join sales s on s.id=si.sale_id where s.branch_id<>'{OB}'"), lambda v: int(v) == 0)
t('vendedora crea cliente', True, as_user(E, f"insert into customers(company_id,branch_id,code,first_name,last_name,phone) values ('{CO}','{OB}','CT1','A','B','+507 6111-2299') returning id"))
t('vendedora vende en su óptica', True, as_user(E, CS(OB)))
t('vendedora vende en otra óptica', False, as_user(E, CS(OTHB)))
t('vendedora abona cotización propia', True, as_user(E, f"select status from add_quote_deposit('{MYQ}','[{{\"method\":\"efectivo\",\"amount\":10}}]',null,null)"))
t('vendedora abona cotización ajena', False, as_user(E, f"select status from add_quote_deposit('{OTHQ}','[{{\"method\":\"efectivo\",\"amount\":10}}]',null,null)"))
t('vendedora edita venta ajena (0 filas)', True, as_user(E, f"with u as (update sales set notes='x' where id='{OTHS}' returning 1) select count(*) from u"), lambda v: v == '0')
t('vendedora ajusta stock', False, as_user(E, f"insert into stock_movements(product_id,branch_id,qty,type) values ('{PR}','{OB}',5,'ajuste')"))
t('vendedora se hace admin (0 filas)', True, as_user(E, f"with u as (update staff set role='admin', all_branches=true where user_id='{E}' returning 1) select count(*) from u"), lambda v: v == '0')
t('vendedora cambia matriz (0 filas)', True, as_user(E, "with u as (update role_permissions set access='editar' returning 1) select count(*) from u"), lambda v: v == '0')
t('vendedora no lee vistas de acceso', False, as_user(E, 'select count(*) from user_module_access'))
t('vendedora no llama funciones internas', False, as_user(E, f"select next_number('{CO}','sale')"))
t('admin cambia matriz', True, as_user(A, "with u as (update role_permissions set access='ninguno' where role='almacen' and module='pos' returning 1) select count(*) from u"), lambda v: v == '1')
t('informes respetan óptica (vista)', True, as_user(E, f"select count(*) from v_sales_daily where branch_id<>'{OB}'"), lambda v: v == '0')
P(f"update staff set permissions='{{\"stock\":\"editar\"}}' where user_id='{E}'")
t('vendedora con permiso personalizado de stock ajusta stock', True, as_user(E, f"insert into stock_movements(product_id,branch_id,qty,type) values ('{PR}','{OB}',1,'ajuste') returning id"))
P(f"update staff set permissions=null where user_id='{E}'")
print(f"\n{sum(res)}/{len(res)} pruebas correctas")
sys.exit(0 if all(res) else 1)
