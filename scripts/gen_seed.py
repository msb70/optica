#!/usr/bin/env python3
"""Genera nhost/migrations/default/1758000001000_seed/up.sql con datos realistas y deterministas."""
import random, uuid, json, datetime as dt, os
from decimal import Decimal

random.seed(42)
OUT = os.path.join(os.path.dirname(__file__), '..', 'nhost', 'migrations', 'default', '1758000001000_seed')
os.makedirs(OUT, exist_ok=True)
TODAY = dt.date(2026, 9, 16)
START = TODAY - dt.timedelta(days=185)

def U(seed): return str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))
def q(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float, Decimal)): return str(v)
    if isinstance(v, (dt.date, dt.datetime)): return "'" + v.isoformat() + "'"
    if isinstance(v, (dict, list)): return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

rows = {}  # table -> (cols, [values])
def ins(table, **kw):
    cols = tuple(kw.keys())
    rows.setdefault(table, []).append((cols, kw))

# ---------------- Compañías y sucursales ----------------
COMPANIES = [
    dict(id=U('co-optilux'), code='OPTILUX', legal_name='Optilux S.A.', trade_name='Optilux', tax_id='155612345-2-2019 DV 45', invoice_prefix='OPX', zoho_org_id='7000123001', tax_rate=7),
    dict(id=U('co-chorrera'), code='CHORRERA', legal_name='Optilux Chorrera S.A.', trade_name='Optilux Chorrera', tax_id='155698765-2-2021 DV 12', invoice_prefix='OPC', zoho_org_id='7000123002', tax_rate=7),
    dict(id=U('co-david'), code='DAVID', legal_name='Optilux David', trade_name='Optilux David', tax_id='8-901-2345 DV 07', invoice_prefix='OPD', zoho_org_id='7000123003', tax_rate=7),
]
BRANCHES = [
    dict(id=U('br-obarrio'), company_id=U('co-optilux'), code='OBA', name='Obarrio', address='Calle 56 Este, Obarrio, Panamá', phone='+507 263-1100', monthly_goal=27000),
    dict(id=U('br-coste'), company_id=U('co-optilux'), code='CDE', name='Costa del Este', address='Town Center, Costa del Este', phone='+507 271-2200', monthly_goal=24000),
    dict(id=U('br-viaesp'), company_id=U('co-optilux'), code='VES', name='Vía España', address='Vía España, Plaza Concordia', phone='+507 223-3300', monthly_goal=21000),
    dict(id=U('br-chorrera'), company_id=U('co-chorrera'), code='CHO', name='Chorrera', address='Westland Mall, La Chorrera', phone='+507 254-4400', monthly_goal=14000),
    dict(id=U('br-david'), company_id=U('co-david'), code='DAV', name='David', address='Federal Mall, David, Chiriquí', phone='+507 775-5500', monthly_goal=12000),
]
for c in COMPANIES: ins('companies', **c, next_invoice_no=1)
for b in BRANCHES: ins('branches', **b)
CO_BR = {c['id']: [b for b in BRANCHES if b['company_id'] == c['id']] for c in COMPANIES}

# ---------------- Staff ----------------
STAFF = []
names_v = ['Elena Batista','Omar Sáenz','Ana Castillo','Luis Pérez','Carla Moreno','Jorge Batista','Sofía Ríos','Diego Herrera','Valeria Núñez','Marcos Vega','Paola Jiménez','Raúl Camargo','Nadia Soto','Iván Quintero']
names_o = ['Dra. Laura Espinoza','Dr. Andrés Villalobos','Dra. Karen Pinzón','Dr. Samuel Ortega','Dra. Mónica Arauz']
names_c = ['Yaritza Gómez','Eduardo Lam','Mireya Tejada','Bernardo Ruiz','Gladys Chen']
vi = oi = ci = 0
ins('staff', id=U('st-admin'), company_id=U('co-optilux'), branch_id=None, name='Miguel Spina', email='miguel@optilux.com', role='admin', commission_pct=0, max_discount_pct=100)
for b in BRANCHES:
    nv = 3 if b['company_id'] == U('co-optilux') else 2
    for k in range(nv):
        sid = U(f"st-v-{b['code']}-{k}")
        STAFF.append(dict(id=sid, company_id=b['company_id'], branch_id=b['id'], name=names_v[vi], role='vendedor', commission_pct=random.choice([3,4,5]), max_discount_pct=10, monthly_goal=b['monthly_goal']/nv))
        vi += 1
    sid = U(f"st-o-{b['code']}")
    STAFF.append(dict(id=sid, company_id=b['company_id'], branch_id=b['id'], name=names_o[oi], role='optometrista', commission_pct=2, max_discount_pct=5)); oi += 1
    sid = U(f"st-c-{b['code']}")
    STAFF.append(dict(id=sid, company_id=b['company_id'], branch_id=b['id'], name=names_c[ci], role='cajero', commission_pct=0, max_discount_pct=0)); ci += 1
    if b['company_id'] != U('co-optilux'):
        STAFF.append(dict(id=U(f"st-g-{b['code']}"), company_id=b['company_id'], branch_id=b['id'], name='Gerente '+b['name'], role='gerente', commission_pct=1, max_discount_pct=20))
for s in STAFF: ins('staff', **s, email=s['name'].lower().replace('dra. ','').replace('dr. ','').replace(' ','.')+'@optilux.com')
SELLERS = {b['id']: [s for s in STAFF if s['branch_id']==b['id'] and s['role']=='vendedor'] for b in BRANCHES}
OPTOS = {b['id']: [s for s in STAFF if s['branch_id']==b['id'] and s['role']=='optometrista'][0] for b in BRANCHES}
CASHIERS = {b['id']: [s for s in STAFF if s['branch_id']==b['id'] and s['role']=='cajero'][0] for b in BRANCHES}

# ---------------- Productos ----------------
PRODUCTS = []
frames = [('Ray-Ban','RB5154 Clubmaster',189),('Ray-Ban','RB2140 Wayfarer',175),('Oakley','OX8046 Airdrop',210),('Prada','VPR 16M',320),('Gucci','GG0027O',390),('Tommy Hilfiger','TH 1655',120),('Vogue','VO5276',95),('Carrera','8866',130),('Nike','7027',110),('Guess','GU2748',105),('Lacoste','L2860',140),('Emporio Armani','EA3183',165),('Coach','HC6150',150),('Michael Kors','MK4062',160),('Persol','PO3007V',260),('Optilux Essentials','OE-101 Acetato',59),('Optilux Essentials','OE-205 Metal',69),('Optilux Kids','OK-12 Flex',49),('Optilux Kids','OK-20 Sport',55),('Silhouette','Titan Minimal',420)]
colors = ['Negro','Carey','Azul','Transparente','Dorado','Plata']
for i,(br,mo,pr) in enumerate(frames):
    for c in random.sample(colors, 2):
        PRODUCTS.append(dict(id=U(f'p-frame-{i}-{c}'), sku=f'ARM-{i+1:03d}-{c[:3].upper()}', name=f'{br} {mo} {c}', category='armazon', brand=br, model=mo, color=c, cost=round(pr*0.42,2), price=pr, min_stock=2, track_stock=True))
lenses = [('Monofocal CR-39 Básico',45,12),('Monofocal Policarbonato AR',95,28),('Monofocal Alto Índice 1.67 AR',180,55),('Progresivo Estándar',220,70),('Progresivo Premium Digital',390,130),('Progresivo Varilux Comfort',480,170),('Bifocal Flat-Top',110,35),('Blue Light Filter Monofocal',130,40),('Fotocromático Transitions Gen 8',260,95),('Ocupacional / Oficina',210,68)]
for i,(n,pr,co) in enumerate(lenses):
    PRODUCTS.append(dict(id=U(f'p-lens-{i}'), sku=f'LEN-{i+1:03d}', name=n, category='lente', brand='Essilor' if i%2 else 'Hoya', cost=co, price=pr, min_stock=0, track_stock=False))
contacts = [('Acuvue Oasys (6)',48,26),('Air Optix Aqua (6)',52,28),('Biofinity (6)',55,30),('Dailies Total1 (30)',62,36),('FreshLook ColorBlends',38,18)]
for i,(n,pr,co) in enumerate(contacts):
    PRODUCTS.append(dict(id=U(f'p-cl-{i}'), sku=f'LC-{i+1:03d}', name=n, category='lente_contacto', brand=n.split(' ')[0], cost=co, price=pr, min_stock=5, track_stock=True))
sol = [('Ray-Ban','Aviator RB3025',185),('Oakley','Holbrook',160),('Maui Jim','Peahi',290),('Costa','Fantail',220),('Optilux Sun','OS-01 Polarizado',75)]
for i,(br,mo,pr) in enumerate(sol):
    PRODUCTS.append(dict(id=U(f'p-sun-{i}'), sku=f'SOL-{i+1:03d}', name=f'{br} {mo}', category='solar', brand=br, model=mo, cost=round(pr*0.45,2), price=pr, min_stock=2, track_stock=True))
acc = [('Estuche rígido premium',12,4),('Paño microfibra',3,0.6),('Spray limpiador 60ml',6,1.8),('Cordón para gafas',5,1.2),('Solución lentes de contacto 360ml',14,7)]
for i,(n,pr,co) in enumerate(acc):
    PRODUCTS.append(dict(id=U(f'p-acc-{i}'), sku=f'ACC-{i+1:03d}', name=n, category='accesorio', cost=co, price=pr, min_stock=10, track_stock=True))
serv = [('Examen optométrico completo',25),('Examen visual pediátrico',30),('Adaptación lentes de contacto',35),('Ajuste y reparación de armazón',10),('Tratamiento antirreflejo (servicio)',40)]
for i,(n,pr) in enumerate(serv):
    PRODUCTS.append(dict(id=U(f'p-srv-{i}'), sku=f'SRV-{i+1:03d}', name=n, category='servicio', cost=0, price=pr, min_stock=0, track_stock=False))
for p in PRODUCTS: ins('products', **p)
BY_CAT = {}
for p in PRODUCTS: BY_CAT.setdefault(p['category'], []).append(p)

# Stock inicial (compra) por sucursal
for b in BRANCHES:
    for p in PRODUCTS:
        if not p['track_stock']: continue
        base = {'armazon':random.randint(5,14),'lente_contacto':random.randint(10,30),'solar':random.randint(3,9),'accesorio':random.randint(20,60)}[p['category']]
        if b['company_id'] != U('co-optilux'): base = max(0, base-2)
        if base > 0:
            ins('stock_movements', product_id=p['id'], branch_id=b['id'], qty=base, type='compra', note='Inventario inicial', created_at=dt.datetime.combine(START, dt.time(8,0)))
        # reposiciones mensuales
        for m in range(1,7):
            d = START + dt.timedelta(days=30*m)
            if d >= TODAY: break
            if random.random() < 0.7:
                rq = {'armazon':random.randint(2,6),'lente_contacto':random.randint(6,15),'solar':random.randint(1,4),'accesorio':random.randint(10,30)}[p['category']]
                ins('stock_movements', product_id=p['id'], branch_id=b['id'], qty=rq, type='compra', note='Reposición proveedor', created_at=dt.datetime.combine(d, dt.time(8,30)))

# ---------------- Clientes ----------------
first_m = ['Carlos','José','Luis','Juan','Miguel','Roberto','Ricardo','Alberto','Fernando','Javier','Andrés','Daniel','Gabriel','Héctor','Manuel','Pedro','Rafael','Sergio','Tomás','Víctor','Mateo','Sebastián','Emilio','Bruno']
first_f = ['María','Ana','Carmen','Laura','Patricia','Rosa','Elena','Gloria','Isabel','Julia','Karina','Lucía','Marta','Natalia','Olga','Paula','Raquel','Silvia','Teresa','Verónica','Camila','Valentina','Daniela','Fernanda']
last = ['González','Rodríguez','Pérez','Martínez','Sánchez','Ramírez','Torres','Flores','Rivera','Gómez','Díaz','Castillo','Moreno','Herrera','Medina','Vargas','Castro','Ortiz','Jiménez','Mendoza','Batista','Pinzón','Quintero','Arauz','Tejada','Lam','Chen','Espinoza','Camargo','Villalobos']
SOURCES = ['walk-in']*35 + ['referido']*18 + ['instagram']*15 + ['google_ads']*10 + ['campania']*8 + ['empresa']*6 + ['doctor']*5 + ['facebook']*3
CUSTOMERS = []
n = 0
for b in BRANCHES:
    cnt = 60 if b['company_id']==U('co-optilux') else 40
    for k in range(cnt):
        n += 1
        g = random.choice(['M','F'])
        fn = random.choice(first_m if g=='M' else first_f)
        is_kid = random.random() < 0.15
        by = TODAY.year - (random.randint(5,15) if is_kid else random.randint(19,74))
        created = START + dt.timedelta(days=random.randint(-400, 190))
        cid = U(f'cust-{n}')
        c = dict(id=cid, company_id=b['company_id'], branch_id=b['id'], code=f'C{n:05d}', first_name=fn, last_name=random.choice(last)+' '+random.choice(last),
                 email=f'{fn.lower()}.{n}@mail.com', phone=f'+507 6{random.randint(100,999)}-{random.randint(1000,9999)}',
                 birth_date=dt.date(by, random.randint(1,12), random.randint(1,28)), gender=g, source=random.choice(SOURCES),
                 tax_id=f'8-{random.randint(100,999)}-{random.randint(100,9999)}', created_at=dt.datetime.combine(max(created, dt.date(2024,1,1)), dt.time(10,0)),
                 tags=['niño'] if is_kid else [], balance=0)
        CUSTOMERS.append(c)
for c in CUSTOMERS: ins('customers', **{k:v for k,v in c.items() if k!='tags'}, tags='{'+','.join(c['tags'])+'}' if c['tags'] else '{}')
CUST_BY_BR = {b['id']: [c for c in CUSTOMERS if c['branch_id']==b['id']] for b in BRANCHES}

# ---------------- Operación diaria: citas, exámenes, cotizaciones, ventas, caja ----------------
def rx(kid=False):
    def eye():
        sph = round(random.choice([-1,1]) * random.choice([0.25,0.5,0.75,1,1.25,1.5,2,2.5,3,3.5,4]),2)
        cyl = round(-random.choice([0,0,0.25,0.5,0.75,1,1.5]),2)
        return dict(sph=sph, cyl=cyl, axis=random.randint(0,179) if cyl else 0, add=0 if kid else random.choice([0,0,1.0,1.5,2.0,2.5]), va='20/20')
    return dict(od=eye(), oi=eye(), pd=random.randint(56,68) if not kid else random.randint(50,58))

counters = {c['id']: 1 for c in COMPANIES}
def number(co, kind):
    n = counters[co]; counters[co] += 1
    pref = next(c['invoice_prefix'] for c in COMPANIES if c['id']==co)
    return f'{pref}-{kind}-{n:06d}'

sale_ids = []
day = START
while day <= TODAY:
    dow = day.weekday()
    for b in BRANCHES:
        if dow == 6: continue  # domingo cerrado
        is_main = b['company_id']==U('co-optilux')
        # sesión de caja
        cs_id = U(f"cs-{b['code']}-{day}")
        opened = dt.datetime.combine(day, dt.time(9, random.randint(0,10)))
        closed = dt.datetime.combine(day, dt.time(19, random.randint(0,30)))
        is_today = day == TODAY
        ins('cash_sessions', id=cs_id, company_id=b['company_id'], branch_id=b['id'], opened_by=CASHIERS[b['id']]['id'], closed_by=None if is_today else CASHIERS[b['id']]['id'],
            opened_at=opened, closed_at=None if is_today else closed, opening_amount=150, status='abierta' if is_today else 'cerrada')
        cash_in = 150.0
        if random.random() < 0.25:
            amt = random.choice([15,20,35,50]); cash_in -= amt
            ins('cash_movements', cash_session_id=cs_id, type='egreso', amount=amt, concept=random.choice(['Compra de suministros','Mensajería laboratorio','Agua/café','Taxi entrega']), staff_id=CASHIERS[b['id']]['id'], created_at=opened+dt.timedelta(hours=3))
        # citas / exámenes
        nappt = random.randint(2,5) if is_main else random.randint(1,3)
        if dow == 5: nappt = int(nappt*1.3)
        if is_today: nappt = max(2, nappt//2)
        for k in range(nappt):
            c = random.choice(CUST_BY_BR[b['id']])
            at = dt.datetime.combine(day, dt.time(random.randint(9,17), random.choice([0,30])))
            ap_id = U(f"ap-{b['code']}-{day}-{k}")
            r = random.random()
            status = 'programada' if is_today else ('no_show' if r<0.1 else 'cancelada' if r<0.15 else 'atendida')
            ins('appointments', id=ap_id, company_id=b['company_id'], branch_id=b['id'], customer_id=c['id'], optometrist_id=OPTOS[b['id']]['id'], scheduled_at=at, status=status, source=c['source'], created_at=at-dt.timedelta(days=random.randint(1,6)))
            if status != 'atendida': continue
            kid = 'niño' in c['tags']
            ex_id = U(f"ex-{b['code']}-{day}-{k}")
            rxf = rx(kid)
            ins('exams', id=ex_id, company_id=b['company_id'], branch_id=b['id'], customer_id=c['id'], optometrist_id=OPTOS[b['id']]['id'], appointment_id=ap_id,
                template='nino' if kid else 'adulto', exam_date=day, reason=random.choice(['Revisión anual','Visión borrosa de lejos','Dolor de cabeza','Fatiga visual por pantallas','Renovación de lentes','Control']),
                autorefraction=rx(kid), rx_initial=rx(kid), rx_final=rxf, diagnosis=random.choice(['Miopía','Miopía + astigmatismo','Hipermetropía','Presbicia','Astigmatismo','Emetropía']),
                recommendation=random.choice(['Lentes monofocales con AR','Progresivos','Filtro luz azul','Lentes de contacto','Sin cambio de fórmula']), status='completado',
                created_at=at, next_review_date=None)
            # cotización (75%) -> venta (55% de cotizaciones), algunas ventas directas
            if random.random() < 0.75:
                seller = random.choice(SELLERS[b['id']])
                q_id = U(f"q-{b['code']}-{day}-{k}")
                frame = random.choice(BY_CAT['armazon']); lens = random.choice(BY_CAT['lente'])
                items = [(frame, 1), (lens, 1)]
                if random.random()<0.4: items.append((random.choice(BY_CAT['accesorio']), 1))
                if random.random()<0.15: items.append((random.choice(BY_CAT['solar']), 1))
                disc_pct = random.choice([0,0,0,5,10])
                sub = sum(p['price']*qn for p,qn in items)
                disc = round(sub*disc_pct/100, 2)
                tax = round((sub-disc)*0.07, 2)
                total = round(sub-disc+tax, 2)
                r = random.random()
                q_created = at + dt.timedelta(minutes=45)
                age = (TODAY-day).days
                if is_today or age < 3: qstatus = 'abierta'
                elif r < 0.55: qstatus = 'convertida'
                elif r < 0.70: qstatus = 'seguimiento' if age < 25 else 'perdida'
                elif r < 0.85: qstatus = 'perdida'
                else: qstatus = 'abierta' if age < 20 else 'vencida'
                ins('quotes', id=q_id, company_id=b['company_id'], branch_id=b['id'], customer_id=c['id'], exam_id=ex_id, seller_id=seller['id'], number=number(b['company_id'],'COT'),
                    status=qstatus, subtotal=sub, discount=disc, tax=tax, total=total, valid_until=day+dt.timedelta(days=15),
                    next_followup_at=(q_created+dt.timedelta(days=random.choice([2,3,5,9,14]))) if qstatus in ('abierta','seguimiento') else None,
                    last_contact_at=q_created + dt.timedelta(days=random.randint(0,2)) if qstatus=='seguimiento' else None,
                    lost_reason=random.choice(['Precio','Compró en otra óptica','Sin respuesta']) if qstatus=='perdida' else None, created_at=q_created)
                for p,qn in items:
                    ins('quote_items', quote_id=q_id, product_id=p['id'], description=p['name'], qty=qn, unit_price=p['price'], discount_pct=disc_pct, line_total=round(p['price']*qn*(1-disc_pct/100),2))
                if qstatus == 'convertida':
                    sale_day = day + dt.timedelta(days=random.choice([0,0,1,2,4]))
                    if sale_day > TODAY: sale_day = day
                    make_sale = (b, c, seller, items, disc_pct, sale_day, q_id, ex_id, cs_id if sale_day==day else U(f"cs-{b['code']}-{sale_day}"))
                    sale_ids.append(make_sale)
        # ventas directas (accesorios, solares, lentes de contacto)
        ndirect = random.randint(1,4) if is_main else random.randint(0,2)
        if is_today: ndirect = 1
        for k in range(ndirect):
            c = random.choice(CUST_BY_BR[b['id']])
            seller = random.choice(SELLERS[b['id']])
            cat = random.choice(['solar','lente_contacto','accesorio','accesorio','servicio'])
            items = [(random.choice(BY_CAT[cat]), random.randint(1,2))]
            if random.random()<0.5: items.append((random.choice(BY_CAT['accesorio']), 1))
            sale_ids.append((b, c, seller, items, 0, day, None, None, cs_id))
    day += dt.timedelta(days=1)

# materializar ventas
lab_orders = []
for idx,(b, c, seller, items, disc_pct, sday, q_id, ex_id, cs_id) in enumerate(sale_ids):
    if sday.weekday()==6: sday = sday + dt.timedelta(days=1)
    if sday > TODAY: continue
    cs_id = U(f"cs-{b['code']}-{sday}")
    s_id = U(f'sale-{idx}')
    at = dt.datetime.combine(sday, dt.time(random.randint(10,18), random.randint(0,59)))
    sub = sum(p['price']*qn for p,qn in items); disc = round(sub*disc_pct/100,2)
    tax = round((sub-disc)*0.07,2); total = round(sub-disc+tax,2)
    cost = sum(float(p['cost'])*qn for p,qn in items)
    needs_lab = any(p['category']=='lente' for p,_ in items)
    age = (TODAY-sday).days
    if needs_lab:
        if age > 10: dstat, dat = 'entregado', at + dt.timedelta(days=random.randint(3,9))
        elif age > 5: dstat, dat = random.choice(['listo','entregado']), (at+dt.timedelta(days=random.randint(3,5)) if random.random()<0.5 else None)
        elif age > 2: dstat, dat = 'en_laboratorio', None
        else: dstat, dat = 'pendiente', None
        if dstat != 'entregado': dat = None
        if dstat == 'entregado' and dat is None: dat = at + dt.timedelta(days=4)
    else: dstat, dat = 'entregado', at
    status = 'completada'
    paid = total
    if random.random() < 0.12 and total > 150: status='parcial'; paid = round(total*random.choice([0.5,0.6,0.7]),2)
    ins('sales', id=s_id, company_id=b['company_id'], branch_id=b['id'], customer_id=c['id'], seller_id=seller['id'], optometrist_id=OPTOS[b['id']]['id'] if needs_lab else None,
        quote_id=q_id, exam_id=ex_id, cash_session_id=cs_id, number=number(b['company_id'],'F'), sale_date=at, source=c['source'], subtotal=sub, discount=disc, tax=tax, total=total,
        paid=0, cost_total=round(cost,2), status=status, delivery_status=dstat, delivered_at=dat, commission_amount=round((sub-disc)*seller['commission_pct']/100,2),
        zoho_invoice_id=f'INV-{random.randint(100000,999999)}' if age>1 else None, zoho_sync_status='sincronizado' if age>1 else 'pendiente', created_at=at)
    for p,qn in items:
        ins('sale_items', sale_id=s_id, product_id=p['id'], description=p['name'], category=p['category'], qty=qn, unit_price=p['price'], unit_cost=p['cost'], discount_pct=disc_pct, line_total=round(p['price']*qn*(1-disc_pct/100),2))
        if p['track_stock']:
            ins('stock_movements', product_id=p['id'], branch_id=b['id'], qty=-qn, type='venta', ref_type='sale', ref_id=s_id, staff_id=seller['id'], created_at=at)
    # pagos (múltiples)
    methods = ['efectivo']*4 + ['tarjeta']*5 + ['transferencia','yappy']
    if paid > 200 and random.random()<0.35:
        a1 = round(paid*0.5,2); ins('payments', sale_id=s_id, cash_session_id=cs_id, method=random.choice(methods), amount=a1, created_at=at)
        ins('payments', sale_id=s_id, cash_session_id=cs_id, method=random.choice(methods), amount=round(paid-a1,2), created_at=at+dt.timedelta(minutes=1))
    else:
        ins('payments', sale_id=s_id, cash_session_id=cs_id, method=random.choice(methods), amount=paid, created_at=at)
    if status == 'parcial':
        c['balance'] = round(c.get('balance',0) - (total-paid), 2)
    if needs_lab:
        lo_id = U(f'lo-{idx}')
        lstat = {'entregado':'entregado','listo':'listo','en_laboratorio':random.choice(['enviado','en_proceso','recibido']),'pendiente':'pendiente'}[dstat]
        ins('lab_orders', id=lo_id, company_id=b['company_id'], branch_id=b['id'], sale_id=s_id, customer_id=c['id'], exam_id=ex_id, number=number(b['company_id'],'OL'),
            lab_name=random.choice(['Laboratorio Central Optilux','Essilor Panamá','Hoya Lab']), status=lstat, lens_type=next(p['name'] for p,_ in items if p['category']=='lente'),
            treatment=random.choice(['AR','AR + Blue','Fotocromático','Sin tratamiento']), frame=next((p['name'] for p,_ in items if p['category']=='armazon'), 'Armazón propio'),
            promised_at=sday+dt.timedelta(days=7), sent_at=at+dt.timedelta(days=1) if lstat!='pendiente' else None,
            received_at=(at+dt.timedelta(days=4)) if lstat in ('recibido','listo','entregado') else None, delivered_at=dat, notified_at=(at+dt.timedelta(days=4)) if lstat in ('listo','entregado') else None, created_at=at)
        ins('lab_order_events', lab_order_id=lo_id, status='pendiente', note='Orden creada desde venta', created_at=at)
        if lstat!='pendiente': ins('lab_order_events', lab_order_id=lo_id, status='enviado', note='Enviado al laboratorio', created_at=at+dt.timedelta(days=1))
        if lstat in ('recibido','listo','entregado'): ins('lab_order_events', lab_order_id=lo_id, status='recibido', note='Recibido de laboratorio, control de calidad OK', created_at=at+dt.timedelta(days=4))
        if lstat=='entregado': ins('lab_order_events', lab_order_id=lo_id, status='entregado', note='Entregado al cliente', created_at=dat)
    # RMA ocasional
    if age > 7 and random.random() < 0.04:
        r_id = U(f'rma-{idx}'); rt = random.choice(['devolucion','reparacion','garantia','cambio'])
        rs = random.choice(['abierto','en_revision','resuelto','cerrado','en_reparacion'])
        ins('rmas', id=r_id, company_id=b['company_id'], branch_id=b['id'], sale_id=s_id, customer_id=c['id'], product_id=items[0][0]['id'], number=number(b['company_id'],'RMA'), type=rt, status=rs,
            reason=random.choice(['Bisagra rota','Rayadura en lente','No se adapta a progresivos','Defecto de fábrica','Cambio de color']),
            resolution='Reemplazo sin costo' if rs in ('resuelto','cerrado') else None, refund_amount=round(total*0.3,2) if rt=='devolucion' and rs in ('resuelto','cerrado') else 0,
            created_at=at+dt.timedelta(days=random.randint(3,20)), resolved_at=(at+dt.timedelta(days=random.randint(21,30))) if rs in ('resuelto','cerrado') else None)
        ins('rma_events', rma_id=r_id, status='abierto', note='Reclamo registrado en tienda', created_at=at+dt.timedelta(days=5))

# Cierre de caja: expected/counted/difference (calculado en SQL al final)
# Notas de clientes y vales
for c in random.sample(CUSTOMERS, 60):
    ins('customer_notes', customer_id=c['id'], staff_id=random.choice(STAFF)['id'], kind=random.choice(['nota','llamada','whatsapp']),
        body=random.choice(['Prefiere armazones ligeros','Llamar para recordar recogida','Interesada en lentes de contacto de color','Cliente corporativo — factura a empresa','Pidió cotización de progresivos, volver a contactar']),
        created_at=dt.datetime.combine(TODAY-dt.timedelta(days=random.randint(1,60)), dt.time(11,0)))
for i in range(12):
    c = random.choice(CUSTOMERS)
    amt = random.choice([25,50,100])
    ins('vouchers', company_id=c['company_id'], code=f'VALE-{2026}-{i+1:04d}', kind='vale', amount=amt, balance=amt if i%3 else 0, customer_id=c['id'], status='activo' if i%3 else 'usado', expires_at=TODAY+dt.timedelta(days=90))
for i in range(3):
    ins('vouchers', company_id=U('co-optilux'), code=f'PIN-PROMO-{i+1:02d}', kind='pin_descuento', amount=0, balance=0, discount_pct=[10,15,20][i], status='activo', expires_at=TODAY+dt.timedelta(days=30))

# Actualizar saldos de clientes
cust_balance_updates = [(c['id'], c['balance']) for c in CUSTOMERS if c.get('balance')]

# Intercompany: reglas + docs históricos
ins('intercompany_rules', issuer_company_id=U('co-optilux'), receiver_company_id=U('co-chorrera'), markup_pct=8, auto_on_transfer=True, payment_terms_days=30)
ins('intercompany_rules', issuer_company_id=U('co-optilux'), receiver_company_id=U('co-david'), markup_pct=10, auto_on_transfer=True, payment_terms_days=45)
ins('intercompany_rules', issuer_company_id=U('co-chorrera'), receiver_company_id=U('co-optilux'), markup_pct=0, auto_on_transfer=True, payment_terms_days=30)
for m in range(6):
    d = TODAY.replace(day=1) - dt.timedelta(days=30*m)
    for recv, cnt in ((U('co-chorrera'),2),(U('co-david'),1)):
        for k in range(cnt):
            doc_id = U(f'ic-{m}-{recv}-{k}')
            kind = random.choice(['traspaso','servicio','orden_lab'])
            sub = random.choice([850,1200,1650,2300,3100]) if kind=='traspaso' else random.choice([400,650,900])
            tax = round(sub*0.07,2)
            status = 'pagado' if m >= 2 else random.choice(['emitido','aceptado'])
            ins('intercompany_docs', id=doc_id, number=number(U('co-optilux'),'IC'), issuer_company_id=U('co-optilux'), receiver_company_id=recv, doc_date=d+dt.timedelta(days=random.randint(0,25)), due_date=d+dt.timedelta(days=45),
                concept={'traspaso':'Traspaso de armazones y solares','servicio':'Servicios administrativos y marketing compartido','orden_lab':'Tallado de lentes en laboratorio central'}[kind], origin_type=kind,
                subtotal=sub, tax=tax, total=sub+tax, status=status, ar_status='cobrado' if status=='pagado' else 'pendiente', ap_status='pagado' if status=='pagado' else 'pendiente',
                zoho_invoice_id=f'INV-IC-{random.randint(1000,9999)}' if status!='emitido' else None, zoho_bill_id=f'BILL-{random.randint(1000,9999)}' if status=='pagado' else None,
                zoho_sync_status='sincronizado' if status!='emitido' else 'pendiente', created_by=U('st-admin'), created_at=dt.datetime.combine(d, dt.time(9,0)))
            if kind=='traspaso':
                rem = sub
                for p in random.sample(BY_CAT['armazon'], 3):
                    qn = random.randint(2,6); up = round(p['cost']*1.08,2)
                    ins('intercompany_items', doc_id=doc_id, product_id=p['id'], description=p['name'], qty=qn, unit_price=up, line_total=round(up*qn,2))
            else:
                ins('intercompany_items', doc_id=doc_id, description={'servicio':'Servicios compartidos del mes','orden_lab':'Tallado de lentes (lote)'}[kind], qty=1, unit_price=sub, line_total=sub)

# Traspasos históricos
for i in range(8):
    fb, tb = random.sample(BRANCHES, 2)
    d = TODAY - dt.timedelta(days=random.randint(2,120))
    t_id = U(f'tr-{i}')
    st = 'recibido' if i < 5 else ('enviado' if i < 7 else 'borrador')
    ins('transfers', id=t_id, number=f'TR-{i+1:05d}', from_branch_id=fb['id'], to_branch_id=tb['id'], status=st, requested_by=random.choice(STAFF)['id'], intercompany=fb['company_id']!=tb['company_id'],
        note='Reposición de exhibición', created_at=dt.datetime.combine(d, dt.time(10,0)), sent_at=dt.datetime.combine(d, dt.time(15,0)) if st!='borrador' else None, received_at=dt.datetime.combine(d+dt.timedelta(days=1), dt.time(11,0)) if st=='recibido' else None)
    for p in random.sample(BY_CAT['armazon']+BY_CAT['solar'], 3):
        qn = random.randint(1,3)
        ins('transfer_items', transfer_id=t_id, product_id=p['id'], qty=qn, unit_cost=p['cost'])
        if st != 'borrador':
            ins('stock_movements', product_id=p['id'], branch_id=fb['id'], qty=-qn, type='traspaso_salida', ref_type='transfer', ref_id=t_id, created_at=dt.datetime.combine(d, dt.time(15,0)))
        if st == 'recibido':
            ins('stock_movements', product_id=p['id'], branch_id=tb['id'], qty=qn, type='traspaso_entrada', ref_type='transfer', ref_id=t_id, created_at=dt.datetime.combine(d+dt.timedelta(days=1), dt.time(11,0)))

# Conteo abierto
sc_id = U('sc-1')
ins('stock_counts', id=sc_id, branch_id=U('br-obarrio'), staff_id=STAFF[0]['id'], status='abierto', note='Conteo cíclico armazones', created_at=dt.datetime.combine(TODAY, dt.time(8,30)))

# ---------------- Emitir SQL ----------------
ORDER = ['companies','branches','staff','products','customers','customer_notes','appointments','exams','vouchers','cash_sessions','cash_movements','quotes','quote_items','sales','sale_items','payments','stock_movements','lab_orders','lab_order_events','rmas','rma_events','intercompany_rules','intercompany_docs','intercompany_items','transfers','transfer_items','stock_counts']
out = ['-- Datos semilla Optilux (generado por scripts/gen_seed.py — determinista, seed=42)', 'SET session_replication_role = replica;  -- desactiva triggers de auditoría/cola durante la carga', '']
for t in ORDER:
    if t not in rows: continue
    groups = {}
    for cols, kw in rows[t]: groups.setdefault(cols, []).append(kw)
    for cols, lst in groups.items():
        out.append(f'INSERT INTO public.{t} ({", ".join(cols)}) VALUES')
        vals = [ '(' + ', '.join(q(kw[c]) for c in cols) + ')' for kw in lst ]
        out.append(',\n'.join(vals) + ';')
    out.append('')
out.append('SET session_replication_role = DEFAULT;')
out.append('''
-- Recalcular agregados que normalmente mantienen los triggers
INSERT INTO public.stock (product_id, branch_id, qty)
SELECT product_id, branch_id, SUM(qty) FROM public.stock_movements GROUP BY 1,2
ON CONFLICT (product_id, branch_id) DO UPDATE SET qty = EXCLUDED.qty;
UPDATE public.stock SET qty = 0 WHERE qty < 0;
UPDATE public.sales s SET paid = COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.sale_id = s.id),0);
UPDATE public.customers c SET balance = COALESCE((SELECT -SUM(total - paid) FROM public.sales s WHERE s.customer_id = c.id AND s.status = 'parcial'),0);
UPDATE public.cash_sessions cs SET
  expected_cash = opening_amount
    + COALESCE((SELECT SUM(amount) FROM public.payments p WHERE p.cash_session_id = cs.id AND p.method='efectivo'),0)
    + COALESCE((SELECT SUM(CASE WHEN type='ingreso' THEN amount ELSE -amount END) FROM public.cash_movements m WHERE m.cash_session_id = cs.id),0)
WHERE status = 'cerrada';
-- Arqueo: la mayoría cuadra; ~8% con descuadre
UPDATE public.cash_sessions SET counted_cash = expected_cash + CASE WHEN (abs(hashtext(id::text)) % 100) < 8 THEN ((abs(hashtext(id::text)) % 7) - 3) * 5.00 ELSE 0 END WHERE status='cerrada';
UPDATE public.cash_sessions SET difference = counted_cash - expected_cash WHERE status='cerrada';
UPDATE public.exams SET next_review_date = exam_date + CASE WHEN template='nino' THEN INTERVAL '6 months' ELSE INTERVAL '12 months' END WHERE next_review_date IS NULL;
UPDATE public.exams SET rx_final_transposed = jsonb_build_object('od', public.transpose_eye(rx_final->'od'), 'oi', public.transpose_eye(rx_final->'oi'));
-- Algunas RX antiguas (vencidas) para alimentar alertas
UPDATE public.exams SET exam_date = exam_date - INTERVAL '14 months', next_review_date = exam_date - INTERVAL '2 months'
WHERE customer_id IN (SELECT customer_id FROM public.exams GROUP BY customer_id ORDER BY count(*) LIMIT 18);
-- Numeración fiscal continúa donde quedó
UPDATE public.companies c SET next_invoice_no = COALESCE((SELECT MAX(split_part(number,'-',3)::int) FROM public.sales s WHERE s.company_id = c.id),0)
  + COALESCE((SELECT COUNT(*) FROM public.quotes q WHERE q.company_id=c.id),0) + COALESCE((SELECT COUNT(*) FROM public.lab_orders l WHERE l.company_id=c.id),0) + 100;
-- Cola Zoho: histórico procesado + pendientes de hoy
INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload, status, attempts, processed_at, zoho_id, created_at)
SELECT company_id, 'sale.completed', 'books', id, 'sale:'||id||':books', jsonb_build_object('sale_id', id, 'number', number, 'total', total),
       CASE WHEN zoho_sync_status='sincronizado' THEN 'ok' ELSE 'pendiente' END, CASE WHEN zoho_sync_status='sincronizado' THEN 1 ELSE 0 END,
       CASE WHEN zoho_sync_status='sincronizado' THEN sale_date + interval '2 minutes' END, zoho_invoice_id, sale_date FROM public.sales;
INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload, status, attempts, processed_at, created_at)
SELECT company_id, 'sale.completed', 'inventory', id, 'sale:'||id||':inventory', jsonb_build_object('sale_id', id),
       CASE WHEN zoho_sync_status='sincronizado' THEN 'ok' ELSE 'pendiente' END, CASE WHEN zoho_sync_status='sincronizado' THEN 1 ELSE 0 END,
       CASE WHEN zoho_sync_status='sincronizado' THEN sale_date + interval '2 minutes' END, sale_date FROM public.sales;
INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload, status, attempts, processed_at, created_at)
SELECT company_id, 'customer.created', 'crm', id, 'customer:'||id||':crm', jsonb_build_object('customer_id', id), 'ok', 1, created_at + interval '1 minute', created_at FROM public.customers;
INSERT INTO public.zoho_sync_queue (company_id, event_type, target, entity_id, idempotency_key, payload, status, attempts, processed_at, created_at)
SELECT company_id, 'quote.created', 'crm', id, 'quote:'||id||':crm', jsonb_build_object('quote_id', id, 'total', total), 'ok', 1, created_at + interval '1 minute', created_at FROM public.quotes;
-- Un par de errores con reintento para mostrar el manejo
UPDATE public.zoho_sync_queue SET status='error', attempts=3, last_error='Zoho Books: 429 Too Many Requests (rate limit)', next_retry_at = now() + interval '15 minutes'
WHERE id IN (SELECT id FROM public.zoho_sync_queue WHERE target='books' AND status='pendiente' ORDER BY created_at LIMIT 2);
INSERT INTO public.audit_log (company_id, entity, entity_id, action, actor, data, created_at)
SELECT company_id, 'sales', id::text, 'insert', 'seed', jsonb_build_object('number', number, 'total', total), sale_date FROM public.sales;
''')
with open(os.path.join(OUT, 'up.sql'), 'w', encoding='utf-8') as f: f.write('\n'.join(out))
with open(os.path.join(OUT, 'down.sql'), 'w') as f:
    f.write('TRUNCATE public.' + ', public.'.join(reversed(ORDER)) + ', public.stock, public.zoho_sync_queue, public.audit_log CASCADE;\n')
print('OK', {t: len(v) for t,v in rows.items()})
