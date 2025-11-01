const express = require('express');
const { exec } = require('child_process');
const mongoose = require('mongoose');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static frontend files from 'public' folder
app.use(express.static('public'));
app.use(express.json());

// --- Connect to MongoDB ---
mongoose.connect('mongodb://127.0.0.1:27017/scraper_db', {
 
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection failed:', err));

// --- Define Mongoose Schema ---
const scraperCacheSchema = new mongoose.Schema({
  query: { type: String, required: true, unique: true },
  results: { type: mongoose.Schema.Types.Mixed },
  last_updated: { type: Date, default: Date.now },
});

const ScraperCache = mongoose.model('ScraperCache', scraperCacheSchema);

// --- Compare endpoint ---
app.post('/compare', async (req, res) => {
  const { productName, numPages, refresh } = req.body;
  if (!productName || !numPages) return res.status(400).send('Missing parameters');

  try {
    // 1️⃣ Check cache first
    const cached = await ScraperCache.findOne({ query: productName });
    if (cached && !refresh) {
      console.log(`📦 Returning cached data for: ${productName}`);
      return res.json(
        Array.isArray(cached.results?.results)
          ? cached.results.results
          : cached.results
      );
    }

    // 2️⃣ Run scraper
    // Use path.join to make the command cross-platform compatible
    const compareScriptPath = path.join(__dirname, 'compare.js');
    const command = `node "${compareScriptPath}" "${productName}" ${numPages}`;
    console.log(`🚀 Running: ${command}`);

    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error('Execution Error:', stderr);
        return res.status(500).send(`Scraper error: ${stderr}`);
      }

      let jsonData;
      try {
        // --- FIX START ---
        // Find the last non-empty line from stdout.
        // This makes parsing robust even if scrapers console.log debug messages.
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        
        // Try to parse only that last line.
        jsonData = JSON.parse(lastLine);
        // --- FIX END ---

      } catch (parseError) {
        // Log the *full* stdout to see what junk data we received
        console.error('JSON Parse Error:', parseError, 'Full stdout:', stdout);
        return res.status(500).send('Invalid JSON from scraper');
      }

      // 3️⃣ Store/Update cache
      await ScraperCache.findOneAndUpdate(
        { query: productName },
        { results: jsonData, last_updated: Date.now() },
        { upsert: true, new: true }
      );

      res.json(jsonData.results || []);
    });

  } catch (err) {
    console.error('Server Error:', err);
    res.status(500).send('Server error');
  }
});

// --- Get all cached products ---
app.get('/cache', async (req, res) => {
  try {
    const items = await ScraperCache.find().sort({ last_updated: -1 });
    const formatted = items.map(item => ({
      query: item.query,
      results: Array.isArray(item.results?.results)
        ? item.results.results
        : item.results,
    }));
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to fetch cache');
  }
});

// --- Get cached product names only ---
app.get('/cache/names', async (req, res) => {
  try {
    const items = await ScraperCache.find().sort({ last_updated: -1 });
    const names = items.map(item => item.query);
    res.json(names);
  } catch (err) {
    console.error('Failed to fetch cached product names:', err);
    res.status(500).send('Failed to fetch cached product names');
  }
});

// --- Clear all cache ---
app.delete('/cache', async (req, res) => {
  try {
    await ScraperCache.deleteMany({});
    res.json({ message: '✅ All cached products cleared.' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to clear cache');
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🎉 Server running at http://localhost:${PORT}`);
});