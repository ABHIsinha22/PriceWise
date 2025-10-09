document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('compare-form');
  const productNameInput = document.getElementById('product-name');
  const numPagesInput = document.getElementById('num-pages');
  const compareBtn = document.getElementById('compare-btn');
  const logOutput = document.getElementById('log-output');
  const loader = document.getElementById('loader');
  const resultsGrid = document.getElementById('results-grid');
  const loadCacheBtn = document.getElementById('load-cache-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const cachedContainer = document.getElementById('cached-products-container');

  // Helper: create product card
  function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'p-4 border rounded-lg bg-white dark:bg-background-dark shadow';

    const amazonPrice = product.amazonPrice || Infinity;
    const flipkartPrice = product.flipkartPrice || Infinity;

    const amazonClass = amazonPrice <= flipkartPrice ? 'bg-green-100 dark:bg-green-900' : '';
    const flipkartClass = flipkartPrice < amazonPrice ? 'bg-green-100 dark:bg-green-900' : '';

    card.innerHTML = `
      <h3 class="font-bold text-lg">${product.title}</h3>
      <div class="grid grid-cols-2 gap-4 mt-2">
        <div class="p-2 border rounded ${amazonClass}">
          <div class="font-semibold">Amazon</div>
          <div>₹${isNaN(amazonPrice) ? 'N/A' : amazonPrice.toLocaleString()}</div>
        </div>
        <div class="p-2 border rounded ${flipkartClass}">
          <div class="font-semibold">Flipkart</div>
          <div>₹${isNaN(flipkartPrice) ? 'N/A' : flipkartPrice.toLocaleString()}</div>
        </div>
      </div>
    `;
    return card;
  }

  // --- Search / Compare ---
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const productName = productNameInput.value;
    const numPages = numPagesInput.value;

    logOutput.textContent = 'Preparing to scrape...';
    resultsGrid.innerHTML = '';
    loader.classList.remove('hidden');
    compareBtn.disabled = true;
    compareBtn.textContent = 'Comparing...';

    try {
      const res = await fetch('/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, numPages, refresh: false }),
      });
      const data = await res.json();

      if (!Array.isArray(data)) throw new Error('Invalid data format');

      resultsGrid.innerHTML = '';
      data.forEach(product => resultsGrid.appendChild(createProductCard(product)));
      logOutput.textContent = '';
    } catch (err) {
      console.error(err);
      logOutput.textContent = `❌ ${err.message}`;
    } finally {
      loader.classList.add('hidden');
      compareBtn.disabled = false;
      compareBtn.textContent = 'Compare Prices';
    }
  });

  // --- Load Cached Product Names ---
  loadCacheBtn.addEventListener('click', async () => {
    cachedContainer.innerHTML = '';
    loader.classList.remove('hidden');
    logOutput.textContent = 'Loading cached products...';

    try {
      const res = await fetch('/cache/names');
      const names = await res.json();

      names.forEach(name => {
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.className = 'px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600';
        btn.addEventListener('click', async () => {
          productNameInput.value = name;
          compareBtn.click();
        });
        cachedContainer.appendChild(btn);
      });
      logOutput.textContent = '  products loaded';
    } catch (err) {
      console.error(err);
      logOutput.textContent = '❌ Failed to load cached products';
    } finally {
      loader.classList.add('hidden');
    }
  });

  // --- Clear Cache ---
  clearCacheBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all cached products?')) return;

    loader.classList.remove('hidden');
    try {
      const res = await fetch('/cache', { method: 'DELETE' });
      const data = await res.json();
      cachedContainer.innerHTML = '';
      resultsGrid.innerHTML = '';
      logOutput.textContent = data.message || 'Cache cleared';
    } catch (err) {
      console.error(err);
      logOutput.textContent = ' Failed to clear cache';
    } finally {
      loader.classList.add('hidden');
    }
  });
});