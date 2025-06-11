const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

async function ensureChrome() {
    console.log('🔍 Verificando installazione Chrome...');
    
    try {
        // Prova a trovare Chrome nella directory del progetto
        const localChromePath = path.join(__dirname, '.chrome');
        
        if (fs.existsSync(localChromePath)) {
            console.log('✅ Chrome locale trovato');
            return;
        }
        
        // Prova a scaricare Chrome localmente
        console.log('📥 Scaricando Chrome localmente...');
        process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.chrome');
        
        execSync('npx puppeteer browsers install chrome', { 
            stdio: 'inherit',
            env: { ...process.env, PUPPETEER_CACHE_DIR: localChromePath }
        });
        
        console.log('✅ Chrome scaricato nella directory locale');
        
    } catch (error) {
        console.log('⚠️ Errore download Chrome locale, uso Chrome di sistema');
    }
}

async function scrapeBrands() {
    console.log('🚀 Avvio copia esatta della tabella brand EssilorLuxottica...');
    
    // Assicurati che Chrome sia disponibile
    await ensureChrome();
    
    const browser = await puppeteer.launch({
        headless: true,
        // Prova Chrome locale, poi sistema, poi lascia decidere a Puppeteer
        executablePath: (() => {
            const localChrome = path.join(__dirname, '.chrome', 'chrome', 'linux-*', 'chrome-linux64', 'chrome');
            const systemChrome = '/usr/bin/google-chrome-stable';
            
            // Cerca Chrome locale con glob pattern
            try {
                const chromeDirs = fs.readdirSync(path.join(__dirname, '.chrome', 'chrome')).filter(d => d.startsWith('linux-'));
                if (chromeDirs.length > 0) {
                    const chromePath = path.join(__dirname, '.chrome', 'chrome', chromeDirs[0], 'chrome-linux64', 'chrome');
                    if (fs.existsSync(chromePath)) {
                        console.log('🎯 Usando Chrome locale:', chromePath);
                        return chromePath;
                    }
                }
            } catch (e) {
                // Ignora errore se directory non esiste
            }
            
            // Prova Chrome di sistema
            if (fs.existsSync(systemChrome)) {
                console.log('🎯 Usando Chrome di sistema:', systemChrome);
                return systemChrome;
            }
            
            // Lascia decidere a Puppeteer (default)
            console.log('🎯 Usando Chrome default di Puppeteer');
            return undefined;
        })(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection'
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('📄 Navigando alla pagina brands...');
        await page.goto('https://www.essilorluxottica.com/en/brands/eyewear/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        console.log('⏳ Attendendo caricamento completo...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Cerca e clicca "View brands" se presente
        try {
            const viewButtonClicked = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a, div, span, [role="button"]');
                for (let btn of buttons) {
                    const text = btn.textContent.toLowerCase();
                    if (text.includes('view brands') || 
                        text.includes('show brands') ||
                        text.includes('see all') ||
                        text.includes('view all') ||
                        text.includes('show all')) {
                        btn.click();
                        return btn.textContent.trim();
                    }
                }
                return false;
            });
            
            if (viewButtonClicked) {
                console.log('🔍 Cliccato "' + viewButtonClicked + '", aspetto caricamento...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (e) {
            console.log('ℹ️ Nessun bottone "View brands" trovato, procedo...');
        }
        
        console.log('📋 Copiando HTML esatto della sezione brand...');
        
        // Estrai l'HTML completo della sezione brand
        const brandData = await page.evaluate(() => {
            // Cerca il container principale dei brand
            const possibleContainers = [
                '[class*="brand"]',
                '[class*="Brand"]',
                '[class*="grid"]',
                '[class*="Grid"]',
                '[class*="container"]',
                '.brands-section',
                '.brand-grid',
                '.logo-grid',
                'main section',
                '[data-component*="brand"]'
            ];
            
            let brandContainer = null;
            let brandHTML = '';
            let brandCSS = '';
            
            // Trova il container che contiene più immagini di brand
            for (const selector of possibleContainers) {
                const containers = document.querySelectorAll(selector);
                for (const container of containers) {
                    const images = container.querySelectorAll('img');
                    if (images.length >= 5) { // Container con almeno 5 immagini
                        brandContainer = container;
                        break;
                    }
                }
                if (brandContainer) break;
            }
            
            // Se non trova un container specifico, prendi tutto quello che contiene brand
            if (!brandContainer) {
                // Cerca tutti gli elementi che contengono immagini di brand
                const allImages = document.querySelectorAll('img');
                const brandImages = Array.from(allImages).filter(img => 
                    img.src.includes('brand') || 
                    img.src.includes('logo') ||
                    img.alt.toLowerCase().includes('brand') ||
                    img.src.includes('essilorluxottica.com')
                );
                
                if (brandImages.length > 0) {
                    // Trova il comune antenato di tutte le immagini brand
                    let commonParent = brandImages[0].parentElement;
                    while (commonParent && commonParent !== document.body) {
                        const containsAll = brandImages.every(img => commonParent.contains(img));
                        if (containsAll) {
                            brandContainer = commonParent;
                            break;
                        }
                        commonParent = commonParent.parentElement;
                    }
                }
            }
            
            if (brandContainer) {
                // Estrai HTML completo
                brandHTML = brandContainer.outerHTML;
                
                // Estrai tutti gli stili CSS associati
                const allStyleSheets = Array.from(document.styleSheets);
                let extractedCSS = '';
                
                // Ottieni tutte le classi usate nel container brand
                const usedClasses = new Set();
                const allElements = brandContainer.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.className && typeof el.className === 'string') {
                        el.className.split(' ').forEach(cls => {
                            if (cls.trim()) usedClasses.add(cls.trim());
                        });
                    }
                });
                
                // Estrai CSS per le classi usate
                allStyleSheets.forEach(sheet => {
                    try {
                        const rules = sheet.cssRules || sheet.rules;
                        if (rules) {
                            for (let rule of rules) {
                                if (rule.type === CSSRule.STYLE_RULE) {
                                    const selector = rule.selectorText;
                                    // Include la regola se contiene classi usate o selettori generici
                                    if (selector && (
                                        Array.from(usedClasses).some(cls => selector.includes('.' + cls)) ||
                                        selector.includes('img') ||
                                        selector.includes('grid') ||
                                        selector.includes('brand') ||
                                        selector.includes('Brand')
                                    )) {
                                        extractedCSS += rule.cssText + '\n';
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Ignora errori CORS per fogli di stile esterni
                    }
                });
                
                brandCSS = extractedCSS;
                
                console.log('✅ Container brand trovato e copiato');
                console.log('📏 Dimensione HTML: ' + brandHTML.length + ' caratteri');
                console.log('🎨 Dimensione CSS: ' + brandCSS.length + ' caratteri');
                console.log('🏷️ Classi usate: ' + Array.from(usedClasses).join(', '));
                
                // Conta le immagini
                const imageCount = brandContainer.querySelectorAll('img').length;
                console.log('🖼️ Immagini trovate: ' + imageCount);
                
            } else {
                console.log('❌ Nessun container brand trovato');
            }
            
            // Informazioni aggiuntive per debug
            const pageTitle = document.title;
            const pageURL = window.location.href;
            
            return {
                html: brandHTML,
                css: brandCSS,
                usedClasses: Array.from(usedClasses),
                imageCount: brandContainer ? brandContainer.querySelectorAll('img').length : 0,
                pageTitle: pageTitle,
                pageURL: pageURL,
                timestamp: new Date().toISOString()
            };
        });
        
        if (!brandData.html) {
            throw new Error('Impossibile trovare la sezione brand sulla pagina');
        }
        
        // Crea HTML completo stand-alone
        const completeHTML = '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>EssilorLuxottica Brands - Auto Sync</title>\n    <style>\n        /* Reset CSS base */\n        * {\n            box-sizing: border-box;\n        }\n        \n        body {\n            margin: 0;\n            padding: 20px;\n            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n            background-color: #ffffff;\n        }\n        \n        /* CSS estratto dalla pagina originale */\n        ' + brandData.css + '\n        \n        /* CSS aggiuntivo per assicurare buona visualizzazione */\n        .brand-container {\n            max-width: 1200px;\n            margin: 0 auto;\n        }\n        \n        img {\n            max-width: 100%;\n            height: auto;\n        }\n        \n        /* Stili di fallback per griglia */\n        [class*="grid"], [class*="Grid"] {\n            display: grid;\n            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\n            gap: 20px;\n        }\n        \n        [class*="brand"], [class*="Brand"] {\n            text-align: center;\n            padding: 15px;\n        }\n    </style>\n</head>\n<body>\n    <div class="brand-container">\n        <!-- HTML copiato esattamente dalla pagina EssilorLuxottica -->\n        ' + brandData.html + '\n    </div>\n    \n    <!-- Metadati per debug -->\n    <div style="margin-top: 50px; padding: 20px; background: #f5f5f5; border-radius: 8px; font-size: 12px; color: #666;">\n        <strong>📊 Informazioni Sync:</strong><br>\n        <strong>Ultimo aggiornamento:</strong> ' + brandData.timestamp + '<br>\n        <strong>Fonte:</strong> ' + brandData.pageURL + '<br>\n        <strong>Immagini trovate:</strong> ' + brandData.imageCount + '<br>\n        <strong>Classi CSS usate:</strong> ' + brandData.usedClasses.join(', ') + '<br>\n        <strong>Sync automatico:</strong> Ogni giorno alle 6:00 AM UTC via GitHub Actions\n    </div>\n</body>\n</html>';
        
        // Salva i file
        const outputData = {
            last_updated: brandData.timestamp,
            source_url: brandData.pageURL,
            page_title: brandData.pageTitle,
            image_count: brandData.imageCount,
            used_classes: brandData.usedClasses,
            status: 'success',
            html_size: brandData.html.length,
            css_size: brandData.css.length,
            complete_html: completeHTML,
            raw_html: brandData.html,
            raw_css: brandData.css
        };
        
        // Salva JSON con tutti i dati
        fs.writeFileSync('brands.json', JSON.stringify(outputData, null, 2));
        
        // Salva anche HTML stand-alone
        fs.writeFileSync('brands.html', completeHTML);
        
        console.log('💾 File salvati:');
        console.log('  - brands.json (dati completi)');
        console.log('  - brands.html (pagina stand-alone)');
        console.log('✅ Copiata esattamente la sezione brand con ' + brandData.imageCount + ' immagini');
        
    } catch (error) {
        console.error('❌ Errore durante la copia:', error.message);
        
        const errorHTML = '<!DOCTYPE html>\n<html><head><title>Errore Sync</title></head>\n<body><h1>Errore nel sync automatico</h1>\n<p>Errore: ' + error.message + '</p>\n<p>Ultimo tentativo: ' + new Date().toLocaleString() + '</p></body></html>';
        
        const errorData = {
            last_updated: new Date().toISOString(),
            status: 'error',
            error: error.message,
            complete_html: errorHTML,
            raw_html: '',
            raw_css: ''
        };
        
        fs.writeFileSync('brands.json', JSON.stringify(errorData, null, 2));
        fs.writeFileSync('brands.html', errorHTML);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapeBrands().then(() => {
    console.log('🎉 Copia esatta completata con successo!');
}).catch(error => {
    console.error('💥 Errore fatale:', error);
    process.exit(1);
});
