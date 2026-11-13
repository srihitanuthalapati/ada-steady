import asyncio, os
from playwright.async_api import async_playwright
TD='/home/claude/ada-react/test-data/'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1280,'height':720},accept_downloads=True); pg=await ctx.new_page()
        errs=[]; pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e))); pg.on('console',lambda m:m.type in('error','warning') and errs.append(m.type+' '+m.text))
        await pg.goto('file:///home/claude/ada-react/dist.html'); await pg.wait_for_timeout(600)
        hero=lambda: pg.inner_text('.hero .big')
        print('pay hero',await hero())
        # hover a bar
        box=await pg.locator('.chart').first.bounding_box(); await pg.mouse.move(box['x']+box['width']*0.5,box['y']+box['height']*0.5); await pg.wait_for_timeout(100)
        print('hover inspector:',await pg.inner_text('.stack .card .ch h2'))
        await pg.screenshot(path='e_pay.png',full_page=True)
        await pg.mouse.move(5,5)
        for k,t in enumerate(['late','funding','forecast','lender']):
            await pg.keyboard.press(str(k+2)); await pg.wait_for_timeout(200); print(t,'hero',await hero()); await pg.screenshot(path=f'e_{t}.png',full_page=True)
        # curve drag
        await pg.keyboard.press('4'); await pg.wait_for_timeout(100)
        cb=await pg.locator('.chart').nth(1).bounding_box(); await pg.mouse.move(cb['x']+cb['width']*0.4,cb['y']+cb['height']*0.5); await pg.mouse.down(); await pg.mouse.move(cb['x']+cb['width']*0.7,cb['y']+cb['height']*0.5,steps=5); await pg.mouse.up()
        print('after drag slider:',await pg.inner_text('.field .fr b'))
        # late tab interactions
        await pg.keyboard.press('2'); await pg.click('text=Slowest client +60d'); print('late hero after +60',await hero())
        await pg.keyboard.press('3'); await pg.click('.toggle span'); print('bridge hero',await hero())
        # export
        async with pg.expect_download() as d: await pg.click('text=Export insights')
        dl=await d.value; await dl.save_as('/home/claude/ada-react/out_insights.xlsx'); print('export ok',dl.suggested_filename)
        # imports
        for f in sorted(os.listdir(TD)):
            await pg.click('text=Import invoices'); await pg.set_input_files('input[type=file]',TD+f); await pg.wait_for_timeout(400)
            err=await pg.locator('.err').count()
            if err: print(f,'→ ERR',await pg.inner_text('.err')); await pg.keyboard.press('Escape')
            else: print(f,'→',await pg.inner_text('.dsbtn small'),'| score hero on lender:',end=' '); await pg.keyboard.press('5'); print(await hero())
            await pg.wait_for_timeout(100)
        # template download
        await pg.click('text=Import invoices')
        async with pg.expect_download() as d: await pg.click('text=Download template')
        print('template',(await d.value).suggested_filename)
        # builtin datasets
        for name in ['Harbor Advisory','Northgate Creative','Maya Okafor Studio']:
            if not await pg.locator('.modal').count(): await pg.click('text=Import invoices')
            await pg.click(f'.dsitem:has-text("{name}")'); await pg.wait_for_timeout(300); print(name,'score',await hero())
        # presenter
        await pg.click('.mbtn.hot'); 
        for k in range(4):
            await pg.wait_for_timeout(250); print('step',k+1,await pg.inner_text('.stepbtn.on'),'|',await hero()); 
            if k==1: await pg.screenshot(path='e_present2.png')
            await pg.keyboard.press('ArrowRight')
        await pg.keyboard.press('Escape')
        await pg.click('text=Send to lender (demo)'); print('sent:',await pg.locator('text=Demo only').count())
        # play
        await pg.keyboard.press('1'); await pg.click('.iconbtn'); await pg.wait_for_timeout(6500); print('after play label',await pg.inner_text('.transport .w'))
        # mobile
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(200); await pg.screenshot(path='e_mobile.png',full_page=False)
        print('ERRORS:',errs); await b.close()
asyncio.run(main())
