#!/usr/bin/env python3
"""Recorre todas las pantallas con el usuario demo contra Supabase y reporta errores de consola y peticiones fallidas.
Uso: python3 scripts/smoke_supabase.py [base_url] [carpeta_capturas]"""
import sys, asyncio, os
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
ROUTES = ['/', '/pos', '/caja', '/clientes', '/agenda', '/examenes', '/cotizaciones', '/ordenes', '/cajon', '/stock', '/rma', '/intercompany', '/reportes', '/zoho', '/configuracion']
async def main():
    bad = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await (await b.new_context(viewport={'width': 1440, 'height': 900}, locale='es-PA')).new_page()
        cur = {'r': 'login'}
        page.on('pageerror', lambda e: bad.append((cur['r'], 'js', str(e)[:200])))
        page.on('console', lambda m: m.type == 'error' and bad.append((cur['r'], 'console', m.text[:200])))
        async def resp(r):
            if 'supabase.co' in r.url and r.status >= 400:
                try: body = (await r.text())[:200]
                except Exception: body = ''
                bad.append((cur['r'], r.status, r.url.split('.co')[1][:140] + ' ' + body))
        page.on('response', lambda r: asyncio.ensure_future(resp(r)))
        await page.goto(BASE + '/', wait_until='networkidle')
        await page.fill('input[type=email]', 'demo@optilux.test')
        await page.fill('input[type=password]', 'Optilux2026!')
        await page.click('button:has-text("Entrar")')
        await page.wait_for_selector('text=Dashboard', timeout=20000)
        for r in ROUTES:
            cur['r'] = r
            await page.goto(BASE + r, wait_until='networkidle')
            await page.wait_for_timeout(1200)
            await page.screenshot(path=f"{OUT}/{(r.strip('/') or 'dashboard')}.png")
        # pestañas secundarias
        for r, tab in [('/stock', 'Traspasos'), ('/configuracion', 'Motivos'), ('/configuracion', 'Proveedores'), ('/configuracion', 'Auditoría'), ('/configuracion', 'API'), ('/ordenes', 'Cerradas'), ('/rma', 'Cerrados')]:
            cur['r'] = f'{r}#{tab}'
            await page.goto(BASE + r, wait_until='networkidle')
            loc = page.get_by_role('button', name=tab)
            if await loc.count(): await loc.first.click(); await page.wait_for_timeout(1200)
        # detalle de cliente
        cur['r'] = '/clientes/:id'
        await page.goto(BASE + '/clientes', wait_until='networkidle')
        await page.locator('tbody tr a').first.click(); await page.wait_for_timeout(2000)
        await page.screenshot(path=f'{OUT}/cliente.png')
        await b.close()
    for x in bad: print('✘', *x)
    print(f'{len(bad)} problemas')
asyncio.run(main())
