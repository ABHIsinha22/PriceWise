// comparison-block/ matcher.js




// --- 1. THE MATCHER SWITCH ---
/**
 * Controls which semantic matching engine to use.
 * 'api'   - Uses the Hugging Face API (requires HF_API_TOKEN).
 * 'local' - Uses the on-device model via @xenova/transformers.
 */
const MATCHER_MODE = 'local'; // ('api' or 'local')
// -----------------------------


// --- 2. Imports & Cache ---

// Import both implementations

const { checkWithLocalModel } = require('./matcher-own.js');

// This cache will store results from *either* the API or the local model.
const semanticCache = new Map();


/**
 * Dispatches to the correct semantic checker based on MATCHER_MODE.
 * This is the only function that 'matchProducts' needs to call.
 */
function checkSemanticSimilarity(titleA, titleB, config) {
    if (MATCHER_MODE === 'local') {
        // Use the locally-run model
        return checkWithLocalModel(titleA, titleB, config);
    }
    // Default to using the API
    return checkWithSemanticAPI(titleA, titleB, config);
}


// --- 3. Constants (Unchanged) ---

const COMMON_BRANDS = new Set([
    // Tech
    'apple', 'samsung', 'google', 'oneplus', 'xiaomi', 'redmi', 'oppo', 'vivo',
    'realme', 'motorola', 'nokia', 'sony', 'lg', 'asus', 'poco', 'boat',
    'jbl', 'sennheiser', 'bose', 'hp', 'dell', 'lenovo', 'acer', 'msi',
    'noise', 'fire-boltt', 'amazfit', 'garmin', 'fitbit', 'spigen', 'anker',
    'logitech', 'razer', 'corsair', 'whirlpool', 'panasonic', 'toshiba',
    'intel', 'amd', 'nvidia', 'gopro', 'dji', 'canon', 'nikon',
    // Cosmetics & General
    'l\'oreal', 'maybelline', 'revlon', 'nyx', 'lakme', 'mac', 'sugar',
    'himalaya', 'nivea', 'dove', 'olay', 'ponds', 'adidas', 'nike', 'puma',
    'cetaphil'
]);

// Set of model-defining words.
const SPEC_WORDS = new Set([
    'pro', 'plus', 'ultra', 'max', 'lite', 
    'fe', 'fan edition', 'se', 'go', 'mini'
]);

// Set of package-defining words.
const PACKAGING_WORDS = new Set([
    'combo', 'pack', 'set', 'pack of', 'set of'
]);

const STOP_WORDS = new Set(['the', 'new', 'a', 'an', 'for', 'with', 'of']);

// This regex finds *any* sequence of digits,
// even if they are attached to letters (like "8GB" or "5mm").
const NUMBER_REGEX = /\d+(?:\.\d+)?/g;


// --- 4. Utility Functions (With Additions) ---

const normalize = (str) => (str || '').toLowerCase().replace(/\s+/g, ' ').trim();

function extractBrand(title) {
    const titleLower = normalize(title);
    if (!titleLower) return null;
    for (const brand of COMMON_BRANDS) {
        // Use regex for brand extraction as well for consistency
        const brandRegex = new RegExp(`\\b${brand.replace(/'/g, '\'')}\\b`);
        if (brandRegex.test(titleLower)) return brand;
    }
    const firstWord = titleLower.split(' ')[0];
    if (firstWord && !STOP_WORDS.has(firstWord) && firstWord.length > 2) {
        return firstWord;
    }
    return null;
}

/**
 * Extracts key spec/model words from a title using robust regex.
 */
function extractSpecWords(title) {
    const titleLower = normalize(title);
    const foundSpecs = new Set();
    for (const spec of SPEC_WORDS) {
        // Use a regex with word boundaries (\b)
        // This correctly finds "pro" in "(pro)" or "ultra" in "s24-ultra"
        const specRegex = new RegExp(`\\b${spec.replace(/\s+/g, '\\s+')}\\b`);
        if (specRegex.test(titleLower)) {
            foundSpecs.add(spec);
        }
    }
    return foundSpecs;
}

/**
 * Extracts key packaging words from a title using robust regex.
 */
function extractPackagingWords(title) {
    const titleLower = normalize(title);
    const foundPackaging = new Set();
    for (const pkg of PACKAGING_WORDS) {
        // Use a regex with word boundaries (\b)
        // This correctly finds "pack of" in "(pack of 2)"
        const pkgRegex = new RegExp(`\\b${pkg.replace(/\s+/g, '\\s+')}\\b`);
        if (pkgRegex.test(titleLower)) {
            foundPackaging.add(pkg);
        }
    }
    return foundPackaging;
}

/**
 * Extracts all numbers from two titles and checks for non-identical sets.
 */
function compareNumbers(titleA, titleB) {
    const numsA = new Set(titleA.match(NUMBER_REGEX) || []);
    const numsB = new Set(titleB.match(NUMBER_REGEX) || []);

    if (numsA.size === 0 && numsB.size === 0) {
        return { match: true };
    }

    const uniqueToA = [...numsA].filter(n => !numsB.has(n));
    const uniqueToB = [...numsB].filter(n => !numsB.has(n));

    // Strict Veto Logic: Vetoes if *any* number is different.
    if (uniqueToA.length > 0 || uniqueToB.length > 0) {
        const reasonParts = [];
        if (uniqueToA.length > 0) reasonParts.push(`A has unique [${uniqueToA.join(',')}]`);
        if (uniqueToB.length > 0) reasonParts.push(`B has unique [${uniqueToB.join(',')}]`);
        
        return {
            match: false,
            reason: `Numeric sets not identical: ${reasonParts.join('; ')}`
        };
    }

    // Sets are identical
    return { match: true };
}

// --- 5. Core Matching Logic (Refactored) ---

/**
 * Compares two product objects (A and B) using a smart-check-first, filter-later strategy.
 */
async function matchProducts(productA, productB, options = {}) {
    const config = {
        semanticThreshold: 0.78, // Keep the wider funnel
        ...options
    };

    const baseResult = { matched: false, score: 0, method: null, reason: "" };

    if (!productA?.title || !productB?.title) {
        return { ...baseResult, reason: "One or both products lack a title." };
    }
    
    // --- Check Cache First ---
    const [title1, title2] = [productA.title, productB.title].sort();
    const cacheKey = `${title1}||${title2}`;
    if (semanticCache.has(cacheKey)) {
        console.log(`[Matcher] Cache HIT for: "${productA.title}" vs "${productB.title}"`);
        return semanticCache.get(cacheKey);
    }
    
    console.log(`[Matcher] Cache MISS for: "${productA.title}" vs "${productB.title}"`);

    // --- Step 1: Smart Brand Veto ---
    const brandA = normalize(productA.brand || extractBrand(productA.title));
    const brandB = normalize(productB.brand || extractBrand(productB.title));

    if (brandA && brandB && brandA !== brandB) {
        const isBrandAKnown = COMMON_BRANDS.has(brandA);
        const isBrandBKnown = COMMON_BRANDS.has(brandB);

        const bothKnown = isBrandAKnown && isBrandBKnown;
        const bothUnknown = !isBrandAKnown && !isBrandBKnown;

        // Veto if both brands are Known (and different) OR both are Unknown (and different)
        if (bothKnown || bothUnknown) {
            const brandMismatchResult = {
                ...baseResult,
                method: "brand",
                reason: `Brand mismatch: '${brandA}' vs '${brandB}'`
            };
            semanticCache.set(cacheKey, brandMismatchResult);
            return brandMismatchResult;
        }
    }
   
    // --- Step 2: Call Semantic Matcher (The "Smart" Check) ---
    const semanticResult = await checkSemanticSimilarity(productA.title, productB.title, config);

    // If the matcher says NO, we trust it.
    if (!semanticResult.matched) {
        semanticCache.set(cacheKey, semanticResult); // Cache the "no"
        return semanticResult;
    }

    // --- Step 2.5: Spec Word Veto (Strict Logic) ---
    // This now uses the robust regex function
    const specsA = extractSpecWords(productA.title);
    const specsB = extractSpecWords(productB.title);

    if (specsA.size > 0 || specsB.size > 0) { 
        const uniqueSpecsA = [...specsA].filter(s => !specsB.has(s));
        const uniqueSpecsB = [...specsB].filter(s => !specsA.has(s));

        // Strict Veto: Vetoes if *any* spec word is different.
        if (uniqueSpecsA.length > 0 || uniqueSpecsB.length > 0) {
            const specVetoResult = {
                ...baseResult,
                score: semanticResult.score,
                method: "spec-word-veto",
                reason: `Spec word sets not identical: A has [${uniqueSpecsA.join(',') || 'none'}] unique, B has [${uniqueSpecsB.join(',') || 'none'}] unique`
            };
            semanticCache.set(cacheKey, specVetoResult);
            return specVetoResult;
        }
    }

    // --- Step 2.7: Packaging Veto (Strict Logic) ---
    // This now uses the robust regex function
    const pkgA = extractPackagingWords(productA.title);
    const pkgB = extractPackagingWords(productB.title);

    // Only run check if one title *has* a packaging word.
    if (pkgA.size > 0 || pkgB.size > 0) {
        const uniquePkgA = [...pkgA].filter(p => !pkgB.has(p));
        const uniquePkgB = [...pkgB].filter(p => !pkgA.has(p));

        // Strict Veto: Vetoes if packaging sets are not identical.
        if (uniquePkgA.length > 0 || uniquePkgB.length > 0) {
             const pkgVetoResult = {
                ...baseResult,
                score: semanticResult.score,
                method: "packaging-veto",
                reason: `Packaging sets not identical: A has [${uniquePkgA.join(',') || 'none'}] unique, B has [${uniquePkgB.join(',') || 'none'}] unique`
            };
            semanticCache.set(cacheKey, pkgVetoResult);
            return pkgVetoResult;
        }
    }

    // --- Step 3: Numeric Veto (Strict Logic) ---
    // This veto should also catch the "Pack Of 2" example
    // because numsA={"250"} and numsB={"250", "2"}
    const numberResult = compareNumbers(productA.title, productB.title);

    if (!numberResult.match) {
        const numericVetoResult = {
            ...baseResult,
            score: semanticResult.score,
            method: "numeric-veto",
            reason: numberResult.reason
        };
        semanticCache.set(cacheKey, numericVetoResult); // Cache the veto
        return numericVetoResult;
    }

    // --- Final Result ---
    // Matcher said "yes" and all veto checks passed.
    semanticCache.set(cacheKey, semanticResult); // Cache the "yes"
    return semanticResult;
}

/**
 * --- OPTIMIZED (Unchanged from before) ---
 * Iterates a list of products in PARALLEL to find the best match.
 */
async function findBestMatch(productToMatch, productList, options = {}) {
    let bestMatch = null;
    let bestMatchResult = { score: -1, matched: false };

    // 1. Create an array of *promises*.
    const comparisonPromises = productList.map(candidateProduct =>
        matchProducts(productToMatch, candidateProduct, options)
            .then(result => ({
                candidate: candidateProduct,
                result: result
            }))
            .catch(error => ({
                candidate: candidateProduct,
                result: { matched: false, score: 0, reason: `Error: ${error.message}` }
            }))
    );

    // 2. Wait for ALL promises to settle (run in parallel)
    const allResults = await Promise.all(comparisonPromises);

    // 3. Now, just loop through the in-memory results (very fast)
    for (const { candidate, result } of allResults) {
        if (result.matched && result.score > bestMatchResult.score) {
            bestMatch = candidate;
            bestMatchResult = result;
        }
    }

    if (bestMatch) {
        console.log(`[Matcher] Best match found for "${productToMatch.title}"`);
        console.log(`[Matcher] -> Match: "${bestMatch.title}"`);
        console.log(`[Matcher] -> Details:`, bestMatchResult);
        return { item: bestMatch, result: bestMatchResult };
    } else {
        console.log(`[Matcher] No match found for "${productToMatch.title}"`);
        return null;
    }
}


// --- 6. Exports ---
module.exports = {
    matchProducts,
    findBestMatch
};