const express = require('express');
const { exec } = require('child_process');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static frontend files from 'public' folder
app.use(express.static('public'));
app.use(express.json());

// --- MySQL connection ---
let db;
(async () => {
  try {
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',             // ⚠️ Replace with your MySQL username
      password: 'password',    // ⚠️ Replace with your MySQL password
      database: 'scraper_db'
    });
    console.log('Connected to MySQL');
  } catch (err) {
    console.error('❌ MySQL connection failed:', err);
  }
})();

// --- Compare endpoint ---
app.post('/compare', async (req, res) => {
  const { productName, numPages, refresh } = req.body;
  if (!productName || !numPages) return res.status(400).send('Missing parameters');

  try {
    // 1️⃣ Check cache first
    const [rows] = await db.execute('SELECT * FROM scraper_cache WHERE query = ?', [productName]);
    if (rows.length > 0 && !refresh) {
      let cached = rows[0];
      let data = cached.results;
      if (typeof cached.results === 'string') data = JSON.parse(cached.results);
      return res.json(Array.isArray(data.results) ? data.results : data);
    }

    // 2️⃣ Run scraper
    const command = `node compare.js "${productName}" ${numPages}`;
    console.log(`🚀 Running: ${command}`);

    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error('Execution Error:', stderr);
        return res.status(500).send(`Scraper error: ${stderr}`);
      }

      let jsonData;
      try {
        jsonData = JSON.parse(stdout);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError, stdout);
        return res.status(500).send(`Invalid JSON from scraper`);
      }

      // 3️⃣ Store in cache
      await db.execute(
        `INSERT INTO scraper_cache (query, results)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           results = VALUES(results),
           last_updated = CURRENT_TIMESTAMP`,
        [productName, JSON.stringify(jsonData)]
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
    const [rows] = await db.execute('SELECT query, results FROM scraper_cache ORDER BY last_updated DESC');
    const formatted = rows.map(r => {
      let parsedResults = r.results;
      if (typeof r.results === 'string') {
        try { parsedResults = JSON.parse(r.results); } 
        catch (err) { console.error('Failed to parse JSON from DB:', err); }
      }
      return { query: r.query, results: Array.isArray(parsedResults.results) ? parsedResults.results : parsedResults };
    });
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to fetch cache');
  }
});

// --- Get cached product names only ---
app.get('/cache/names', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT query FROM scraper_cache ORDER BY last_updated DESC');
    const names = rows.map(r => r.query);
    res.json(names);
  } catch (err) {
    console.error('Failed to fetch cached product names:', err);
    res.status(500).send('Failed to fetch cached product names');
  }
});

// --- Clear all cache ---
app.delete('/cache', async (req, res) => {
  try {
    await db.execute('DELETE FROM scraper_cache');
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