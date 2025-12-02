const express = require('express');
const { execFile } = require('child_process'); // <-- Use execFile
const util = require('util'); // <-- Import util
const mongoose = require('mongoose');
const path = require('path');

// --- Promisify execFile ---
const execFilePromise = util.promisify(execFile);

const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

// --- Connect to MongoDB ---
mongoose.connect('mongodb://127.0.0.1:27017/scraper_db')
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error(' MongoDB connection failed:', err));

// --- Mongoose Schema ---
const scraperCacheSchema = new mongoose.Schema({
  query: { type: String, required: true, unique: true },
  results: { type: mongoose.Schema.Types.Mixed },
  last_updated: { type: Date, default: Date.now },
});
const ScraperCache = mongoose.model('ScraperCache', scraperCacheSchema);

// --- Compare endpoint (FIXED & SECURE) ---
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

    // 2️ Run scraper with execFile
    const scriptPath = path.join(__dirname, 'compare.js');
    const args = [productName, numPages.toString()];

    console.log(`🚀 Running: node ${scriptPath} "${productName}" ${numPages}`);

    // This 'try...catch' block will NOW catch all errors
    const { stdout, stderr } = await execFilePromise('node', [scriptPath, ...args], {
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    if (stderr) {
      // This will show logs from scrapers, matchers, etc.
      console.error('Execution Stderr:', stderr);
    }

    let jsonData;
    try {
      jsonData = JSON.parse(stdout);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError, stdout);
      // This error means stdout is *still* contaminated
      return res.status(500).send('Invalid JSON from scraper'); 
    }

    // 3️ Store/Update cache
    await ScraperCache.findOneAndUpdate(
      { query: productName },
      { results: jsonData, last_updated: Date.now() },
      { upsert: true, new: true }
    );

    res.json(jsonData.results || []);

  } catch (err) {
    // This catches errors from execFilePromise (script crashing)
    console.error('Server Error:', err);
    // Send the REAL error message to the frontend
    res.status(500).send(err.stderr || err.message || 'Server error'); 
  }
});

// --- Other routes (no changes) ---
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

app.delete('/cache', async (req, res) => {
  try {
    await ScraperCache.deleteMany({});
    res.json({ message: ' All cached products cleared.' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to clear cache');
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🎉 Server running at http://localhost:${PORT}`);
});