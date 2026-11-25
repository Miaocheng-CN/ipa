from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--allow-file-access-from-files'])
 page=browser.new_page(viewport={'width':1024,'height':768}); errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script("""if(location.protocol==="file:" && !sessionStorage.fixtureStarted){localStorage.clear();sessionStorage.fixtureStarted="1"};window.webkit={messageHandlers:{comics:{postMessage:async m=>{
 const page='<img class="reader-image" src="https://img.example.org/1.png"><img class="reader-image" src="https://img.example.org/2.png"><img class="reader-image" src="https://img.example.org/3.png">';
 const catalog='<div id="comicGrid"><a href="/comic/a"><img alt="测试书"/></a></div>';
 const detail='<h1>测试书</h1><div class="mint-chapter-grid"><a href="/book/b">第二章</a><a href="/book/a">第一章</a></div>';
 return {url:m.url,text:m.url.includes('category')?catalog:m.url.includes('/comic/')?detail:page}
 }}}}""")
 page.goto((root/'App/Comics/index.html').as_uri())
 page.locator('[data-do=detail]').first.click();page.locator('[data-do=chapter]').first.click()
 page.wait_for_selector('.reader-chapter');page.evaluate('showReaderControls(true)');page.locator('[data-do=layout]').click()
 page.locator('input[value=double]').check();page.locator('dialog button').click();page.wait_for_selector('.spread-sheet')
 assert page.locator('.spread-cell').count()==2
 page.locator('button[aria-label=下一页]').click();assert page.locator('.spread-cell').count()==1
 page.locator('button[aria-label=下一页]').click();page.wait_for_function("currentChapter.title==='第二章' && !!spreadView")
 assert page.locator('.spread-cell').count()==2
 page.locator('button[aria-label=上一页]').click();page.wait_for_function("currentChapter.title==='第一章' && !!spreadView")
 assert page.locator('.spread-cell').count()==1
 page.reload();page.locator('[data-do=detail]').first.click();page.locator('[data-do=start]').click()
 page.wait_for_selector('.spread-sheet');assert page.locator('.spread-cell').count()==1
 page.locator('button[aria-label=阅读菜单]').click();page.locator('[data-do=layout]').click();page.locator('input[value=single]').check();page.locator('dialog button').click()
 page.wait_for_function("state.layout==='single' && !!spreadView");assert page.locator('.spread-cell').count()==1
 page.locator('button[aria-label=阅读菜单]').click();page.locator('[data-do=layout]').click();page.locator('input[value=scroll]').check();page.locator('dialog button').click();page.wait_for_selector('.reader-chapter')
 assert not errors, errors
 print('PASS: mobile catalogue -> reader; 2+1 spread; next/previous chapter; relaunch progress; single page; continuous mode');browser.close()
