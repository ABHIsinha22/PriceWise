const { CheerioCrawler, RequestList, log } = require('crawlee');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

// --- Helper function to save data to CSV ---
async function saveToCsv(data, searchTerm) {
    if (data.length === 0) {
        log.warning("No data was collected to save.");
        return;
    }

    const outputDir = 'flipkart_results';
    fs.mkdirSync(outputDir, { recursive: true });

    const filename = `scraped_flipkart_${searchTerm.replace(/\s+/g, '_')}.csv`;
    const filePath = path.join(outputDir, filename);

    const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: [
            { id: 'title', title: 'TITLE' },
            { id: 'price', title: 'PRICE' },
            { id: 'image', title: 'IMAGE' },
            { id: 'link', title: 'LINK' },
        ],
        encoding: 'utf8',
    });

    try {
        await csvWriter.writeRecords(data);
        log.info(`Success! Data for ${data.length} products saved to ${filePath}`);
    } catch (error) {
        log.error("Error writing to CSV:", error);
    }
}

// --- Helper to find title ---
function findTitle($) {
    let title = $('h1').first().text().trim();
    if (title) return title;
    title = $('meta[property="og:title"]').attr('content');
    if (title) return title.trim();
    title = $('title').text().trim();
    if (title) return title;
    return null;
}

// --- Helper to find price ---
function findPrice($) {
    let price = $('div.Nx9bqj.CxhGGd').first().text().trim();
    if (price) return price;

    price = $('div._30jeq3._16Jk6d').first().text().trim();
    if (price) return price;

    price = $('meta[itemprop="price"]').attr('content');
    if (price) return `₹${price.trim()}`;

    let priceElem = $('body').find('*').filter((_, el) => {
        const text = $(el).text();
        return /\₹[\d,]+/.test(text) && !/off/i.test(text);
    }).first();

    if (priceElem.length) {
        const matched = priceElem.text().match(/\₹[\d,]+/);
        if (matched) return matched[0].trim();
    }

    price = $('[data-price]').attr('data-price') || $('[price]').attr('price');
    if (price) return price.trim();

    return null;
}

// --- 🆕 Helper to find product image URL ---
function findImage($) {
    // Most common product image selectors on Flipkart
    let image =
        $('img.q6DClP').attr('src') ||
        $('img._396cs4').attr('src') ||
        $('img[loading="eager"]').attr('src') ||
        $('meta[property="og:image"]').attr('content') ||
        $('img[alt][srcset]').attr('src') ||
        $('img[src*="rukminim"]').attr('src') || // Rukmini CDN images
        null;

    if (image && image.startsWith('//')) {
        image = 'https:' + image; // Handle protocol-relative URLs
    }
    return image ? image.trim() : null;
}

// --- Main Scraper Logic ---
(async () => {
    const args = process.argv.slice(2);
    const productQuery = args[0] || 'mobile';
    const maxPages = parseInt(args[1], 10) || 3;

    const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(productQuery)}`;
    const requestList = await RequestList.open('flipkart-urls', [searchUrl]);

    const allProducts = [];
    let pagesCrawled = 0;

    log.info(`Starting crawl for "${productQuery}". Max pages: ${maxPages}`);

    const crawler = new CheerioCrawler({
        requestList,
        maxRequestsPerCrawl: 500,
        maxConcurrency: 5,
        requestHandlerTimeoutSecs: 60,

        async requestHandler({ request, $, enqueueLinks, crawler }) {
            const url = request.url;
            log.info(`Crawling: ${url}`);

            // --- A) Handle search result pages ---
            if (url.includes('/search')) {
                pagesCrawled++;
                log.info(`Processing search page ${pagesCrawled}/${maxPages}...`);

                await enqueueLinks({
                    selector: 'a[rel="noopener noreferrer"][href*="/p/"]',
                    label: 'product',
                });

                if (pagesCrawled < maxPages) {
                    const currentPageNumber = parseInt(new URL(url).searchParams.get('page'), 10) || 1;
                    const nextUrl = new URL(url);
                    nextUrl.searchParams.set('page', currentPageNumber + 1);

                    log.info(`Enqueuing next search page: ${nextUrl.href}`);
                    await crawler.addRequests([nextUrl.href]);
                }
            }

            // --- B) Handle product detail pages ---
            if (request.userData.label === 'product') {
                const title = findTitle($);
                const price = findPrice($);
                const image = findImage($);

                if (!title || !price) {
                    log.warning(`Missing title or price on ${url}, skipping.`);
                    return;
                }

                allProducts.push({
                    title,
                    price,
                    image: image || 'N/A',
                    link: url,
                });
                log.info(` Collected: ${title}`);
            }
        },

        async failedRequestHandler({ request }) {
            log.warning(` Request failed: ${request.url}`);
        },
    });

    await crawler.run();

    log.info('Crawl finished. Saving data to CSV...');
    await saveToCsv(allProducts, productQuery);
})();