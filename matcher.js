// comparison-block/ matcher.js

// --- 1. THE MATCHER SWITCH ---
const MATCHER_MODE = 'local'; // ('api' or 'local')

// --- 2. Imports & Cache ---
const { checkWithLocalModel } = require('./matcher-own.js');
const semanticCache = new Map();

function checkSemanticSimilarity(titleA, titleB, config) {
    if (MATCHER_MODE === 'local') {
        return checkWithLocalModel(titleA, titleB, config);
    }
    // This part is currently dead code, but if you re-add it, it must also use console.error
    return checkWithSemanticAPI(titleA, titleB, config);
}

// --- 3. Constants (Unchanged) ---
const COMMON_BRANDS = new Set([
    'apple', 'samsung', 'google', 'oneplus', 'xiaomi', 'redmi', 'oppo', 'vivo',
    'realme', 'motorola', 'nokia', 'sony', 'lg', 'asus', 'poco', 'boat',
    'jbl', 'sennheiser', 'bose', 'hp', 'dell', 'lenovo', 'acer', 'msi',
    'noise', 'fire-boltt', 'amazfit', 'garmin', 'fitbit', 'spigen', 'anker',
    'logitech', 'razer', 'corsair', 'whirlpool', 'panasonic', 'toshiba',
    'intel', 'amd', 'nvidia', 'gopro', 'dji', 'canon', 'nikon',
    'l\'oreal', 'maybelline', 'revlon', 'nyx', 'lakme', 'mac', 'sugar',
    'himalaya', 'nivea', 'dove', 'olay', 'ponds', 'adidas', 'nike', 'puma',
    'cetaphil'
]);
const SPEC_WORDS = new Set([
    'pro', 'plus', 'ultra', 'max', 'lite', 
    'fe', 'fan edition', 'se', 'go', 'mini'
]);
const PACKAGING_WORDS = new Set([
    'combo', 'pack', 'set', 'pack of', 'set of'
]);
const STOP_WORDS = new Set(['the', 'new', 'a', 'an','for', 'with', 'of']);
const NUMBER_REGEX = /\d+(?:\.\d+)?/g;

// --- 4. Utility Functions (Unchanged) ---

const normalize = (str) => (str || '').toLowerCase().replace(/\s+/g, ' ').trim();

function extractBrand(title) {
    const titleLower = normalize(title);
    if (!titleLower) return null;
    for (const brand of COMMON_BRANDS) {
        const brandRegex = new RegExp(`\\b${brand.replace(/'/g,'\'')}\\b`);
        if (brandRegex.test(titleLower)) return brand;
    }
    const firstWord = titleLower.split(' ')[0];
    if (firstWord && !STOP_WORDS.has(firstWord) && firstWord.length > 2) {
        return firstWord;
    }
    return null;
}
function extractSpecWords(title) {
    const titleLower = normalize(title);
    const foundSpecs = new Set();
    for (const spec of SPEC_WORDS) {
        const specRegex = new RegExp(`\\b${spec.replace(/\s+/g, '\\s+')}\\b`);
        if (specRegex.test(titleLower)) {
            foundSpecs.add(spec);
        }
    }
    return foundSpecs;
}
function extractPackagingWords(title) {
    const titleLower = normalize(title);
    const foundPackaging = new Set();
    for (const pkg of PACKAGING_WORDS) {
        const pkgRegex = new RegExp(`\\b${pkg.replace(/\s+/g, '\\s+')}\\b`);
        if (pkgRegex.test(titleLower)) {
            foundPackaging.add(pkg);
        }
    }
    return foundPackaging;
}
function compareNumbers(titleA, titleB) {
    const numsA = new Set(titleA.match(NUMBER_REGEX) || []);
    const numsB = new Set(titleB.match(NUMBER_REGEX) || []);
    if (numsA.size === 0 && numsB.size === 0) {
        return { match: true };
    }
    const uniqueToA = [...numsA].filter(n => !numsB.has(n));
    const uniqueToB = [...numsB].filter(n => !numsB.has(n));
    if (uniqueToA.length > 0 || uniqueToB.length > 0) {
        const reasonParts = [];
        if (uniqueToA.length > 0) reasonParts.push(`A has unique [${uniqueToA.join(',')}]`);
        if (uniqueToB.length > 0) reasonParts.push(`B has unique [${uniqueToB.join(',')}]`);
        return {
            match: false,
            reason: `Numeric sets not identical: ${reasonParts.join('; ')}`
        };
    }
    return { match: true };
}

// --- 5. Core Matching Logic (Refactored) ---
async function matchProducts(productA, productB, options = {}) {
    const config = { semanticThreshold: 0.78, ...options };
    const baseResult = { matched: false, score: 0, method: null, reason: "" };
    if (!productA?.title || !productB?.title) {
        return { ...baseResult, reason: "One or both products lack a title." };
    }
    
    const [title1, title2] = [productA.title, productB.title].sort();
    const cacheKey = `${title1}||${title2}`;
    if (semanticCache.has(cacheKey)) {
        console.error(`[Matcher] Cache HIT for: "${productA.title}" vs "${productB.title}"`); // <-- FIX
        return semanticCache.get(cacheKey);
    }
    
    console.error(`[Matcher] Cache MISS for: "${productA.title}" vs "${productB.title}"`); // <-- FIX

    // --- Step 1: Smart Brand Veto ---
    const brandA = normalize(productA.brand || extractBrand(productA.title));
    const brandB = normalize(productB.brand || extractBrand(productB.title));
    if (brandA && brandB && brandA !== brandB) {
        const isBrandAKnown = COMMON_BRANDS.has(brandA);
        const isBrandBKnown = COMMON_BRANDS.has(brandB);
        const bothKnown = isBrandAKnown && isBrandBKnown;
        const bothUnknown = !isBrandAKnown && !isBrandBKnown;
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
    if (!semanticResult.matched) {
        semanticCache.set(cacheKey, semanticResult);
        return semanticResult;
    }

    // --- Step 2.5: Spec Word Veto (Strict Logic) ---
    const specsA = extractSpecWords(productA.title);
    const specsB = extractSpecWords(productB.title);
    if (specsA.size > 0 || specsB.size > 0) { 
        const uniqueSpecsA = [...specsA].filter(s => !specsB.has(s));
        const uniqueSpecsB = [...specsB].filter(s => !specsA.has(s));
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
    const pkgA = extractPackagingWords(productA.title);
    const pkgB = extractPackagingWords(productB.title);
    if (pkgA.size > 0 || pkgB.size > 0) {
        const uniquePkgA = [...pkgA].filter(p => !pkgB.has(p));
        const uniquePkgB = [...pkgB].filter(p => !pkgA.has(p));
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
    const numberResult = compareNumbers(productA.title, productB.title);
    if (!numberResult.match) {
        const numericVetoResult = {
            ...baseResult,
            score: semanticResult.score,
            method: "numeric-veto",
            reason: numberResult.reason
        };
        semanticCache.set(cacheKey, numericVetoResult);
        return numericVetoResult;
    }

    semanticCache.set(cacheKey, semanticResult);
    return semanticResult;
}

/**
 * --- OPTIMIZED (Unchanged from before) ---
 * Iterates a list of products in PARALLEL to find the best match.
 */
async function findBestMatch(productToMatch, productList, options = {}) {
    let bestMatch = null;
    let bestMatchResult = { score: -1, matched: false };
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
    const allResults = await Promise.all(comparisonPromises);

    for (const { candidate, result } of allResults) {
        if (result.matched && result.score > bestMatchResult.score) {
            bestMatch = candidate;
            bestMatchResult = result;
        }
    }

    if (bestMatch) {
        console.error(`[Matcher] Best match found for "${productToMatch.title}"`); // <-- FIX
        console.error(`[Matcher] -> Match: "${bestMatch.title}"`); // <-- FIX
        console.error(`[Matcher] -> Details:`, bestMatchResult); // <-- FIX
        return { item: bestMatch, result: bestMatchResult };
    } else {
        console.error(`[Matcher] No match found for "${productToMatch.title}"`); // <-- FIX
        return null;
    }
}

// --- 6. Exports ---
module.exports = {
    matchProducts,
    findBestMatch
};