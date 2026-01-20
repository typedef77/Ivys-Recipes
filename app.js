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

    async function fetchRecipeFromUrl(url) {
        // We'll use a CORS proxy or direct fetch with recipe schema extraction
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('Failed to fetch URL');

            const html = await response.text();
            return parseRecipeFromHtml(html, url);
        } catch (error) {
            console.error('Error fetching recipe:', error);
            throw new Error('Could not fetch recipe from URL. You may need to enter it manually.');
        }
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
            recipe.tags = categories.map(c => c.trim()).filter(Boolean);
        }

        if (data.recipeCuisine) {
            const cuisines = Array.isArray(data.recipeCuisine)
                ? data.recipeCuisine
                : [data.recipeCuisine];
            recipe.tags = [...recipe.tags, ...cuisines.map(c => c.trim())];
        }
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

        // Image
        const img = doc.querySelector('.recipe-image img') ||
                    doc.querySelector('[class*="recipe"] img') ||
                    doc.querySelector('article img') ||
                    doc.querySelector('main img');
        recipe.image = img?.src || '';

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

    // ============================================
    // UI Components
    // ============================================

    // DOM Elements
    const elements = {
        recipeGrid: document.getElementById('recipe-grid'),
        emptyState: document.getElementById('empty-state'),
        noResults: document.getElementById('no-results'),
        searchInput: document.getElementById('search-input'),
        btnClearSearch: document.getElementById('btn-clear-search'),
        tagsFilter: document.getElementById('tags-filter'),
        btnAddRecipe: document.getElementById('btn-add-recipe'),
        btnAddFirst: document.getElementById('btn-add-first'),
        btnMenu: document.getElementById('btn-menu'),
        dropdownMenu: document.getElementById('dropdown-menu'),
        modalRecipe: document.getElementById('modal-recipe'),
        modalView: document.getElementById('modal-view'),
        modalBookmarklet: document.getElementById('modal-bookmarklet'),
        recipeForm: document.getElementById('recipe-form'),
        recipeUrl: document.getElementById('recipe-url'),
        btnFetchUrl: document.getElementById('btn-fetch-url'),
        modalTitle: document.getElementById('modal-title'),
        imagePreview: document.getElementById('image-preview'),
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toast-message'),
        btnImport: document.getElementById('btn-import'),
        btnExport: document.getElementById('btn-export'),
        btnBookmarklet: document.getElementById('btn-bookmarklet'),
        btnInstall: document.getElementById('btn-install'),
        importFile: document.getElementById('import-file'),
        bookmarkletLink: document.getElementById('bookmarklet-link')
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

        // Apply tag filter
        if (currentFilter !== 'all') {
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

        // Image or placeholder
        let imageHtml;
        if (recipe.image) {
            imageHtml = `<img src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.title)}" class="recipe-card-image" loading="lazy" onerror="this.outerHTML='<div class=\\'recipe-card-placeholder\\'><svg width=\\'48\\' height=\\'48\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><path d=\\'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5\\'></path></svg></div>'">`;
        } else {
            imageHtml = `<div class="recipe-card-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
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

        // Tags
        const tagsHtml = (recipe.tags || []).slice(0, 3).map(tag =>
            `<span class="recipe-card-tag">${escapeHtml(tag)}</span>`
        ).join('');

        card.innerHTML = `
            ${imageHtml}
            <div class="recipe-card-content">
                <h3 class="recipe-card-title">${escapeHtml(recipe.title)}</h3>
                ${metaParts.length ? `<div class="recipe-card-meta">${metaParts.join('')}</div>` : ''}
                ${tagsHtml ? `<div class="recipe-card-tags">${tagsHtml}</div>` : ''}
            </div>
        `;

        card.addEventListener('click', () => openViewModal(recipe.id));

        return card;
    }

    function renderTagsFilter() {
        const tags = getAllTags();
        elements.tagsFilter.innerHTML = `
            <button class="tag-chip ${currentFilter === 'all' ? 'active' : ''}" data-tag="all">All Recipes</button>
            ${tags.map(tag => `
                <button class="tag-chip ${currentFilter === tag ? 'active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
            `).join('')}
        `;
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

    function openBookmarkletModal() {
        // Create the bookmarklet
        const appUrl = window.location.href.split('?')[0].split('#')[0];
        const bookmarkletCode = `javascript:(function(){window.open('${appUrl}?url='+encodeURIComponent(window.location.href),'_blank')})()`;
        elements.bookmarkletLink.href = bookmarkletCode;
        openModal(elements.modalBookmarklet);
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
        closeModal(elements.modalBookmarklet);
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
        elements.btnClearSearch.hidden = !currentSearch;
        renderRecipes();
    }

    function handleTagFilter(e) {
        if (!e.target.classList.contains('tag-chip')) return;

        currentFilter = e.target.dataset.tag;

        // Update active state
        elements.tagsFilter.querySelectorAll('.tag-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.tag === currentFilter);
        });

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

    function importRecipes(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (!Array.isArray(imported)) {
                    throw new Error('Invalid format');
                }

                const existing = getRecipes();
                const existingIds = new Set(existing.map(r => r.id));

                let added = 0;
                imported.forEach(recipe => {
                    if (!existingIds.has(recipe.id)) {
                        recipe.id = generateId();
                        existing.unshift(recipe);
                        added++;
                    }
                });

                saveRecipes(existing);
                renderRecipes();
                renderTagsFilter();
                showToast(`Imported ${added} recipe${added !== 1 ? 's' : ''}`);
            } catch (error) {
                showToast('Error importing recipes');
                console.error('Import error:', error);
            }
        };
        reader.readAsText(file);

        // Reset input
        e.target.value = '';
    }

    // ============================================
    // Utility Functions
    // ============================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        const url = params.get('url');

        if (url) {
            // Clear the URL parameter
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
        document.addEventListener('click', () => {
            elements.dropdownMenu.hidden = true;
        });

        // Dropdown actions
        elements.btnImport.addEventListener('click', () => elements.importFile.click());
        elements.btnExport.addEventListener('click', exportRecipes);
        elements.btnBookmarklet.addEventListener('click', openBookmarkletModal);
        elements.btnInstall.addEventListener('click', handleInstall);
        elements.importFile.addEventListener('change', importRecipes);

        // Prevent bookmarklet link from navigating when clicked (it's meant to be dragged)
        elements.bookmarkletLink.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Drag this button to your bookmarks bar!');
        });

        // Search
        elements.searchInput.addEventListener('input', handleSearch);
        elements.btnClearSearch.addEventListener('click', () => {
            elements.searchInput.value = '';
            currentSearch = '';
            elements.btnClearSearch.hidden = true;
            renderRecipes();
        });

        // Tags filter
        elements.tagsFilter.addEventListener('click', handleTagFilter);

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
                elements.searchInput.focus();
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
        checkUrlParams();
        registerServiceWorker();
    }

    // Start the app
    init();
})();
