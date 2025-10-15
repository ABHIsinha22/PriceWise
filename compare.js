const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser'); // Still needed for reading

// --- Main Function ---
async function main() {
    const output = {
        logs: [],
        results: []
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

        const amazonFile = path.join('amazon_results', `scraped_amazon_${sanitizedProductName}.csv`);
        const flipkartFile = path.join('flipkart_results', `scraped_flipkart_${sanitizedProductName}.csv`);
        
        output.logs.push(' Starting scrapers for Amazon and Flipkart...');
        
        const amazonCommand = `node amazon-scraper.js "${productName}" ${numPages}`;
        const flipkartCommand = `node flipkart-scraper.js "${productName}" ${numPages}`;

        await Promise.all([
            runScript(amazonCommand),
            runScript(flipkartCommand)
        ]);

        output.logs.push('✅ Scrapers finished. Reading result files...');

        const amazonData = await readCsv(amazonFile);
        const flipkartData = await readCsv(flipkartFile);

        output.logs.push(`📊 Found ${amazonData.length} products on Amazon and ${flipkartData.length} products on Flipkart.`);

        let commonProductsFound = 0;
        for (const flipkartProduct of flipkartData) {
            const amazonMatch = findMatchingProduct(flipkartProduct, amazonData);
        
            if (amazonMatch) {
                commonProductsFound++;
        
                const flipkartPrice = parsePrice(flipkartProduct.price);
                const amazonPrice = parsePrice(amazonMatch.price);
        
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
                    amazonLink: amazonMatch.link || '',
                    flipkartLink: flipkartProduct.link || ''
                });
            }
        }
        
        if (commonProductsFound === 0) {
            output.logs.push("\nCouldn't find any common products between the two sites based on their titles.");
        }

        // The saveResultsToCsv function call has been removed from here

    } catch (error) {
        output.logs.push(`❌ An error occurred: ${error.message}`);
    } finally {
        console.log(JSON.stringify(output, null, 2));
    }
}

// --- Helper Functions ---
function runScript(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error(stderr));
            }
            resolve(stdout);
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
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

function parsePrice(priceStr) {
    if (typeof priceStr !== 'string') return NaN;
    const number = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    return isNaN(number) ? NaN : number;
}

function findMatchingProduct(productToMatch, productList) {
    const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'with', 'for', 'of', 'by', 'at', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'if', 'new', 'edition', 'gb', 'ram', 'storage', 'snapdragon', 'ai', 'camera', 'with', 'gen']);
    const keywords = productToMatch.title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(word => word && !stopWords.has(word));
    if (keywords.length === 0) return null;
    let bestMatch = null;
    let highestScore = 0;
    for (const product of productList) {
        const otherTitle = product.title.toLowerCase();
        let matchCount = 0;
        for (const keyword of keywords) {
            if (otherTitle.includes(keyword)) {
                matchCount++;
            }
        }
        const score = matchCount / keywords.length;
        if (score > highestScore) {
            highestScore = score;
            bestMatch = product;
        }
    }
    return highestScore > 0.75 ? bestMatch : null;
}

// --- Run the main function ---
main();