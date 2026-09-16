#!/usr/bin/env python3
"""Smoke test + capturas de todas las pantallas. Uso: python3 scripts/screenshots.py [base_url] [out_dir]"""
import sys, os, asyncio
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'screenshots'
os.makedirs(OUT, exist_ok=True)
PAGES = ['/', '/pos', '/caja', '/clientes', '/agenda', '/examenes', '/examenes/nuevo', '/cotizaciones', '/ordenes', '/stock', '/rma', '/intercompany', '/reportes', '/zoho', '/configuracion']

async def main():
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, locale='es-PA')
        page = await ctx.new_page()
        page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error',) else None)
        page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
        for path in PAGES:
            await page.goto(BASE + path, wait_until='networkidle')
            await page.wait_for_timeout(1200)
            name = path.strip('/').replace('/', '_') or 'dashboard'
            await page.screenshot(path=f'{OUT}/{name}.png', full_page=False)
            txt = await page.inner_text('body')
            print(f'{path:22s} ok  {len(txt):6d} chars  {"LOADING" if "Cargando" in txt else ""}')
        # ficha de cliente: primer enlace de la lista
        await page.goto(BASE + '/clientes', wait_until='networkidle')
        link = page.locator('a[href^="/clientes/"]').first
        if await link.count():
            await link.click(); await page.wait_for_load_state('networkidle'); await page.wait_for_timeout(1200)
            await page.screenshot(path=f'{OUT}/cliente_360.png')
            print('/clientes/:id           ok')
        # móvil
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, locale='es-PA')
        mp = await m.new_page()
        await mp.goto(BASE + '/pos', wait_until='networkidle'); await mp.wait_for_timeout(1000)
        await mp.screenshot(path=f'{OUT}/mobile_pos.png')
        await mp.goto(BASE + '/', wait_until='networkidle'); await mp.wait_for_timeout(1000)
        await mp.screenshot(path=f'{OUT}/mobile_dashboard.png')
        await b.close()
    print('\n'.join(errors[:30]) if errors else 'Sin errores de consola')
    return 1 if any('pageerror' in e for e in errors) else 0

sys.exit(asyncio.run(main()))
