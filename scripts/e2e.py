#!/usr/bin/env python3
"""E2E: venta completa en POS + seguimiento de cotización + avance de orden de laboratorio."""
import sys, asyncio
from playwright.async_api import async_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'screenshots'

async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await (await b.new_context(viewport={'width': 1440, 'height': 900}, locale='es-PA')).new_page()
        page.on('pageerror', lambda e: errs.append(str(e)))
        # --- POS ---
        await page.goto(BASE + '/pos', wait_until='networkidle')
        await page.fill('input[placeholder^="Cliente"]', 'Gon')
        await page.wait_for_timeout(800)
        await page.locator('.card button').filter(has_text='C0').first.click()
        await page.click('button:has-text("Armazón")')
        await page.locator('button.card').first.click()
        await page.click('button:has-text("Lentes")')
        await page.locator('button.card').first.click()
        await page.click('button:has-text("Accesorios")')
        await page.locator('button.card').first.click()
        await page.screenshot(path=f'{OUT}/e2e_pos_cart.png')
        await page.click('button:has-text("Cobrar")')
        await page.wait_for_timeout(300)
        await page.click('[role=dialog] button:has-text("Efectivo")')
        await page.click('button:has-text("50%")')
        await page.click('button:has-text("Añadir")')
        await page.click('[role=dialog] button:has-text("Tarjeta")')
        await page.click('button:text-is("Todo")')
        await page.click('button:has-text("Añadir")')
        await page.screenshot(path=f'{OUT}/e2e_pos_pay.png')
        await page.click('button:has-text("Confirmar venta")')
        await page.wait_for_selector('text=Venta registrada', timeout=15000)
        num = await page.locator('.text-2xl.font-extrabold').last.inner_text()
        print('Venta creada:', num)
        await page.screenshot(path=f'{OUT}/e2e_pos_done.png')
        # --- Orden de laboratorio generada por la venta ---
        await page.goto(BASE + '/ordenes', wait_until='networkidle')
        await page.wait_for_timeout(800)
        card = page.locator('button.card').filter(has_text='OL-').first
        await card.click()
        await page.click('button:has-text("Avanzar a")')
        await page.wait_for_timeout(800)
        print('Orden avanzada')
        # --- Cotización: seguimiento ---
        await page.goto(BASE + '/cotizaciones', wait_until='networkidle')
        await page.wait_for_timeout(600)
        btn = page.locator('button[title="Registrar contacto"]').first
        if await btn.count():
            await btn.click(); await page.click('button:has-text("Registrar contacto")'); await page.wait_for_timeout(600); print('Seguimiento registrado')
        # --- Caja: movimiento y cierre ---
        await page.goto(BASE + '/caja', wait_until='networkidle')
        await page.wait_for_timeout(600)
        await page.click('button:has-text("Egreso")')
        await page.fill('input[type=number]', '12.5')
        await page.fill('input[placeholder^="Ej."]', 'Mensajería laboratorio')
        await page.click('button:has-text("Registrar")')
        await page.wait_for_timeout(600)
        await page.click('button:has-text("Cerrar y arquear")')
        await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/e2e_caja_close.png')
        await page.click('footer button:has-text("Cerrar caja")')
        await page.wait_for_timeout(1000)
        print('Caja cerrada:', 'Abrir caja' in await page.inner_text('body'))
        await page.click('button:has-text("Abrir caja")')
        await page.click('footer button:has-text("Abrir")')
        await page.wait_for_timeout(800)
        # --- Examen nuevo ---
        await page.goto(BASE + '/examenes/nuevo', wait_until='networkidle')
        await page.fill('input[placeholder="Buscar paciente…"]', 'Mar')
        await page.wait_for_timeout(800)
        await page.locator('.card button').filter(has_text='C0').first.click()
        await page.wait_for_timeout(500)
        await page.fill('input[list="dx"]', 'Miopía')
        await page.click('button:has-text("Guardar examen")')
        await page.wait_for_selector('text=Examen guardado', timeout=10000)
        print('Examen guardado')
        await page.screenshot(path=f'{OUT}/e2e_exam.png')
        # --- Traspaso intercompany: crear + enviar ---
        await page.goto(BASE + '/stock', wait_until='networkidle')
        await page.click('button:has-text("Nuevo traspaso")')
        await page.select_option('[role=dialog] select', index=3)
        await page.fill('input[placeholder^="Buscar por SKU"]', 'Ray')
        await page.wait_for_timeout(400)
        await page.locator('.card button').filter(has_text='ARM').first.click()
        await page.click('button:has-text("Crear borrador")')
        await page.wait_for_timeout(1000)
        await page.locator('button:has-text("Enviar")').first.click()
        await page.wait_for_timeout(1000)
        print('Traspaso:', 'intercompany' in (await page.inner_text('body')).lower())
        await page.screenshot(path=f'{OUT}/e2e_transfer.png')
        await b.close()
    print('\n'.join(errs) if errs else 'E2E OK sin errores JS')
    return 1 if errs else 0

sys.exit(asyncio.run(main()))
