const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeBrands() {
    console.log('🚀 Avvio scraping EssilorLuxottica brands...');
    
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    });
    
    try {
        const page = await browser.newPage();
        
        // Configurazione pagina
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('📄 Navigando alla pagina brands...');
        await page.goto('https://www.essilorluxottica.com/en/brands/eyewear/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        // Aspetta caricamento completo
        console.log('⏳ Attendendo caricamento completo...');
        await page.waitForTimeout(5000);
        
        // Cerca e clicca "View brands" se presente
        try {
            await page.waitForSelector('button, a, [class*="view"], [class*="show"]', { timeout: 5000 });
            
            const viewButton = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a, div, span');
                for (let btn of buttons) {
                    if (btn.textContent.toLowerCase().includes('view brands') || 
                        btn.textContent.toLowerCase().includes('show brands') ||
                        btn.textContent.toLowerCase().includes('see all')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (viewButton) {
                console.log('🔍 Cliccato "View brands", aspetto caricamento...');
                await page.waitForTimeout(3000);
            }
        } catch (e) {
            console.log('ℹ️ Nessun bottone "View brands" trovato, procedo...');
        }
        
        // Estrai i brand
        console.log('🔍 Estraendo brand data...');
        const brands = await page.evaluate(() => {
            // Selettori multipli per trovare i brand
            const selectors = [
                'img[alt*="brand"]',
                'img[alt*="Brand"]',
                'img[src*="brand"]',
                'img[src*="logo"]',
                '[class*="brand"] img',
                '[class*="Brand"] img',
                '[class*="logo"] img',
                '[class*="grid"] img',
                '[class*="Grid"] img',
                '.grid-item img',
                '[data-brand] img',
                'figure img',
                '.brand img',
                '.logo img'
            ];
            
            const foundImages = new Set();
            const brands = [];
            
            // Prova tutti i selettori
            selectors.forEach(selector => {
                try {
                    const imgs = document.querySelectorAll(selector);
                    imgs.forEach(img => {
                        if (foundImages.has(img.src)) return;
                        foundImages.add(img.src);
                        
                        let name = '';
                        
                        // Estrai nome da varie fonti
                        name = img.alt || 
                               img.title || 
                               img.getAttribute('data-brand') ||
                               img.getAttribute('data-name');
                        
                        // Cerca nel parent element
                        if (!name) {
                            const parent = img.closest('[class*="brand"], [class*="Brand"], .grid-item, figure');
                            if (parent) {
                                const textEl = parent.querySelector('h1, h2, h3, h4, h5, h6, .name, .title, [class*="name"], [class*="title"]');
                                if (textEl) name = textEl.textContent.trim();
                            }
                        }
                        
                        // Pulizia nome
                        if (name) {
                            name = name.replace(/logo|brand|®|™|©/gi, '').trim();
                        }
                        
                        // Fallback dal filename
                        if (!name && img.src) {
                            const filename = img.src.split('/').pop().split('.')[0];
                            if (filename && filename.length > 2) {
                                name = filename.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            }
                        }
                        
                        if (!name) name = 'Brand';
                        
                        // URL assoluto
                        let logo = img.src;
                        if (logo && logo.startsWith('/')) {
                            logo = 'https://www.essilorluxottica.com' + logo;
                        }
                        
                        // Filtra immagini valide
                        if (logo && 
                            !logo.includes('placeholder') && 
                            !logo.includes('default') &&
                            !logo.includes('spacer') &&
                            name.length > 1) {
                            
                            brands.push({
                                name: name,
                                logo: logo,
                                scraped_at: new Date().toISOString()
                            });
                        }
                    });
                } catch (e) {
                    console.log('Errore con selettore:', selector);
                }
            });
            
            // Rimuovi duplicati e filtra
            const uniqueBrands = brands.filter((brand, index, self) => 
                index === self.findIndex(b => 
                    b.name.toLowerCase() === brand.name.toLowerCase() || 
                    b.logo === brand.logo
                )
            );
            
            return uniqueBrands;
        });
        
        console.log(`✅ Trovati ${brands.length} brand unici`);
        
        if (brands.length === 0) {
            console.log('⚠️ Nessun brand trovato, salvo pagina per debug...');
            const content = await page.content();
            fs.writeFileSync('debug-page.html', content);
            throw new Error('Nessun brand trovato - possibile cambio struttura pagina');
        }
        
        // Aggiungi metadati
        const data = {
            last_updated: new Date().toISOString(),
            source_url: 'https://www.essilorluxottica.com/en/brands/eyewear/',
            total_brands: brands.length,
            status: 'success',
            brands: brands.slice(0, 50) // Limita a 50 brand per performance
        };
        
        // Salva JSON
        fs.writeFileSync('brands.json', JSON.stringify(data, null, 2));
        console.log('💾 File brands.json salvato con successo');
        
        // Log primi brand per verifica
        console.log('📋 Primi 5 brand trovati:');
        brands.slice(0, 5).forEach((brand, i) => {
            console.log(`${i + 1}. ${brand.name} - ${brand.logo.substring(0, 50)}...`);
        });
        
    } catch (error) {
        console.error('❌ Errore durante scraping:', error.message);
        
        // Salva un file di errore per debug
        const errorData = {
            last_updated: new Date().toISOString(),
            status: 'error',
            error: error.message,
            total_brands: 0,
            brands: []
        };
        
        fs.writeFileSync('brands.json', JSON.stringify(errorData, null, 2));
        process.exit(1);
    } finally {
        await browser.close();
    }
}

// Esegui lo scraping
scrapeBrands().then(() => {
    console.log('🎉 Scraping completato con successo!');
}).catch(error => {
    console.error('💥 Errore fatale:', error);
    process.exit(1);
});
