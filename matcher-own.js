// matcher-own.js

// NO top-level await import. We will import it inside getInstance.

/**
 * A helper function to compute the dot product (cosine similarity for normalized vectors).
 * @param {Float32Array} a - The first vector.
 * @param {Float32Array} b - The second vector.
 * @returns {number} The dot product.
 */
function dotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; ++i) {
        sum += a[i] * b[i];
    }
    return sum;
}

/**
 * Singleton class to manage the sentence similarity model.
 * This ensures we only load the model into memory once.
 */
class SemanticMatcher {
    static instance = null;
    static loadingPromise = null;
    static pipeline = null; // We'll store the imported 'pipeline' function here

    /**
     * Gets the singleton instance of the model pipeline.
     * @returns {Promise<object>} The initialized feature-extraction pipeline.
     */
    static async getInstance() {
        if (this.instance) {
            return this.instance;
        }

        // If we are already loading, wait for the existing promise to resolve.
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        console.log("[Matcher Local] Initializing local semantic model... (This happens once)");

        // Start loading the model and store the promise
        this.loadingPromise = new Promise(async (resolve, reject) => {
            try {
                // --- FIX: IMPORT MOVED INSIDE THE ASYNC FUNCTION ---
                // If we haven't imported the library yet, do it now.
                if (!this.pipeline) {
                    const { pipeline } = await import('@xenova/transformers');
                    this.pipeline = pipeline; // Store it on the class
                }
                // --- END FIX ---

                // Use the now-imported pipeline function
                const extractor = await this.pipeline(
                    'feature-extraction',
                    'Xenova/all-MiniLM-L6-v2',
                    { quantized: true } // Use quantized model for better performance/memory
                );

                this.instance = extractor;
                console.log("[Matcher Local] Local model loaded successfully.");
                resolve(this.instance);
            } catch (error) {
                console.error("[Matcher Local] Error loading local model:", error);
                this.loadingPromise = null; // Reset promise on failure
                reject(error);
            }
        });

        return this.loadingPromise;
    }
}

/**
 * Checks semantic similarity using a locally-run model.
 * @param {string} titleA - The first product title.
 * @param {string} titleB - The second product title.
 * @param {object} config - Configuration object containing the semanticThreshold.
 * @returns {Promise<object>} - A standard match result object.
 */
async function checkWithLocalModel(titleA, titleB, config) {
    let extractor;
    try {
        // Get the initialized model instance
        extractor = await SemanticMatcher.getInstance();
    } catch (error) {
        return {
            matched: false,
            score: 0,
            method: "semantic-local",
            reason: `Local model failed to load: ${error.message}`
        };
    }

    try {
        // Generate embeddings for both titles in parallel.
        // 'pooling: 'mean'' and 'normalize: true' are crucial.
        // Normalizing allows us to use dot product for cosine similarity.
        const [outputA, outputB] = await Promise.all([
            extractor(titleA, { pooling: 'mean', normalize: true }),
            extractor(titleB, { pooling: 'mean', normalize: true })
        ]);

        // Extract the raw vector data
        const vectorA = outputA.data;
        const vectorB = outputB.data;

        // Calculate the cosine similarity (dot product of normalized vectors)
        const score = dotProduct(vectorA, vectorB);

        if (score >= config.semanticThreshold) {
            return {
                matched: true,
                score: score,
                method: "semantic-local",
                reason: `Local score ${score.toFixed(3)} >= threshold ${config.semanticThreshold}`
            };
        } else {
            return {
                matched: false,
                score: score,
                method: "semantic-local",
                reason: `Local score ${score.toFixed(3)} < threshold ${config.semanticThreshold}`
            };
        }

    } catch (error) {
        console.error("[Matcher Local] Error during embedding generation:", error.message);
        return {
            matched: false,
            score: 0,
            method: "semantic-local",
            reason: `Embedding failed: ${error.message}`
        };
    }
}

module.exports = { checkWithLocalModel };