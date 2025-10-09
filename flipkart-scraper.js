const { CheerioCrawler, RequestList, log } = require('crawlee');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');   // Add this line
const path = require('path'); // Add this line

// --- Helper function to save data to CSV ---
async function saveToCsv(data, searchTerm) {
    if (data.length === 0) {
        log.warning("No data was collected to save.");
        return;
    }

    // --- CHANGES START HERE ---

    // 1. Define the output directory
    const outputDir = 'flipkart_results';

    // 2. Ensure the directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // 3. Create the full file path
    const filename = `scraped_flipkart_${searchTerm.replace(/\s+/g, '_')}.csv`;
    const filePath = path.join(outputDir, filename);

    // --- CHANGES END HERE ---

    const csvWriter = createObjectCsvWriter({
        path: filePath, // Use the new full file path
        header: [
            { id: 'title', title: 'TITLE' },
            { id: 'price', title: 'PRICE' },
            { id: 'link', title: 'LINK' },
        ],
        encoding: 'utf8',
    });
    try {
        await csvWriter.writeRecords(data);
        log.info(`✅ Success! Data for ${data.length} products saved to ${filePath}`);
    } catch (error) {
        log.error("Error writing to CSV:", error);
    }
}

// --- Helper functions for findTitle and findPrice (no changes here) ---
function findTitle($) {
    let title = $('h1').first().text().trim();
    if (title) return title;
    title = $('meta[property="og:title"]').attr('content');
    if (title) return title.trim();
    title = $('title').text().trim();
    if (title) return title;
    return null;
}

// --- (MODIFIED) Helper to find price ---
function findPrice($) {
    // 1. (NEW) Try the most current, specific selector for the final price
    let price = $('div.Nx9bqj.CxhGGd').first().text().trim();
    if (price) return price;

    // 2. (OLD) Keep the old specific selector as a fallback
    price = $('div._30jeq3._16Jk6d').first().text().trim();
    if (price) return price;

    // 3. (Reliable) Try meta tags
    price = $('meta[itemprop="price"]').attr('content');
    if (price) return `₹${price.trim()}`;

    // 4. (IMPROVED) Generic search that finds elements with a price but ignores any containing "off"
    let priceElem = $('body').find('*').filter((_, el) => {
        const text = $(el).text();
        // Condition: The text must contain a price format AND must NOT contain the word "off"
        return /\₹[\d,]+/.test(text) && !/off/i.test(text);
    }).first();

    if (priceElem.length) {
        const matched = priceElem.text().match(/\₹[\d,]+/);
        if (matched) return matched[0].trim();
    }

    // 5. (Final Fallback) Check for data-attributes
    price = $('[data-price]').attr('data-price') || $('[price]').attr('price');
    if (price) return price.trim();

    return null;
}

// --- Main Scraper Logic ---
(async () => {
    const args = process.argv.slice(2);
    const productQuery = args[0] || 'mobile';
    
    // --- CHANGE 1: Switched from maxProducts to maxPages ---
    const maxPages = parseInt(args[1], 10) || 3; // Default to 3 pages

    const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(productQuery)}`;
    const requestList = await RequestList.open('flipkart-urls', [searchUrl]);
    
    const allProducts = [];
    
    // --- CHANGE 2: Added a counter for pages instead of products ---
    let pagesCrawled = 0;

    log.info(`Starting crawl for "${productQuery}". Max pages: ${maxPages}`);

    const crawler = new CheerioCrawler({
        requestList,
        maxRequestsPerCrawl: 500, // Increased to handle more products
        maxConcurrency: 5,
        requestHandlerTimeoutSecs: 60,

        async requestHandler({ request, $, enqueueLinks }) {
            const url = request.url;
            log.info(`Crawling: ${url}`);

            // --- CHANGE 3: Rewritten logic for handling search vs. product pages ---

            // A) If it's a SEARCH page (contains '/search')
            if (url.includes('/search')) {
                pagesCrawled++;
                log.info(`Processing search page ${pagesCrawled}/${maxPages}...`);

                // Enqueue all product links found on the current search page
                await enqueueLinks({
                    // This selector is more specific to actual product links
                    selector: 'a[rel="noopener noreferrer"][href*="/p/"]',
                    label: 'product',
                });

                // If we haven't reached our page limit, find and enqueue the NEXT page
                if (pagesCrawled < maxPages) {
                    const currentPageNumber = parseInt(new URL(url).searchParams.get('page'), 10) || 1;
                    const nextUrl = new URL(url);
                    nextUrl.searchParams.set('page', currentPageNumber + 1);
                    
                    log.info(`Enqueuing next search page: ${nextUrl.href}`);
                    await crawler.addRequests([nextUrl.href]);
                }
            }

            // B) If it's a PRODUCT page (labeled 'product')
            if (request.userData.label === 'product') {
                const title = findTitle($);
                const price = findPrice($);

                if (!title || !price) {
                    log.warning(`Missing title or price on ${url}, skipping.`);
                    return;
                }

                allProducts.push({
                    title,
                    price,
                    link: url,
                });
                log.info(`✅ Collected: ${title}`);
                // --- CHANGE 4: Removed the old "productsScraped" counter and crawler.abort() logic ---
            }
        },

        async failedRequestHandler({ request }) {
            log.warning(`❌ Request failed: ${request.url}`);
        },
    });

    await crawler.run();

    log.info('Crawl finished. Saving data to CSV...');
    await saveToCsv(allProducts, productQuery);

})();