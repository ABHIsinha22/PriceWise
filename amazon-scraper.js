const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

puppeteer.use(StealthPlugin());

// Helper function to add a random delay
function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

// Concurrent product scraper
async function scrapeProductsConcurrently(browser, productURLs, concurrency = 5) {
  const scrapedData = [];
  let index = 0;

  async function scrapeWorker() {
    while (index < productURLs.length) {
      const currentIndex = index++;
      const url = productURLs[currentIndex];
      try {
        const productPage = await browser.newPage();
        await productPage.setViewport({ width: 1440, height: 900 });

        const titleSelector = '#productTitle';
        const priceSelector = 'span.a-price-whole';

        await productPage.goto(url, { waitUntil: 'domcontentloaded' });

        const title = await productPage.$eval(titleSelector, el => el.innerText.trim())
          .catch(() => 'N/A');

        let price = await productPage.$eval(priceSelector, el => el.innerText.trim())
          .then(p => `₹${p.replace(/[,.]/g, '')}`)
          .catch(() => 'N/A');

        scrapedData.push({ title, price, link: url });
        console.log(`   -> Scraped: ${title.substring(0, 40)}...`);

        await delay(Math.floor(Math.random() * 1500) + 500); // Small random delay
        await productPage.close();
      } catch (err) {
        console.log(`   -> Failed for ${url.substring(0, 60)}... Error: ${err.message}`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(scrapeWorker());
  await Promise.all(workers);

  return scrapedData;
}

// Main scraper function
async function scrapeAmazon(searchTerm, maxPages) {
  let browser;
  let allScrapedData = [];

  console.log(`Starting the scraper for "${searchTerm}" on Amazon...`);

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--start-maximized']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Step 1: Navigate and search
    console.log('Step 1: Navigating and searching...');
    await page.goto('https://www.amazon.in', { waitUntil: 'domcontentloaded' });
    await delay(Math.random() * 2000 + 1000);

    const searchInputSelector = '#twotabsearchtextbox';
    await page.waitForSelector(searchInputSelector);
    await page.type(searchInputSelector, searchTerm, { delay: 150 });

    const searchButtonSelector = '#nav-search-submit-button';
    await page.hover(searchButtonSelector);
    await page.click(searchButtonSelector);
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

    // Step 2: Loop through pages
    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      console.log(`\nScraping Page ${currentPage} of ${maxPages}...`);

      await page.waitForSelector('[data-component-type="s-search-results"]', { timeout: 20000 });
      await page.evaluate(() => { window.scrollBy(0, window.innerHeight * Math.random()); });
      await delay(1000);

      console.log('Collecting product links...');
      const productURLs = await page.$$eval(
        'div[data-component-type="s-search-result"] h2',
        (headings) => {
          const links = headings.map(h => h.closest('a')?.href);
          return links.filter(href => href && href.includes('/dp/'));
        }
      );
      console.log(`Found ${productURLs.length} product links on this page.`);

      if (productURLs.length > 0) {
        const scrapedData = await scrapeProductsConcurrently(browser, productURLs, 5);
        allScrapedData = allScrapedData.concat(scrapedData);
      }

      // Navigate to next page if exists
      if (currentPage < maxPages) {
        const nextButtonSelector = 'a.s-pagination-item.s-pagination-next';
        const nextButton = await page.$(nextButtonSelector);

        if (nextButton) {
          console.log('\nNavigating to the next page...');
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            nextButton.click()
          ]);
          await delay(Math.random() * 2000 + 1000);
        } else {
          console.log('No "Next" button found. Reached last page.');
          break;
        }
      }
    }

    return allScrapedData;

  } catch (error) {
    console.error("A critical error occurred:", error);
    return allScrapedData;
  } finally {
    if (browser) {
      await browser.close();
      console.log("\nBrowser closed.");
    }
  }
}

// Save data to CSV
async function saveToCsv(data, searchTerm) {
  if (data.length === 0) {
    console.log("No data to save.");
    return;
  }

  const outputDir = 'amazon_results';
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `scraped_amazon_${searchTerm.replace(/\s+/g, '_')}.csv`;
  const filePath = path.join(outputDir, filename);

  const csvWriter = createCsvWriter({
    path: filePath,
    header: [
      { id: 'title', title: 'TITLE' },
      { id: 'price', title: 'PRICE' },
      { id: 'link', title: 'LINK' },
    ],
    encoding: 'utf8',
  });

  try {
    await csvWriter.writeRecords(data);
    console.log(`\nSuccess! Data saved to ${filePath}`);
  } catch (error) {
    console.error("Error writing to CSV:", error);
  }
}

// Main execution
(async () => {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error('Incorrect number of arguments!');
    console.log('Usage: node amazon_scraper.js "<Search Term>" <NumberOfPages>');
    process.exit(1);
  }

  const [SEARCH_TERM, MAX_PAGES_STR] = args;
  const MAX_PAGES = parseInt(MAX_PAGES_STR, 10);

  if (isNaN(MAX_PAGES) || MAX_PAGES < 1) {
    console.error('Error: Number of pages must be a positive number.');
    process.exit(1);
  }

  const scrapedData = await scrapeAmazon(SEARCH_TERM, MAX_PAGES);

  if (scrapedData.length > 0) {
    console.log("\n--- FINAL SCRAPED DATA ---");
    console.table(scrapedData);
    await saveToCsv(scrapedData, SEARCH_TERM);
  } else {
    console.log("\nNo data was scraped. The bot was likely blocked or no products were found.");
  }
})();