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
  const progressBarContainer = document.getElementById('progress-bar-container');
  const progressBar = document.getElementById('progress-bar');

  // Animate main section on load
  setTimeout(() => {
    document.getElementById('main-section').classList.remove('opacity-0', 'translate-y-4');
  }, 200);

  // Helper: Update progress bar
  function updateProgress(percent, message) {
    if (!progressBarContainer || !progressBar) return;
    progressBarContainer.classList.remove('hidden');
    progressBar.style.width = `${percent}%`;
    if (message) logOutput.textContent = message;
  }

  // Helper: create product card
  function createProductCard(product) {
    const card = document.createElement('div');
    card.className =
      'product-card bg-white dark:bg-background-dark/50 p-4 rounded-xl shadow hover:shadow-lg transition-all duration-300 flex flex-col justify-between';

    const amazonPrice = product.amazonPrice || Infinity;
    const flipkartPrice = product.flipkartPrice || Infinity;
    const amazonLink = product.amazonLink || null;
    const flipkartLink = product.flipkartLink || null;
    const image = product.amazonImage || product.flipkartImage || '';

    // Determine which store is cheaper
    const amazonCheaper = amazonPrice < flipkartPrice;
    const flipkartCheaper = flipkartPrice < amazonPrice;

    card.innerHTML = `
      <div>
        <div class="flex justify-center mb-3">
          <img src="${image}" alt="${product.title}" class="w-32 h-32 object-contain rounded" />
        </div>
        <h3 class="title font-semibold text-center text-slate-800 dark:text-white">${product.title}</h3>
      </div>

      <div class="grid grid-cols-2 gap-4 mt-4">
        <div class="price-box p-3 border rounded-lg text-center flex flex-col justify-between ${
          amazonCheaper
            ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
            : 'border-gray-200 dark:border-gray-700'
        }">
          <div>
            <div class="store font-medium text-slate-700 dark:text-slate-300">Amazon</div>
            <div class="price mt-1 text-lg font-semibold ${
              amazonCheaper ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-white'
            }">
              ₹${isNaN(amazonPrice) ? 'N/A' : amazonPrice.toLocaleString()}
            </div>
          </div>
          ${
            amazonLink
              ? `<a href="${amazonLink}" target="_blank"
                 class="mt-3 inline-block px-4 py-2 w-full bg-gradient-to-r from-primary to-blue-700 text-white rounded-lg font-semibold text-sm hover:scale-105 transition-all duration-300">
                 Buy
                 </a>`
              : ''
          }
        </div>

        <div class="price-box p-3 border rounded-lg text-center flex flex-col justify-between ${
          flipkartCheaper
            ? 'border-green-500 bg-green-50 dark:bg-green-900/30'
            : 'border-gray-200 dark:border-gray-700'
        }">
          <div>
            <div class="store font-medium text-slate-700 dark:text-slate-300">Flipkart</div>
            <div class="price mt-1 text-lg font-semibold ${
              flipkartCheaper ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-white'
            }">
              ₹${isNaN(flipkartPrice) ? 'N/A' : flipkartPrice.toLocaleString()}
            </div>
          </div>
          ${
            flipkartLink
              ? `<a href="${flipkartLink}" target="_blank"
                 class="mt-3 inline-block px-4 py-2 w-full bg-gradient-to-r from-primary to-blue-700 text-white rounded-lg font-semibold text-sm hover:scale-105 transition-all duration-300">
                 Buy
                 </a>`
              : ''
          }
        </div>
      </div>
    `;

    return card;
  }

  // Handle Compare Form
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const productName = productNameInput.value.trim();
    const numPages = numPagesInput.value;

    if (!productName) {
      logOutput.textContent = 'Please enter a product name.';
      return;
    }

    resultsGrid.innerHTML = '';
    loader.classList.remove('hidden');
    compareBtn.disabled = true;
    compareBtn.textContent = 'Comparing...';

    updateProgress(0);
    let width = 10;
    let stopProgress = false;

    function animateProgress() {
      if (stopProgress) return;
      if (width < 90) {
        width += 1;
        progressBar.style.width = width + '%';
        setTimeout(animateProgress, 5000); // adjust speed
      }
    }
  
    try {
      updateProgress(10, '');
      animateProgress(); // start animation
  
      const res = await fetch('/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, numPages, refresh: false }),
      });
  
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Invalid response format.');
  
      stopProgress = true;       // stop animation
      updateProgress(100, '');
  
      resultsGrid.innerHTML = '';
      data.forEach(p => resultsGrid.appendChild(createProductCard(p)));
  
      setTimeout(() => {
        progressBarContainer?.classList.add('hidden');
        progressBar.style.width = '0%';
      }, 1200);
  

    } catch (err) {
      stopProgress = true;
      console.error(err);
      logOutput.textContent = `❌ Error: ${err.message}`;
      progressBarContainer?.classList.add('hidden');
      progressBar.style.width = '0%';
    } finally {
      loader.classList.add('hidden');
      compareBtn.disabled = false;
      compareBtn.textContent = 'Compare Prices';
    }
  });
  // Load Cached Products
  loadCacheBtn.addEventListener('click', async () => {
    cachedContainer.innerHTML = '';
    loader.classList.remove('hidden');

    updateProgress(30, '');

    try {
      const res = await fetch('/cache/names');
      const names = await res.json();

      names.forEach(name => {
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.className =
          'px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 hover:scale-105 transition-transform';
        btn.addEventListener('click', () => {
          productNameInput.value = name;
          compareBtn.click();
        });
        cachedContainer.appendChild(btn);
      });

      updateProgress(100, '');
      setTimeout(() => {
        progressBarContainer?.classList.add('hidden');
        progressBar.style.width = '0%';
      }, 800);


    } catch (err) {
      logOutput.textContent = '❌ Failed to load cached data.';
      progressBarContainer?.classList.add('hidden');
      progressBar.style.width = '0%';
    } finally {
      loader.classList.add('hidden');
    }
  });

  // Clear Cache
  clearCacheBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all cached products?')) return;
    loader.classList.remove('hidden');
    try {
      const res = await fetch('/cache', { method: 'DELETE' });
      const data = await res.json();
      cachedContainer.innerHTML = '';
      resultsGrid.innerHTML = '';
      logOutput.textContent = data.message || 'Cache cleared.';
    } catch (err) {
      logOutput.textContent = '❌ Failed to clear cache.';
    } finally {
      loader.classList.add('hidden');
    }
  });
});