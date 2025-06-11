const puppeteer = require('puppeteer');
const fs = require('fs');

// Mapping hash -> nome brand reale (da aggiornare se necessario)
const BRAND_MAPPING = {
    '184a2d28553c2b50231eb421f7213e45': 'Ray-Ban',
    'a430f9e1fecbe419bf26d3d5ab83664c': 'Oakley',
    'bd96463ebd9344c16e97e38ffc5c809a': 'Persol',
    '0739bc198727ccdaa4d67f3a9804b994': 'Oliver Peoples',
    '0313db8d4b5a7e74c62f5296860f0960': 'Vogue',
    '3496e0bc713159e26ff546d1e3cf1fcf': 'Prada',
    '23d64653bd950dc6dfe0163a3af47ced': 'Miu Miu',
    '385a4ed3d373b3b190a1914d120c0ff2': 'Chanel',
    '54bb8edb32fac8ff6d9a4be510dc2b29': 'Versace',
    '2739eddf39a5c605c95e43a5a926e24b': 'Dolce & Gabbana',
    '468dda0e88295faf336d20648aade1c2': 'Emporio Armani',
    'dca6f94c0ea028936a376c5efdc303ee': 'Giorgio Armani',
    '4ad723a7958bf1829940cdaf74eeda72': 'Bulgari',
    '1f27d097ebb95d16095b8b3e2b5871a7': 'Tiffany & Co.',
    'f85b2355911eddb9f3da0bd6fc7a562a': 'Burberry',
    'eddf1fb9e920368b5297d95315dbb74e': 'Coach',
    'e982d880e480f8fe8377760942371974': 'Michael Kors'
};

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
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        console.log('📄 Navigando alla pagina brands...');
        await page.goto('https://www.essilorluxottica.com/en/brands/eyewear/', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        
        console.log('⏳ Attendendo caricamento completo...');
        await page.waitForTimeout(5000);
        
        // Cerca e clicca "View brands"
        try {
            const viewButton = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a, div, span');
                for (let btn of buttons) {
                    const text = btn.textContent.toLowerCase();
                    if (text.includes('view brands') || 
                        text.includes('show brands') ||
                        text.includes('see all') ||
                        text.includes('view all')) {
                        btn.click();
                        return btn.textContent.trim();
                    }
                }
                return false;
            });
            
            if (viewButton) {
                console.log(`🔍 Cliccato "${viewButton}", aspetto caricamento...`);
                await page.waitForTimeout(5000);
            }
        } catch (e) {
            console.log('ℹ️ Nessun bottone "View brands" trovato, procedo...');
        }
        
        console.log('🔍 Estraendo brand data...');
        const brands = await page.evaluate((brandMapping) => {
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
                'figure img',
                '.brand img',
                '.logo img',
                '[data-brand] img'
            ];
            
            const foundImages = new Set();
            const brands = [];
            
            selectors.forEach(selector => {
                try {
                    const imgs = document.querySelectorAll(selector);
                    imgs.forEach(img => {
                        if (foundImages.has(img.src)) return;
                        foundImages.add(img.src);
                        
                        let name = '';
                        let logo = img.src;
                        
                        // Estrai hash dal filename per mapping
                        const urlParts = logo.split('/');
                        const filename = urlParts[urlParts.length - 1];
                        const hash = filename.split('.')[0];
                        
                        // Usa mapping se disponibile
                        if (brandMapping[hash]) {
                            name = brandMapping[hash];
                        } else {
                            // Metodi alternativi per estrarre il nome
                            name = img.alt || 
                                   img.title || 
                                   img.getAttribute('data-brand') || 
                                   img.getAttribute('data-name');
                            
                            // Cerca nel parent element
                            if (!name) {
                                const parent = img.closest('[class*="brand"], [class*="Brand"], .grid-item, figure, div');
                                if (parent) {
                                    const textEl = parent.querySelector('h1, h2, h3, h4, h5, h6, .name, .title, [class*="name"], [class*="title"], span, p');
                                    if (textEl && textEl.textContent.trim()) {
                                        name = textEl.textContent.trim();
                                    }
                                }
                            }
                            
                            // Pulisci il nome se trovato
                            if (name) {
                                name = name
                                    .replace(/logo|brand|®|™|©/gi, '')
                                    .replace(/\s+/g, ' ')
                                    .trim();
                            }
                            
                            // Fallback intelligente dal filename
                            if (!name || name.length < 2) {
                                if (filename && filename.length > 10) {
                                    // Se è un hash, mantieni abbreviato
                                    if (/^[a-f0-9]{32}$/i.test(hash)) {
                                        name = `Brand ${hash.substring(0, 8)}`;
                                    } else {
                                        name = filename
                                            .replace(/[-_]/g, ' ')
                                            .replace(/\b\w/g, l => l.toUpperCase());
                                    }
                                } else {
                                    name = 'Unknown Brand';
                                }
                            }
                        }
                        
                        // URL assoluto
                        if (logo && logo.startsWith('/')) {
                            logo = 'https://www.essilorluxottica.com' + logo;
                        }
                        
                        // Filtra risultati validi
                        if (logo && 
                            !logo.includes('placeholder') && 
                            !logo.includes('default') &&
                            !logo.includes('spacer') &&
                            name && name.length > 1 &&
                            name !== 'Eyecare s' &&  // Filtra elementi non brand
                            name !== 'EssilorLuxottica' &&
                            name !== 'Eyewear' &&
                            name !== 'Direct to consumer') {
                            
                            brands.push({
                                name: name,
                                logo: logo,
                                hash: hash, // Mantieni hash per debug
                                scraped_at: new Date().toISOString()
                            });
                        }
                    });
                } catch (e) {
                    console.log('Errore con selettore:', selector);
                }
            });
            
            // Rimuovi duplicati basati sul nome
            const uniqueBrands = brands.filter((brand, index, self) => 
                index === self.findIndex(b => 
                    b.name.toLowerCase() === brand.name.toLowerCase()
                )
            );
            
            // Ordina alfabeticamente
            uniqueBrands.sort((a, b) => a.name.localeCompare(b.name));
            
            return uniqueBrands;
        }, BRAND_MAPPING);
        
        console.log(`✅ Trovati ${brands.length} brand unici`);
        
        if (brands.length === 0) {
            console.log('⚠️ Nessun brand trovato, creo dati di fallback...');
            
            const fallbackBrands = [
                { name: "Ray-Ban", logo: "https://via.placeholder.com/200x100/000000/ffffff?text=Ray-Ban", hash: "fallback" },
                { name: "Oakley", logo: "https://via.placeholder.com/200x100/ff6600/ffffff?text=Oakley", hash: "fallback" },
                { name: "Persol", logo: "https://via.placeholder.com/200x100/8B4513/ffffff?text=Persol", hash: "fallback" }
            ];
            
            const data = {
                last_updated: new Date().toISOString(),
                source_url: 'https://www.essilorluxottica.com/en/brands/eyewear/',
                total_brands: fallbackBrands.length,
                status: 'fallback',
                message: 'Usati dati di fallback - controllare selettori',
                brands: fallbackBrands
            };
            
            fs.writeFileSync('brands.json', JSON.stringify(data, null, 2));
            console.log('💾 Salvati dati di fallback');
            return;
        }
        
        const data = {
            last_updated: new Date().toISOString(),
            source_url: 'https://www.essilorluxottica.com/en/brands/eyewear/',
            total_brands: brands.length,
            status: 'success',
            brands: brands,
            mapping_info: `Usato mapping per ${Object.keys(BRAND_MAPPING).length} brand`
        };
        
        fs.writeFileSync('brands.json', JSON.stringify(data, null, 2));
        console.log('💾 File brands.json salvato con successo');
        
        console.log('📋 Brand trovati:');
        brands.slice(0, 10).forEach((brand, i) => {
            console.log(`${i + 1}. ${brand.name} ${brand.hash ? `(${brand.hash.substring(0, 8)})` : ''}`);
        });
        
        if (brands.length > 10) {
            console.log(`... e altri ${brands.length - 10} brand`);
        }
        
    } catch (error) {
        console.error('❌ Errore durante scraping:', error.message);
        
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

scrapeBrands().then(() => {
    console.log('🎉 Scraping completato con successo!');
}).catch(error => {
    console.error('💥 Errore fatale:', error);
    process.exit(1);
});
