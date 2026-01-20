// Ivy's Recipes - Recipe Manager App
// A simple, beautiful recipe collection app

(function() {
    'use strict';

    // ============================================
    // Storage & Data Management
    // ============================================

    const STORAGE_KEY = 'ivys_recipes';

    function getRecipes() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error reading recipes:', e);
            return [];
        }
    }

    function saveRecipes(recipes) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
        } catch (e) {
            console.error('Error saving recipes:', e);
            showToast('Error saving recipes');
        }
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // ============================================
    // Recipe CRUD Operations
    // ============================================

    function addRecipe(recipe) {
        const recipes = getRecipes();
        recipe.id = generateId();
        recipe.createdAt = new Date().toISOString();
        recipe.updatedAt = recipe.createdAt;
        recipes.unshift(recipe);
        saveRecipes(recipes);
        return recipe;
    }

    function updateRecipe(id, updates) {
        const recipes = getRecipes();
        const index = recipes.findIndex(r => r.id === id);
        if (index !== -1) {
            recipes[index] = { ...recipes[index], ...updates, updatedAt: new Date().toISOString() };
            saveRecipes(recipes);
            return recipes[index];
        }
        return null;
    }

    function deleteRecipe(id) {
        const recipes = getRecipes();
        const filtered = recipes.filter(r => r.id !== id);
        saveRecipes(filtered);
    }

    function getRecipeById(id) {
        const recipes = getRecipes();
        return recipes.find(r => r.id === id);
    }

    // ============================================
    // Tags Management
    // ============================================

    function getAllTags() {
        const recipes = getRecipes();
        const tagSet = new Set();
        recipes.forEach(recipe => {
            if (recipe.tags && Array.isArray(recipe.tags)) {
                recipe.tags.forEach(tag => tagSet.add(tag.trim()));
            }
        });
        return Array.from(tagSet).sort();
    }

    // ============================================
    // URL Recipe Extraction
    // ============================================

    const CORS_PROXIES = [
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    async function fetchRecipeFromUrl(url) {
        let lastError = null;

        for (const makeProxyUrl of CORS_PROXIES) {
            try {
                const proxyUrl = makeProxyUrl(url);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

                const response = await fetch(proxyUrl, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                clearTimeout(timeout);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();
                if (!html || html.length < 100) {
                    throw new Error('Empty response');
                }

                const recipe = parseRecipeFromHtml(html, url);
                if (recipe.title) {
                    return recipe;
                }
                throw new Error('No recipe data found');
            } catch (error) {
                lastError = error;
                console.warn(`Proxy failed for ${url}:`, error.message);
                continue; // Try next proxy
            }
        }

        throw lastError || new Error('All proxies failed');
    }

    function parseRecipeFromHtml(html, sourceUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const recipe = {
            title: '',
            image: '',
            servings: '',
            prepTime: '',
            cookTime: '',
            ingredients: '',
            instructions: '',
            notes: '',
            source: sourceUrl,
            tags: []
        };

        // Try to find JSON-LD schema first (most reliable)
        const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const recipeData = findRecipeInJsonLd(data);
                if (recipeData) {
                    extractFromJsonLd(recipeData, recipe);
                    // If no image from JSON-LD, try to find one in the page
                    if (!recipe.image) {
                        recipe.image = findBestImage(doc);
                    }
                    if (recipe.title) return recipe;
                }
            } catch (e) {
                continue;
            }
        }

        // Fallback: Try microdata
        const microdataRecipe = doc.querySelector('[itemtype*="Recipe"]');
        if (microdataRecipe) {
            extractFromMicrodata(microdataRecipe, recipe);
            if (recipe.title) return recipe;
        }

        // Fallback: Try common selectors
        extractFromCommonSelectors(doc, recipe);

        return recipe;
    }

    function findRecipeInJsonLd(data) {
        if (Array.isArray(data)) {
            for (const item of data) {
                const found = findRecipeInJsonLd(item);
                if (found) return found;
            }
        } else if (data && typeof data === 'object') {
            if (data['@type'] === 'Recipe' ||
                (Array.isArray(data['@type']) && data['@type'].includes('Recipe'))) {
                return data;
            }
            if (data['@graph']) {
                return findRecipeInJsonLd(data['@graph']);
            }
        }
        return null;
    }

    function extractFromJsonLd(data, recipe) {
        recipe.title = data.name || '';

        // Image
        if (data.image) {
            if (typeof data.image === 'string') {
                recipe.image = data.image;
            } else if (Array.isArray(data.image)) {
                recipe.image = data.image[0]?.url || data.image[0] || '';
            } else if (data.image.url) {
                recipe.image = data.image.url;
            }
        }

        // Servings
        if (data.recipeYield) {
            recipe.servings = Array.isArray(data.recipeYield)
                ? data.recipeYield[0]
                : data.recipeYield;
        }

        // Times
        recipe.prepTime = formatDuration(data.prepTime);
        recipe.cookTime = formatDuration(data.cookTime) || formatDuration(data.totalTime);

        // Ingredients
        if (data.recipeIngredient && Array.isArray(data.recipeIngredient)) {
            recipe.ingredients = data.recipeIngredient.join('\n');
        }

        // Instructions
        if (data.recipeInstructions) {
            if (typeof data.recipeInstructions === 'string') {
                recipe.instructions = data.recipeInstructions;
            } else if (Array.isArray(data.recipeInstructions)) {
                recipe.instructions = data.recipeInstructions.map((step, i) => {
                    if (typeof step === 'string') {
                        return `${i + 1}. ${step}`;
                    } else if (step.text) {
                        return `${i + 1}. ${step.text}`;
                    } else if (step['@type'] === 'HowToSection') {
                        const sectionSteps = step.itemListElement?.map((s, j) =>
                            `${j + 1}. ${s.text || s}`
                        ).join('\n') || '';
                        return `\n${step.name || 'Section'}:\n${sectionSteps}`;
                    }
                    return '';
                }).filter(Boolean).join('\n\n');
            }
        }

        // Category/tags
        if (data.recipeCategory) {
            const categories = Array.isArray(data.recipeCategory)
                ? data.recipeCategory
                : [data.recipeCategory];
            categories.forEach(cat => {
                // Split by comma in case multiple tags are in one string
                const splitTags = String(cat).split(/[,;]/).map(t => t.trim()).filter(Boolean);
                recipe.tags.push(...splitTags);
            });
        }

        if (data.recipeCuisine) {
            const cuisines = Array.isArray(data.recipeCuisine)
                ? data.recipeCuisine
                : [data.recipeCuisine];
            cuisines.forEach(cuisine => {
                const splitTags = String(cuisine).split(/[,;]/).map(t => t.trim()).filter(Boolean);
                recipe.tags.push(...splitTags);
            });
        }

        // Also check keywords
        if (data.keywords) {
            const keywords = Array.isArray(data.keywords)
                ? data.keywords
                : String(data.keywords).split(/[,;]/).map(t => t.trim());
            recipe.tags.push(...keywords.filter(Boolean));
        }

        // Deduplicate and properly capitalize tags
        recipe.tags = [...new Set(recipe.tags.map(t => t.toLowerCase().trim()))].map(t =>
            capitalizeTag(t)
        ).filter(Boolean);
    }

    function formatDuration(isoDuration) {
        if (!isoDuration) return '';

        // Parse ISO 8601 duration (e.g., "PT30M", "PT1H30M")
        const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return isoDuration;

        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;

        const parts = [];
        if (hours) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
        if (minutes) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);

        return parts.join(' ') || '';
    }

    function extractFromMicrodata(element, recipe) {
        const getName = (prop) => {
            const el = element.querySelector(`[itemprop="${prop}"]`);
            return el?.textContent?.trim() || el?.content || '';
        };

        recipe.title = getName('name');
        recipe.image = element.querySelector('[itemprop="image"]')?.src ||
                       element.querySelector('[itemprop="image"]')?.content || '';
        recipe.servings = getName('recipeYield');
        recipe.prepTime = formatDuration(getName('prepTime'));
        recipe.cookTime = formatDuration(getName('cookTime') || getName('totalTime'));

        const ingredients = element.querySelectorAll('[itemprop="recipeIngredient"]');
        recipe.ingredients = Array.from(ingredients).map(el => el.textContent.trim()).join('\n');

        const instructions = element.querySelectorAll('[itemprop="recipeInstructions"]');
        recipe.instructions = Array.from(instructions).map((el, i) =>
            `${i + 1}. ${el.textContent.trim()}`
        ).join('\n\n');
    }

    function extractFromCommonSelectors(doc, recipe) {
        // Title
        recipe.title = doc.querySelector('h1')?.textContent?.trim() ||
                       doc.querySelector('.recipe-title')?.textContent?.trim() ||
                       doc.querySelector('[class*="title"]')?.textContent?.trim() ||
                       doc.title || '';

        // Image - try many sources
        if (!recipe.image) {
            recipe.image = findBestImage(doc);
        }

        // Try to find ingredients list
        const ingredientsList = doc.querySelector('.ingredients') ||
                               doc.querySelector('[class*="ingredient"]') ||
                               doc.querySelector('.recipe-ingredients');
        if (ingredientsList) {
            const items = ingredientsList.querySelectorAll('li');
            recipe.ingredients = Array.from(items).map(li => li.textContent.trim()).join('\n');
        }

        // Try to find instructions
        const instructionsList = doc.querySelector('.instructions') ||
                                doc.querySelector('[class*="instruction"]') ||
                                doc.querySelector('.recipe-instructions') ||
                                doc.querySelector('.directions');
        if (instructionsList) {
            const items = instructionsList.querySelectorAll('li, p');
            recipe.instructions = Array.from(items).map((el, i) =>
                `${i + 1}. ${el.textContent.trim()}`
            ).join('\n\n');
        }
    }

    function findBestImage(doc) {
        // Try Open Graph image first (usually the best)
        const ogImage = doc.querySelector('meta[property="og:image"]')?.content;
        if (ogImage) return ogImage;

        // Try Twitter card image
        const twitterImage = doc.querySelector('meta[name="twitter:image"]')?.content;
        if (twitterImage) return twitterImage;

        // Try recipe-specific selectors
        const recipeSelectors = [
            '.recipe-image img',
            '.recipe-photo img',
            '[class*="recipe-image"] img',
            '[class*="recipe-photo"] img',
            '[class*="hero"] img',
            '.hero-image img',
            'article img',
            '.post-content img',
            'main img',
            '.entry-content img'
        ];

        for (const selector of recipeSelectors) {
            const img = doc.querySelector(selector);
            const src = img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src');
            if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('avatar')) {
                return src;
            }
        }

        // Last resort: find the largest image
        const allImages = doc.querySelectorAll('img');
        let bestImg = null;
        let bestSize = 0;
        allImages.forEach(img => {
            const src = img.src || img.getAttribute('data-src');
            if (!src || src.includes('icon') || src.includes('logo') || src.includes('avatar')) return;
            const width = parseInt(img.getAttribute('width')) || img.naturalWidth || 0;
            const height = parseInt(img.getAttribute('height')) || img.naturalHeight || 0;
            const size = width * height;
            if (size > bestSize || (!bestImg && src)) {
                bestSize = size;
                bestImg = src;
            }
        });

        return bestImg || '';
    }

    // ============================================
    // UI Components
    // ============================================

    // DOM Elements
    const elements = {
        recipeGrid: document.getElementById('recipe-grid'),
        emptyState: document.getElementById('empty-state'),
        noResults: document.getElementById('no-results'),
        // Sidebar elements
        sidebarSearch: document.getElementById('sidebar-search'),
        sidebarTags: document.getElementById('sidebar-tags'),
        countAll: document.getElementById('count-all'),
        contentTitle: document.getElementById('content-title'),
        recipeCount: document.getElementById('recipe-count'),
        // Header elements
        btnAddRecipe: document.getElementById('btn-add-recipe'),
        btnAddFirst: document.getElementById('btn-add-first'),
        btnMenu: document.getElementById('btn-menu'),
        dropdownMenu: document.getElementById('dropdown-menu'),
        // Modals
        modalRecipe: document.getElementById('modal-recipe'),
        modalView: document.getElementById('modal-view'),
        modalBulkImport: document.getElementById('modal-bulk-import'),
        modalFailedUrls: document.getElementById('modal-failed-urls'),
        failedUrlsList: document.getElementById('failed-urls-list'),
        bulkUrls: document.getElementById('bulk-urls'),
        btnBulkImport: document.getElementById('btn-bulk-import'),
        btnDoBulkImport: document.getElementById('btn-do-bulk-import'),
        // Form elements
        recipeForm: document.getElementById('recipe-form'),
        recipeUrl: document.getElementById('recipe-url'),
        btnFetchUrl: document.getElementById('btn-fetch-url'),
        modalTitle: document.getElementById('modal-title'),
        imagePreview: document.getElementById('image-preview'),
        // Other
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toast-message'),
        btnImport: document.getElementById('btn-import'),
        btnExport: document.getElementById('btn-export'),
        btnInstall: document.getElementById('btn-install'),
        importFile: document.getElementById('import-file'),
        bookmarkletDrag: document.getElementById('bookmarklet-drag')
    };

    // Current state
    let currentFilter = 'all';
    let currentSearch = '';
    let currentViewingRecipe = null;
    let deferredInstallPrompt = null;

    // ============================================
    // Rendering Functions
    // ============================================

    function renderRecipes() {
        const recipes = getRecipes();
        let filtered = recipes;

        // Sort by recently added first (default behavior)
        filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        // Apply sidebar filter (all, recent, favorites, or tag)
        if (currentFilter === 'recent') {
            // Show recipes from last 7 days
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            filtered = filtered.filter(r => new Date(r.createdAt) >= oneWeekAgo);
        } else if (currentFilter === 'favorites') {
            filtered = filtered.filter(r => r.favorite);
        } else if (currentFilter !== 'all') {
            // Tag filter
            filtered = filtered.filter(r =>
                r.tags && r.tags.some(t =>
                    t.toLowerCase() === currentFilter.toLowerCase()
                )
            );
        }

        // Apply search
        if (currentSearch) {
            const search = currentSearch.toLowerCase();
            filtered = filtered.filter(r =>
                r.title.toLowerCase().includes(search) ||
                r.ingredients?.toLowerCase().includes(search) ||
                r.tags?.some(t => t.toLowerCase().includes(search))
            );
        }

        // Update recipe count in sidebar
        elements.countAll.textContent = recipes.length;

        // Update content title and count
        let titleText = 'All Recipes';
        if (currentFilter === 'recent') {
            titleText = 'Recently Added';
        } else if (currentFilter === 'favorites') {
            titleText = 'Favorites';
        } else if (currentFilter !== 'all') {
            titleText = currentFilter;
        }
        elements.contentTitle.textContent = titleText;
        elements.recipeCount.textContent = `${filtered.length} recipe${filtered.length !== 1 ? 's' : ''}`;

        // Update UI
        elements.recipeGrid.innerHTML = '';
        elements.emptyState.hidden = true;
        elements.noResults.hidden = true;

        if (recipes.length === 0) {
            elements.emptyState.hidden = false;
            return;
        }

        if (filtered.length === 0) {
            elements.noResults.hidden = false;
            return;
        }

        filtered.forEach(recipe => {
            elements.recipeGrid.appendChild(createRecipeCard(recipe));
        });
    }

    function createRecipeCard(recipe) {
        const card = document.createElement('article');
        card.className = 'recipe-card';
        card.dataset.id = recipe.id;

        // Get source name from URL
        let sourceName = '';
        if (recipe.source) {
            sourceName = getSourceName(recipe.source);
        }

        // Image section with overlay buttons
        let imageHtml;
        const isFavorite = recipe.favorite ? 'active' : '';
        const overlayButtons = `
            <div class="card-overlay-buttons">
                <button class="card-btn card-btn-favorite ${isFavorite}" data-action="favorite" title="Favorite">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${recipe.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <button class="card-btn card-btn-edit" data-action="edit" title="Edit">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
            </div>
        `;

        if (recipe.image) {
            imageHtml = `
                <div class="recipe-card-image-container">
                    <img src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.title)}" class="recipe-card-image" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                    <div class="recipe-card-placeholder" style="display:none">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                        </svg>
                    </div>
                    ${overlayButtons}
                    ${sourceName ? `<div class="card-source">${escapeHtml(sourceName)}</div>` : ''}
                </div>`;
        } else {
            imageHtml = `
                <div class="recipe-card-image-container">
                    <div class="recipe-card-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                        </svg>
                    </div>
                    ${overlayButtons}
                    ${sourceName ? `<div class="card-source">${escapeHtml(sourceName)}</div>` : ''}
                </div>`;
        }

        // Meta info
        const metaParts = [];
        if (recipe.prepTime || recipe.cookTime) {
            const time = [recipe.prepTime, recipe.cookTime].filter(Boolean).join(' + ');
            metaParts.push(`<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${escapeHtml(time)}</span>`);
        }
        if (recipe.servings) {
            metaParts.push(`<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>${escapeHtml(recipe.servings)}</span>`);
        }

        // Tags - show first 2, then "more" button if there are additional tags
        const allTags = recipe.tags || [];
        const visibleTags = allTags.slice(0, 2);
        const hiddenCount = allTags.length - 2;
        let tagsHtml = visibleTags.map(tag =>
            `<span class="recipe-card-tag">${escapeHtml(tag)}</span>`
        ).join('');
        if (hiddenCount > 0) {
            tagsHtml += `<span class="recipe-card-tag more-tags">+${hiddenCount} more</span>`;
        }

        card.innerHTML = `
            ${imageHtml}
            <div class="recipe-card-content">
                <h3 class="recipe-card-title">${escapeHtml(recipe.title)}</h3>
                ${metaParts.length ? `<div class="recipe-card-meta">${metaParts.join('')}</div>` : ''}
                ${tagsHtml ? `<div class="recipe-card-tags">${tagsHtml}</div>` : ''}
            </div>
        `;

        // Handle card clicks
        card.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (btn) {
                e.stopPropagation();
                if (btn.dataset.action === 'favorite') {
                    toggleFavorite(recipe.id);
                } else if (btn.dataset.action === 'edit') {
                    openEditModal(recipe.id);
                }
            } else {
                openViewModal(recipe.id);
            }
        });

        return card;
    }

    function getSourceName(url) {
        try {
            const hostname = new URL(url).hostname.replace('www.', '');
            // Map common domains to friendly names
            const siteNames = {
                'cooking.nytimes.com': 'NYT Cooking',
                'nytimes.com': 'New York Times',
                'seriouseats.com': 'Serious Eats',
                'bonappetit.com': 'Bon Appetit',
                'allrecipes.com': 'Allrecipes',
                'epicurious.com': 'Epicurious',
                'foodnetwork.com': 'Food Network',
                'food52.com': 'Food52',
                'tasteofsouthindia.com': 'Taste of South India',
                'simplyrecipes.com': 'Simply Recipes',
                'budgetbytes.com': 'Budget Bytes',
                'minimalistbaker.com': 'Minimalist Baker',
                'halfbakedharvest.com': 'Half Baked Harvest',
                'smittenkitchen.com': 'Smitten Kitchen',
                'thekitchn.com': 'The Kitchn',
                'delish.com': 'Delish',
                'tasty.co': 'Tasty',
                'eatingwell.com': 'EatingWell',
                'cookieandkate.com': 'Cookie and Kate',
                'loveandlemons.com': 'Love and Lemons',
                'indianhealthyrecipes.com': 'Indian Healthy Recipes',
                'hebbarskitchen.com': 'Hebbars Kitchen'
            };
            return siteNames[hostname] || hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
        } catch {
            return '';
        }
    }

    function toggleFavorite(id) {
        const recipes = getRecipes();
        const recipe = recipes.find(r => r.id === id);
        if (recipe) {
            recipe.favorite = !recipe.favorite;
            recipe.updatedAt = new Date().toISOString();
            saveRecipes(recipes);
            renderRecipes();
            showToast(recipe.favorite ? 'Added to favorites!' : 'Removed from favorites');
        }
    }

    function renderTagsFilter() {
        const tags = getAllTags();
        // Render tags as sidebar items
        elements.sidebarTags.innerHTML = tags.map(tag => `
            <button class="sidebar-item ${currentFilter === tag ? 'active' : ''}" data-filter="${escapeHtml(tag)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                    <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
                ${escapeHtml(tag)}
            </button>
        `).join('');

        // Update active state on all sidebar items
        updateSidebarActiveState();
    }

    function updateSidebarActiveState() {
        // Update Library section items
        document.querySelectorAll('.sidebar-item[data-filter]').forEach(item => {
            const filter = item.dataset.filter;
            item.classList.toggle('active', filter === currentFilter);
        });
    }

    // ============================================
    // Modal Functions
    // ============================================

    function openAddModal() {
        elements.modalTitle.textContent = 'Add Recipe';
        elements.recipeForm.reset();
        document.getElementById('recipe-id').value = '';
        elements.imagePreview.hidden = true;
        elements.recipeUrl.value = '';
        openModal(elements.modalRecipe);
        elements.recipeUrl.focus();
    }

    function openEditModal(id) {
        const recipe = getRecipeById(id);
        if (!recipe) return;

        elements.modalTitle.textContent = 'Edit Recipe';
        document.getElementById('recipe-id').value = recipe.id;
        document.getElementById('recipe-title').value = recipe.title || '';
        document.getElementById('recipe-image').value = recipe.image || '';
        document.getElementById('recipe-servings').value = recipe.servings || '';
        document.getElementById('recipe-prep-time').value = recipe.prepTime || '';
        document.getElementById('recipe-cook-time').value = recipe.cookTime || '';
        document.getElementById('recipe-tags').value = (recipe.tags || []).join(', ');
        document.getElementById('recipe-ingredients').value = recipe.ingredients || '';
        document.getElementById('recipe-instructions').value = recipe.instructions || '';
        document.getElementById('recipe-notes').value = recipe.notes || '';
        document.getElementById('recipe-source').value = recipe.source || '';

        if (recipe.image) {
            elements.imagePreview.style.backgroundImage = `url(${recipe.image})`;
            elements.imagePreview.hidden = false;
        } else {
            elements.imagePreview.hidden = true;
        }

        openModal(elements.modalRecipe);
    }

    function openViewModal(id) {
        const recipe = getRecipeById(id);
        if (!recipe) return;

        currentViewingRecipe = recipe;

        document.getElementById('view-title').textContent = recipe.title;

        // Image
        const viewImage = document.getElementById('view-image');
        if (recipe.image) {
            viewImage.style.backgroundImage = `url(${recipe.image})`;
            viewImage.hidden = false;
        } else {
            viewImage.hidden = true;
        }

        // Meta
        const metaParts = [];
        if (recipe.servings) metaParts.push(`<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>Serves ${escapeHtml(recipe.servings)}</span>`);
        if (recipe.prepTime) metaParts.push(`<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Prep: ${escapeHtml(recipe.prepTime)}</span>`);
        if (recipe.cookTime) metaParts.push(`<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Cook: ${escapeHtml(recipe.cookTime)}</span>`);
        document.getElementById('view-meta').innerHTML = metaParts.join('');

        // Tags
        document.getElementById('view-tags').innerHTML = (recipe.tags || []).map(tag =>
            `<span class="view-tag">${escapeHtml(tag)}</span>`
        ).join('');

        // Ingredients
        const ingredients = (recipe.ingredients || '').split('\n').filter(Boolean);
        document.getElementById('view-ingredients').innerHTML = ingredients.map(ing =>
            `<li>${escapeHtml(ing)}</li>`
        ).join('');

        // Instructions
        document.getElementById('view-instructions').textContent = recipe.instructions || '';

        // Notes
        const notesSection = document.getElementById('view-notes-section');
        if (recipe.notes) {
            document.getElementById('view-notes').textContent = recipe.notes;
            notesSection.hidden = false;
        } else {
            notesSection.hidden = true;
        }

        // Source
        const sourceSection = document.getElementById('view-source-section');
        if (recipe.source) {
            document.getElementById('view-source').href = recipe.source;
            sourceSection.hidden = false;
        } else {
            sourceSection.hidden = true;
        }

        openModal(elements.modalView);
    }

    function setupBookmarklet() {
        // Create bookmarklet with embedded favicon for a nice icon in bookmark bar
        const appUrl = window.location.href.split('?')[0].split('#')[0];
        const bookmarkletCode = `javascript:(function(){window.open('${appUrl}?url='+encodeURIComponent(window.location.href),'_blank')})()`;
        elements.bookmarkletDrag.href = bookmarkletCode;
    }

    function openModal(modal) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';

        // Focus trap
        const focusable = modal.querySelectorAll('button, input, textarea, select, a[href]');
        if (focusable.length) {
            focusable[0].focus();
        }
    }

    function closeModal(modal) {
        modal.hidden = true;
        document.body.style.overflow = '';
        currentViewingRecipe = null;
    }

    function closeAllModals() {
        closeModal(elements.modalRecipe);
        closeModal(elements.modalView);
        closeModal(elements.modalBulkImport);
        closeModal(elements.modalFailedUrls);
    }

    // ============================================
    // Form Handling
    // ============================================

    function handleFormSubmit(e) {
        e.preventDefault();

        const id = document.getElementById('recipe-id').value;
        const recipe = {
            title: document.getElementById('recipe-title').value.trim(),
            image: document.getElementById('recipe-image').value.trim(),
            servings: document.getElementById('recipe-servings').value.trim(),
            prepTime: document.getElementById('recipe-prep-time').value.trim(),
            cookTime: document.getElementById('recipe-cook-time').value.trim(),
            tags: document.getElementById('recipe-tags').value
                .split(',')
                .map(t => t.trim())
                .filter(Boolean),
            ingredients: document.getElementById('recipe-ingredients').value.trim(),
            instructions: document.getElementById('recipe-instructions').value.trim(),
            notes: document.getElementById('recipe-notes').value.trim(),
            source: document.getElementById('recipe-source').value.trim()
        };

        if (id) {
            updateRecipe(id, recipe);
            showToast('Recipe updated!');
        } else {
            addRecipe(recipe);
            showToast('Recipe saved!');
        }

        closeModal(elements.modalRecipe);
        renderRecipes();
        renderTagsFilter();
    }

    async function handleFetchUrl() {
        const url = elements.recipeUrl.value.trim();
        if (!url) {
            showToast('Please enter a URL');
            return;
        }

        elements.btnFetchUrl.disabled = true;
        elements.btnFetchUrl.textContent = 'Fetching...';

        try {
            const recipe = await fetchRecipeFromUrl(url);

            // Populate form
            document.getElementById('recipe-title').value = recipe.title || '';
            document.getElementById('recipe-image').value = recipe.image || '';
            document.getElementById('recipe-servings').value = recipe.servings || '';
            document.getElementById('recipe-prep-time').value = recipe.prepTime || '';
            document.getElementById('recipe-cook-time').value = recipe.cookTime || '';
            document.getElementById('recipe-tags').value = (recipe.tags || []).join(', ');
            document.getElementById('recipe-ingredients').value = recipe.ingredients || '';
            document.getElementById('recipe-instructions').value = recipe.instructions || '';
            document.getElementById('recipe-source').value = recipe.source || url;

            // Show image preview
            if (recipe.image) {
                elements.imagePreview.style.backgroundImage = `url(${recipe.image})`;
                elements.imagePreview.hidden = false;
            }

            showToast('Recipe fetched! Review and save.');
        } catch (error) {
            showToast(error.message);
        } finally {
            elements.btnFetchUrl.disabled = false;
            elements.btnFetchUrl.textContent = 'Fetch';
        }
    }

    // ============================================
    // Search & Filter
    // ============================================

    function handleSearch(e) {
        currentSearch = e.target.value;
        renderRecipes();
    }

    function handleSidebarFilter(filter) {
        currentFilter = filter;
        updateSidebarActiveState();
        renderRecipes();
    }

    // ============================================
    // Import/Export
    // ============================================

    function exportRecipes() {
        const recipes = getRecipes();
        if (recipes.length === 0) {
            showToast('No recipes to export');
            return;
        }

        const data = JSON.stringify(recipes, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `ivys-recipes-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        showToast('Recipes exported!');
    }

    async function importRecipes(e) {
        const file = e.target.files[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();

        try {
            let recipes = [];

            if (fileName.endsWith('.paprikarecipes')) {
                // Paprika format - gzip containing recipe JSON files
                recipes = await importPaprikaFile(file);
            } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
                // Paprika HTML export or other HTML
                recipes = await importHtmlFile(file);
            } else {
                // Assume JSON (Ivy's Recipes format)
                recipes = await importJsonFile(file);
            }

            if (recipes.length === 0) {
                showToast('No recipes found in file');
                return;
            }

            const existing = getRecipes();
            const existingTitles = new Set(existing.map(r => r.title.toLowerCase()));

            let added = 0;
            recipes.forEach(recipe => {
                // Skip duplicates by title
                if (!existingTitles.has(recipe.title.toLowerCase())) {
                    recipe.id = generateId();
                    recipe.createdAt = new Date().toISOString();
                    recipe.updatedAt = recipe.createdAt;
                    existing.unshift(recipe);
                    existingTitles.add(recipe.title.toLowerCase());
                    added++;
                }
            });

            saveRecipes(existing);
            renderRecipes();
            renderTagsFilter();
            showToast(`Imported ${added} recipe${added !== 1 ? 's' : ''}`);
        } catch (error) {
            showToast('Error importing: ' + error.message);
            console.error('Import error:', error);
        }

        // Reset input
        e.target.value = '';
    }

    function importJsonFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    resolve(Array.isArray(data) ? data : [data]);
                } catch (e) {
                    reject(new Error('Invalid JSON file'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    async function importPaprikaFile(file) {
        // Paprika files are zip archives containing gzip-compressed JSON recipe files
        if (!window.JSZip) {
            // Load JSZip dynamically if not available
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        if (!window.pako) {
            // Load pako for gzip decompression
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');
        }

        const arrayBuffer = await file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(arrayBuffer);

        const recipes = [];
        const filePromises = [];

        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                filePromises.push(
                    zipEntry.async('uint8array').then(data => {
                        try {
                            // Try to decompress with gzip first (Paprika files are gzip-compressed inside)
                            let content;
                            try {
                                const decompressed = window.pako.inflate(data);
                                content = new TextDecoder().decode(decompressed);
                            } catch {
                                // If decompression fails, try as plain text
                                content = new TextDecoder().decode(data);
                            }
                            const paprikaRecipe = JSON.parse(content);
                            recipes.push(convertPaprikaRecipe(paprikaRecipe));
                        } catch (e) {
                            console.warn('Failed to parse recipe:', relativePath, e.message);
                        }
                    })
                );
            }
        });

        await Promise.all(filePromises);
        return recipes;
    }

    function convertPaprikaRecipe(p) {
        // Handle categories - could be string, array, or comma-separated
        let tags = [];
        if (p.categories) {
            if (Array.isArray(p.categories)) {
                tags = p.categories;
            } else {
                tags = String(p.categories).split(/[,;]/).map(t => t.trim());
            }
        }
        // Properly capitalize tags
        tags = tags.filter(Boolean).map(t =>
            t.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
        );

        return {
            title: p.name || 'Untitled Recipe',
            image: p.image_url || p.photo_url || p.photo || '',
            servings: p.servings || '',
            prepTime: p.prep_time || '',
            cookTime: p.cook_time || p.total_time || '',
            ingredients: p.ingredients || '',
            instructions: p.directions || p.instructions || '',
            notes: p.notes || '',
            source: p.source_url || p.source || '',
            tags: tags
        };
    }

    function importHtmlFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(event.target.result, 'text/html');

                    // Try to find Paprika-style recipe blocks
                    const recipes = [];
                    const recipeBlocks = doc.querySelectorAll('.recipe, [class*="recipe"]');

                    if (recipeBlocks.length > 0) {
                        recipeBlocks.forEach(block => {
                            const recipe = extractRecipeFromHtml(block);
                            if (recipe.title) recipes.push(recipe);
                        });
                    } else {
                        // Try to extract single recipe from the whole document
                        const recipe = extractRecipeFromHtml(doc.body);
                        if (recipe.title) recipes.push(recipe);
                    }

                    resolve(recipes);
                } catch (e) {
                    reject(new Error('Failed to parse HTML'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    function extractRecipeFromHtml(element) {
        const getText = (selectors) => {
            for (const sel of selectors) {
                const el = element.querySelector(sel);
                if (el) return el.textContent.trim();
            }
            return '';
        };

        return {
            title: getText(['h1', 'h2', '.title', '.recipe-title', '[class*="title"]']),
            ingredients: getText(['.ingredients', '[class*="ingredient"]']),
            instructions: getText(['.directions', '.instructions', '[class*="direction"]', '[class*="instruction"]']),
            notes: getText(['.notes', '[class*="note"]']),
            prepTime: getText(['.prep-time', '[class*="prep"]']),
            cookTime: getText(['.cook-time', '[class*="cook"]']),
            servings: getText(['.servings', '.yield', '[class*="serving"]', '[class*="yield"]']),
            source: '',
            image: '',
            tags: []
        };
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async function importBulkUrls(urlText) {
        const urls = urlText.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('http'));

        if (urls.length === 0) {
            showToast('No valid URLs found');
            return;
        }

        // Show loading state
        const loadingEl = document.createElement('div');
        loadingEl.id = 'bulk-import-loading';
        loadingEl.innerHTML = `
            <div class="loading-overlay">
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <p id="loading-status">Starting import...</p>
                    <p id="loading-progress">0 / ${urls.length}</p>
                    <p id="loading-success" style="color: #81b29a; font-size: 0.875rem;">0 added</p>
                </div>
            </div>
        `;
        document.body.appendChild(loadingEl);

        const statusEl = document.getElementById('loading-status');
        const progressEl = document.getElementById('loading-progress');
        const successEl = document.getElementById('loading-success');

        let successCount = 0;
        let skippedCount = 0;
        let failedUrls = [];
        const existing = getRecipes();
        const existingTitles = new Set(existing.map(r => r.title.toLowerCase()));

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            progressEl.textContent = `${i + 1} / ${urls.length}`;

            // Show which site we're fetching
            let hostname = 'unknown';
            try {
                hostname = new URL(url).hostname.replace('www.', '');
                statusEl.textContent = `Fetching from ${hostname}...`;
            } catch {
                statusEl.textContent = `Fetching recipe ${i + 1}...`;
            }

            try {
                const recipe = await fetchRecipeFromUrl(url);
                if (recipe.title && !existingTitles.has(recipe.title.toLowerCase())) {
                    recipe.id = generateId();
                    recipe.createdAt = new Date().toISOString();
                    recipe.updatedAt = recipe.createdAt;
                    existing.unshift(recipe);
                    existingTitles.add(recipe.title.toLowerCase());
                    successCount++;
                    successEl.textContent = `${successCount} added`;
                    statusEl.textContent = `Added: ${recipe.title.substring(0, 30)}${recipe.title.length > 30 ? '...' : ''}`;

                    // Save after each successful add so we don't lose progress
                    saveRecipes(existing);
                } else if (recipe.title) {
                    skippedCount++;
                    statusEl.textContent = `Skipped duplicate: ${recipe.title.substring(0, 25)}...`;
                } else {
                    failedUrls.push({ url, reason: 'No recipe data found' });
                    statusEl.textContent = `No recipe found on ${hostname}`;
                }
            } catch (e) {
                console.warn('Failed to fetch:', url, e.message);
                failedUrls.push({ url, reason: e.message });
                statusEl.textContent = `Failed: ${hostname} - ${e.message.substring(0, 20)}`;
            }

            // Small delay between requests
            await new Promise(r => setTimeout(r, 300));
        }

        // Show completion status before removing overlay
        statusEl.textContent = 'Import complete!';
        progressEl.textContent = `Done`;
        await new Promise(r => setTimeout(r, 1000));

        // Remove loading overlay
        loadingEl.remove();

        // Update UI
        renderRecipes();
        renderTagsFilter();

        // Show detailed result
        let message = '';
        if (successCount > 0) {
            message = `Imported ${successCount} recipe${successCount !== 1 ? 's' : ''}`;
        }
        if (skippedCount > 0) {
            message += message ? `, ${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''} skipped` : `${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''} skipped`;
        }
        if (failedUrls.length > 0) {
            message += message ? `, ${failedUrls.length} failed` : `${failedUrls.length} failed`;
        }
        if (!message) {
            message = 'No recipes could be imported';
        }
        showToast(message);

        // Show failed URLs in modal
        if (failedUrls.length > 0) {
            showFailedUrlsModal(failedUrls);
        }
    }

    function showFailedUrlsModal(failedUrls) {
        elements.failedUrlsList.innerHTML = failedUrls.map(({ url }) => {
            let hostname = 'unknown';
            try {
                hostname = new URL(url).hostname.replace('www.', '');
            } catch {}
            return `
                <div class="failed-url-item">
                    <a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(url)}">${hostname}</a>
                    <div class="failed-url-actions">
                        <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${escapeHtml(url)}');this.textContent='Copied!'">Copy</button>
                        <button class="btn btn-primary" data-url="${escapeHtml(url)}" onclick="window.addManualRecipeFromUrl(this.dataset.url)">Add Manually</button>
                    </div>
                </div>
            `;
        }).join('');
        openModal(elements.modalFailedUrls);
    }

    // Global function to add recipe manually from failed URL
    window.addManualRecipeFromUrl = function(url) {
        closeModal(elements.modalFailedUrls);
        openAddModal();
        elements.recipeUrl.value = url;
    };

    // ============================================
    // Utility Functions
    // ============================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function capitalizeTag(tag) {
        if (!tag) return '';
        // Handle multi-word tags (e.g., "instant pot" -> "Instant Pot")
        return tag.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    function showToast(message) {
        elements.toastMessage.textContent = message;
        elements.toast.hidden = false;

        setTimeout(() => {
            elements.toast.hidden = true;
        }, 3000);
    }

    // ============================================
    // URL Parameters (for bookmarklet)
    // ============================================

    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        let url = params.get('url');
        const text = params.get('text');
        const title = params.get('title');

        // Some apps share the URL in the 'text' field
        if (!url && text) {
            // Try to extract URL from text
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                url = urlMatch[0];
            }
        }

        if (url) {
            // Clear the URL parameters
            window.history.replaceState({}, '', window.location.pathname);

            // Open add modal with URL
            openAddModal();
            elements.recipeUrl.value = url;
            handleFetchUrl();
        }
    }

    // ============================================
    // PWA Install
    // ============================================

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        elements.btnInstall.hidden = false;
    });

    function handleInstall() {
        if (!deferredInstallPrompt) return;

        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then((choice) => {
            if (choice.outcome === 'accepted') {
                showToast('App installed!');
            }
            deferredInstallPrompt = null;
            elements.btnInstall.hidden = true;
        });
    }

    // ============================================
    // Event Listeners
    // ============================================

    function setupEventListeners() {
        // Add recipe buttons
        elements.btnAddRecipe.addEventListener('click', openAddModal);
        elements.btnAddFirst.addEventListener('click', openAddModal);

        // Menu dropdown
        elements.btnMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.dropdownMenu.hidden = !elements.dropdownMenu.hidden;
        });

        // Close dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!elements.dropdownMenu.contains(e.target) && e.target !== elements.btnMenu) {
                elements.dropdownMenu.hidden = true;
            }
        });

        // Dropdown actions
        elements.btnImport.addEventListener('click', () => {
            elements.dropdownMenu.hidden = true;
            elements.importFile.click();
        });
        elements.btnBulkImport.addEventListener('click', () => {
            elements.dropdownMenu.hidden = true;
            elements.bulkUrls.value = '';
            openModal(elements.modalBulkImport);
        });
        elements.btnDoBulkImport.addEventListener('click', async () => {
            const urls = elements.bulkUrls.value;
            closeModal(elements.modalBulkImport);
            await importBulkUrls(urls);
        });
        elements.btnExport.addEventListener('click', () => {
            elements.dropdownMenu.hidden = true;
            exportRecipes();
        });
        elements.btnInstall.addEventListener('click', () => {
            elements.dropdownMenu.hidden = true;
            handleInstall();
        });
        elements.importFile.addEventListener('change', importRecipes);

        // Inline bookmarklet - prevent navigation when clicked (it's meant to be dragged)
        elements.bookmarkletDrag.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Drag this button to your bookmarks bar!');
        });

        // Sidebar search
        elements.sidebarSearch.addEventListener('input', handleSearch);

        // Sidebar navigation - Library section
        document.querySelectorAll('.sidebar-item[data-filter]').forEach(item => {
            item.addEventListener('click', () => {
                handleSidebarFilter(item.dataset.filter);
            });
        });

        // Sidebar tags - use event delegation since tags are rendered dynamically
        elements.sidebarTags.addEventListener('click', (e) => {
            const item = e.target.closest('.sidebar-item');
            if (item && item.dataset.filter) {
                handleSidebarFilter(item.dataset.filter);
            }
        });

        // Form
        elements.recipeForm.addEventListener('submit', handleFormSubmit);
        elements.btnFetchUrl.addEventListener('click', handleFetchUrl);

        // Image preview
        document.getElementById('recipe-image').addEventListener('input', (e) => {
            const url = e.target.value.trim();
            if (url) {
                elements.imagePreview.style.backgroundImage = `url(${url})`;
                elements.imagePreview.hidden = false;
            } else {
                elements.imagePreview.hidden = true;
            }
        });

        // Tag suggestions
        document.querySelectorAll('.tag-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                const tagsInput = document.getElementById('recipe-tags');
                const currentTags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
                if (!currentTags.includes(btn.dataset.tag)) {
                    currentTags.push(btn.dataset.tag);
                    tagsInput.value = currentTags.join(', ');
                }
            });
        });

        // View modal actions
        document.getElementById('btn-edit-recipe').addEventListener('click', () => {
            if (currentViewingRecipe) {
                closeModal(elements.modalView);
                openEditModal(currentViewingRecipe.id);
            }
        });

        document.getElementById('btn-delete-recipe').addEventListener('click', () => {
            if (currentViewingRecipe && confirm('Delete this recipe?')) {
                deleteRecipe(currentViewingRecipe.id);
                closeModal(elements.modalView);
                renderRecipes();
                renderTagsFilter();
                showToast('Recipe deleted');
            }
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
            el.addEventListener('click', closeAllModals);
        });

        // Prevent closing when clicking modal content
        document.querySelectorAll('.modal-content').forEach(el => {
            el.addEventListener('click', (e) => e.stopPropagation());
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAllModals();
            }

            // Ctrl/Cmd + K for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                elements.sidebarSearch.focus();
            }
        });
    }

    // ============================================
    // Service Worker Registration
    // ============================================

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js')
                    .then(registration => {
                        console.log('SW registered:', registration.scope);
                    })
                    .catch(error => {
                        console.log('SW registration failed:', error);
                    });
            });
        }
    }

    // ============================================
    // Initialize
    // ============================================

    function init() {
        renderRecipes();
        renderTagsFilter();
        setupEventListeners();
        setupBookmarklet();
        checkUrlParams();
        registerServiceWorker();
    }

    // Start the app
    init();
})();
