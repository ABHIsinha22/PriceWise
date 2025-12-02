// matcher-own.js

/**
 * A helper function to compute the dot product (cosine similarity for normalized vectors).
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
 */
class SemanticMatcher {
    static instance = null;
    static loadingPromise = null;
    static pipeline = null; 

    /**
     * Gets the singleton instance of the model pipeline.
     */
    static async getInstance() {
        if (this.instance) {
            return this.instance;
        }
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        console.error("[Matcher Local] Initializing local semantic model... (This happens once)"); // <-- FIX

        this.loadingPromise = new Promise(async (resolve, reject) => {
            try {
                // --- FIX: Silences the transformers library logs ---
                process.env.XENOVA_LOG_LEVEL = 'error';
                // --- END OF FIX ---

                if (!this.pipeline) {
                    const { pipeline } = await import('@xenova/transformers');
                    this.pipeline = pipeline;
                }

                const extractor = await this.pipeline(
                    'feature-extraction',
                    'Xenova/all-MiniLM-L6-v2',
                    { quantized: true } 
                );

                this.instance = extractor;
                console.error("[Matcher Local] Local model loaded successfully."); // <-- FIX
                resolve(this.instance);
            } catch (error) {
                console.error("[Matcher Local] Error loading local model:", error);
                this.loadingPromise = null; 
                reject(error);
            }
        });

        return this.loadingPromise;
    }
}

/**
 * Checks semantic similarity using a locally-run model.
 */
async function checkWithLocalModel(titleA, titleB, config) {
    let extractor;
    try {
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
        const [outputA, outputB] = await Promise.all([
            extractor(titleA, { pooling: 'mean', normalize: true }),
            extractor(titleB, { pooling: 'mean', normalize: true })
        ]);

        const vectorA = outputA.data;
        const vectorB = outputB.data;
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