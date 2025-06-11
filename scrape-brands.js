const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

async function ensureChrome() {
    console.log('🔍 Verificando installazione Chrome...');
    
    try {
        const localChromePath = path.join(__dirname, '.chrome');
        
        if (fs.existsSync(localChromePath)) {
            console.log('✅ Chrome locale trovato');
            return;
        }
        
        console.log('📥 Scaricando Chrome localmente...');
        process.env.PUPPETEER_CACHE_DIR = localChromePath;
        
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
    
    await ensureChrome();
    
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: (() => {
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
                // Fallback
            }
            
            if (fs.existsSync('/usr/bin/google-chrome-stable')) {
                console.log('🎯 Usando Chrome di sistema');
                return '/usr/bin/google-chrome-stable';
            }
            
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
            '--disable-extensions'
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
                for (let i = 0; i < buttons.length; i++) {
                    const btn = buttons[i];
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
            // Funzione helper per trovare container
            function findBrandContainer() {
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
                
                // Trova il container che contiene più immagini di brand
                for (let s = 0; s < possibleContainers.length; s++) {
                    const selector = possibleContainers[s];
                    const containers = document.querySelectorAll(selector);
                    for (let c = 0; c < containers.length; c++) {
                        const container = containers[c];
                        const images = container.querySelectorAll('img');
                        if (images.length >= 5) {
                            return container;
                        }
                    }
                }
                
                // Fallback: trova il comune antenato delle immagini brand
                const allImages = document.querySelectorAll('img');
                const brandImages = [];
                for (let i = 0; i < allImages.length; i++) {
                    const img = allImages[i];
                    if (img.src.includes('brand') || 
                        img.src.includes('logo') ||
                        img.alt.toLowerCase().includes('brand') ||
                        img.src.includes('essilorluxottica.com')) {
                        brandImages.push(img);
                    }
                }
                
                if (brandImages.length > 0) {
                    let commonParent = brandImages[0].parentElement;
                    while (commonParent && commonParent !== document.body) {
                        let containsAll = true;
                        for (let i = 0; i < brandImages.length; i++) {
                            if (!commonParent.contains(brandImages[i])) {
                                containsAll = false;
                                break;
                            }
                        }
                        if (containsAll) {
                            return commonParent;
                        }
                        commonParent = commonParent.parentElement;
                    }
                }
                
                return null;
            }
            
            // Funzione per estrarre CSS
            function extractCSS(container) {
                let extractedCSS = '';
                const usedClasses = [];
                
                // Raccogli tutte le classi usate
                const allElements = container.querySelectorAll('*');
                for (let i = 0; i < allElements.length; i++) {
                    const el = allElements[i];
                    if (el.className && typeof el.className === 'string') {
                        const classes = el.className.split(' ');
                        for (let j = 0; j < classes.length; j++) {
                            const cls = classes[j].trim();
                            if (cls && usedClasses.indexOf(cls) === -1) {
                                usedClasses.push(cls);
                            }
                        }
                    }
                }
                
                // Estrai CSS per le classi usate
                const allStyleSheets = document.styleSheets;
                for (let s = 0; s < allStyleSheets.length; s++) {
                    try {
                        const sheet = allStyleSheets[s];
                        const rules = sheet.cssRules || sheet.rules;
                        if (rules) {
                            for (let r = 0; r < rules.length; r++) {
                                const rule = rules[r];
                                if (rule.type === 1) { // STYLE_RULE
                                    const selector = rule.selectorText;
                                    if (selector) {
                                        let shouldInclude = false;
                                        
                                        // Controlla se contiene classi usate
                                        for (let c = 0; c < usedClasses.length; c++) {
                                            if (selector.includes('.' + usedClasses[c])) {
                                                shouldInclude = true;
                                                break;
                                            }
                                        }
                                        
                                        // O selettori generici
                                        if (!shouldInclude && (
                                            selector.includes('img') ||
                                            selector.includes('grid') ||
                                            selector.includes('brand') ||
                                            selector.includes('Brand')
                                        )) {
                                            shouldInclude = true;
                                        }
                                        
                                        if (shouldInclude) {
                                            extractedCSS += rule.cssText + '\n';
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Ignora errori CORS
                    }
                }
                
                return {
                    css: extractedCSS,
                    usedClasses: usedClasses
                };
            }
            
            // Esecuzione principale
            const brandContainer = findBrandContainer();
            
            if (!brandContainer) {
                return {
                    html: '',
                    css: '',
                    usedClasses: [],
                    imageCount: 0,
                    pageTitle: document.title,
                    pageURL: window.location.href,
                    timestamp: new Date().toISOString()
                };
            }
            
            const brandHTML = brandContainer.outerHTML;
            const cssData = extractCSS(brandContainer);
            const imageCount = brandContainer.querySelectorAll('img').length;
            
            console.log('✅ Container brand trovato e copiato');
            console.log('📏 Dimensione HTML: ' + brandHTML.length + ' caratteri');
            console.log('🎨 Dimensione CSS: ' + cssData.css.length + ' caratteri');
            console.log('🖼️ Immagini trovate: ' + imageCount);
            
            return {
                html: brandHTML,
                css: cssData.css,
                usedClasses: cssData.usedClasses,
                imageCount: imageCount,
                pageTitle: document.title,
                pageURL: window.location.href,
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
