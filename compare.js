// Import necessary Node.js modules
const { exec } = require('child_process');
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const { findBestMatch } = require('./matcher.js');

// --- Function to save comparison results to a CSV file ---
async function saveResultsToCsv(results, productName) {
    if (!results || results.length === 0) {
        return;
    }
    const outputDir = 'comparison_results';
    fs.mkdirSync(outputDir, { recursive: true });

    const sanitizedProductName = productName.replace(/\s+/g, '_');
    const filename = `comparison_results_${sanitizedProductName}.csv`;
    const filePath = path.join(outputDir, filename);

    const csvWriter = createCsvWriter({
        path: filePath,
        header: [
            { id: 'title', title: 'TITLE' },
            { id: 'amazonPrice', title: 'AMAZON_PRICE' },
            { id: 'flipkartPrice', title: 'FLIPKART_PRICE' },
            { id: 'winner', title: 'CHEAPER_ON' },
            { id: 'amazonLink', title: 'AMAZON_LINK' },
            { id: 'flipkartLink', title: 'FLIPKART_LINK' },
            { id: 'amazonImage', title: 'AMAZON_IMAGE' },
            { id: 'flipkartImage', title: 'FLIPKART_IMAGE' }
        ],
    });

    try {
        await csvWriter.writeRecords(results);
        console.error(`[INFO] Comparison results saved to ${filePath}`);
    } catch (error) {
        console.error(`[ERROR] Failed to write CSV file: ${error.message}`);
    }
}


// --- Main Function ---
async function main() {
    const output = {
        logs: [],
        results: [],
        scrapedOn: new Date().toISOString()
    };
    let productName = '';

    try {
        const args = process.argv.slice(2);
        if (args.length < 2) {
            throw new Error('Please provide a product name and the number of pages.');
        }

        productName = args[0];
        const numPages = args[1];

        const sanitizedProductName = productName.replace(/\s+/g, '_');
        const amazonFile = path.join(__dirname, 'amazon_results', `scraped_amazon_${sanitizedProductName}.csv`);
        const flipkartFile = path.join(__dirname, 'flipkart_results', `scraped_flipkart_${sanitizedProductName}.csv`);

        output.logs.push('Starting scrapers for Amazon and Flipkart...');

        const amazonScraperPath = path.join(__dirname, 'amazon-scraper.js');
        const flipkartScraperPath = path.join(__dirname, 'flipkart-scraper.js');

        const amazonCommand = `node "${amazonScraperPath}" "${productName}" ${numPages}`;
        const flipkartCommand = `node "${flipkartScraperPath}" "${productName}" ${numPages}`;

        await Promise.all([
            runScript(amazonCommand),
            runScript(flipkartCommand)
        ]);

        output.logs.push(' Scrapers finished. Reading result files...');

        let amazonData = [];
        let flipkartData = [];

        try {
            amazonData = await readCsv(amazonFile);
        } catch (e) {
            output.logs.push(` Warning: Could not read Amazon data. File may be missing.`);
        }

        try {
            flipkartData = await readCsv(flipkartFile);
        } catch (e) {
            output.logs.push(` Warning: Could not read Flipkart data. File may be missing.`);
        }
        
        output.logs.push(`Found ${amazonData.length} products on Amazon and ${flipkartData.length} products on Flipkart.`);

        let commonProductsFound = 0;
        for (const flipkartProduct of flipkartData) {
            const amazonMatch = await findBestMatch(flipkartProduct, amazonData);

            if (amazonMatch) {
                commonProductsFound++;
                const matchedAmazonProduct = amazonMatch.item; 
                const flipkartPrice = parsePrice(flipkartProduct.price);
                const amazonPrice = parsePrice(matchedAmazonProduct.price); 
                
                let winner = 'Same Price';
                if (!isNaN(flipkartPrice) && !isNaN(amazonPrice)) {
                    if (flipkartPrice < amazonPrice) winner = 'Flipkart';
                    else if (amazonPrice < flipkartPrice) winner = 'Amazon';
                }

                output.results.push({
                    title: flipkartProduct.title,
                    flipkartPrice: flipkartPrice,
                    amazonPrice: amazonPrice,
                    winner: winner,
                    flipkartLink: flipkartProduct.link,
                    amazonLink: matchedAmazonProduct.link,
                    flipkartImage: flipkartProduct.image,
                    amazonImage: matchedAmazonProduct.image 
                });
            }
        }

        if (commonProductsFound === 0) {
            output.logs.push("\nCouldn't find any common products between the two sites based on their titles.");
        }
        await saveResultsToCsv(output.results, productName);

    } catch (error) {
        output.logs.push(` An error occurred: ${error.message}`);
    } finally {

        console.log(JSON.stringify(output));
    }
}




function runScript(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 1024 * 5000 }, (error, stdout, stderr) => {
            // Log all output from the child script to stderr
            if (stdout) console.error(`[Scraper STDOUT]: ${stdout}`);
            if (stderr) console.error(`[Scraper STDERR]: ${stderr}`);

            if (error) {
                return reject(new Error(`Scraper failed: ${error.message}`));
            }
            
            // Resolve with no value. We just needed it to finish.
            resolve();
        });
    });
}


function readCsv(filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            return reject(new Error(`File not found at ${filePath}. One of the scrapers might have failed.`));
        }
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv({ mapHeaders: ({ header }) => header.toLowerCase() }))
            .on('data', (data) => {
                results.push({
                    title: data.title || '',
                    price: data.price || '',
                    link: data.link || '',
                    image: data.image || ''
                });
            })
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

function parsePrice(priceStr) {
    if (typeof priceStr !== 'string') return NaN;
    const number = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    return isNaN(number) ? NaN : number;
}

main();