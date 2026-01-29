// Ivy's Recipes - Recipe Manager App
// A simple, beautiful recipe collection app

(function() {
    'use strict';

    // ============================================
    // Firebase Configuration
    // ============================================

    const firebaseConfig = {
        apiKey: "AIzaSyApw7nwjdtJsZ1f99esiYp-OYlaNX8dHVs",
        authDomain: "ivys-recipes.firebaseapp.com",
        databaseURL: "https://ivys-recipes-default-rtdb.firebaseio.com",
        projectId: "ivys-recipes",
        storageBucket: "ivys-recipes.firebasestorage.app",
        messagingSenderId: "665511694674",
        appId: "1:665511694674:web:e05cd29239028375492a8b",
        measurementId: "G-1VRYNEZT4T"
    };

    // Initialize Firebase
    let firebaseApp = null;
    let database = null;
    let storage = null;
    let useCloud = false;

    function initFirebase() {
        try {
            if (typeof firebase !== 'undefined') {
                firebaseApp = firebase.initializeApp(firebaseConfig);
                database = firebase.database();
                storage = firebase.storage();
                useCloud = true;
                console.log('Firebase initialized successfully');
                return true;
            }
        } catch (e) {
            console.warn('Firebase initialization failed, using local storage:', e);
        }
        return false;
    }

    // ============================================
    // Storage & Data Management
    // ============================================

    const STORAGE_KEY = 'ivys_recipes';
    const FOLDERS_KEY = 'ivys_folders';
    const AUTH_KEY = 'ivys_auth';
    const SUGGESTED_FOLDER_NAME = 'Suggested Recipes';
    const IVY_PASSWORD = 'Ilikeivysrecipes1!';

    // Cloud sync state
    let cloudRecipes = null;
    let cloudFolders = null;
    let lastSyncTime = 0;

    // User state
    let isIvy = false;

    function checkAuth() {
        const authData = localStorage.getItem(AUTH_KEY);
        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                isIvy = parsed.isIvy === true;
                return true; // Auth has been done before
            } catch (e) {
                return false;
            }
        }
        return false; // Never authed
    }

    function setAuth(isIvyUser) {
        isIvy = isIvyUser;
        localStorage.setItem(AUTH_KEY, JSON.stringify({ isIvy: isIvyUser, timestamp: Date.now() }));
    }

    function getIsIvy() {
        return isIvy;
    }

    function getRecipes() {
        try {
            // Use cloud data if available, otherwise fall back to local
            if (cloudRecipes !== null) {
                return cloudRecipes;
            }
            const data = localStorage.getItem(STORAGE_KEY);
            let recipes = data ? JSON.parse(data) : [];
            return recipes;
        } catch (e) {
            console.error('Error reading recipes:', e);
            return [];
        }
    }

    // Load recipes from Firebase
    async function loadFromCloud() {
        if (!useCloud || !database) return false;

        try {
            const recipesRef = database.ref('recipes');
            const foldersRef = database.ref('folders');

            const [recipesSnapshot, foldersSnapshot] = await Promise.all([
                recipesRef.once('value'),
                foldersRef.once('value')
            ]);

            const recipesData = recipesSnapshot.val();
            const foldersData = foldersSnapshot.val();

            cloudRecipes = recipesData ? Object.values(recipesData) : [];
            cloudFolders = foldersData ? Object.values(foldersData) : [];

            // Also save to local storage as cache
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudRecipes));
            localStorage.setItem(FOLDERS_KEY, JSON.stringify(cloudFolders));

            lastSyncTime = Date.now();
            console.log('Loaded from cloud:', cloudRecipes.length, 'recipes');
            return true;
        } catch (e) {
            console.error('Error loading from cloud:', e);
            return false;
        }
    }

    // Save recipes to Firebase
    async function saveToCloud(recipes) {
        if (!useCloud || !database) return false;

        try {
            updateCloudSyncStatus('syncing');
            const recipesRef = database.ref('recipes');
            // Convert array to object with IDs as keys
            const recipesObj = {};
            recipes.forEach(r => {
                recipesObj[r.id] = r;
            });
            await recipesRef.set(recipesObj);
            cloudRecipes = recipes;
            updateCloudSyncStatus('synced');
            return true;
        } catch (e) {
            console.error('Error saving to cloud:', e);
            updateCloudSyncStatus('offline');
            return false;
        }
    }

    // Save folders to Firebase
    async function saveFoldersToCloud(folders) {
        if (!useCloud || !database) return false;

        try {
            const foldersRef = database.ref('folders');
            const foldersObj = {};
            folders.forEach(f => {
                foldersObj[f.id] = f;
            });
            await foldersRef.set(foldersObj);
            cloudFolders = folders;
            return true;
        } catch (e) {
            console.error('Error saving folders to cloud:', e);
            return false;
        }
    }

    // Force sync all local data to cloud
    async function syncLocalToCloud() {
        if (!useCloud || !database) {
            console.warn('Cloud sync not available');
            showToast('Cloud sync not available');
            return false;
        }

        try {
            console.log('Starting sync of local data to cloud...');
            showToast('Syncing recipes to cloud...');

            // Get local data
            const localRecipesData = localStorage.getItem(STORAGE_KEY);
            const localFoldersData = localStorage.getItem(FOLDERS_KEY);

            const localRecipes = localRecipesData ? JSON.parse(localRecipesData) : [];
            const localFolders = localFoldersData ? JSON.parse(localFoldersData) : [];

            // Upload to cloud
            const recipesSuccess = await saveToCloud(localRecipes);
            const foldersSuccess = await saveFoldersToCloud(localFolders);

            if (recipesSuccess && foldersSuccess) {
                console.log(`Successfully synced ${localRecipes.length} recipes and ${localFolders.length} folders to cloud`);
                showToast(`Synced ${localRecipes.length} recipes to cloud!`);
                return true;
            } else {
                throw new Error('Failed to sync some data');
            }
        } catch (e) {
            console.error('Error syncing local data to cloud:', e);
            showToast('Error syncing to cloud');
            return false;
        }
    }

    // Listen for real-time updates from Firebase
    function setupCloudListeners() {
        if (!useCloud || !database) return;

        database.ref('recipes').on('value', (snapshot) => {
            const data = snapshot.val();
            cloudRecipes = data ? Object.values(data) : [];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudRecipes));
            // Update sync status
            updateCloudSyncStatus('synced');
            // Only re-render if not during our own save
            if (Date.now() - lastSyncTime > 1000) {
                renderRecipes();
                renderTagsFilter();
            }
        });

        database.ref('folders').on('value', (snapshot) => {
            const data = snapshot.val();
            cloudFolders = data ? Object.values(data) : [];
            localStorage.setItem(FOLDERS_KEY, JSON.stringify(cloudFolders));
            if (Date.now() - lastSyncTime > 1000) {
                renderFolders();
            }
        });
    }

    // Cloud sync status management
    function updateCloudSyncStatus(status) {
        if (!elements.btnCloudSync) return;

        elements.btnCloudSync.classList.remove('synced', 'syncing', 'offline');
        elements.btnCloudSync.classList.add(status);

        const tooltips = {
            synced: 'Cloud sync active - recipes synced',
            syncing: 'Syncing recipes to cloud...',
            offline: 'Cloud sync offline - using local storage'
        };

        elements.btnCloudSync.title = tooltips[status] || '';
        elements.btnCloudSync.setAttribute('aria-label', tooltips[status] || '');
    }

    function initCloudSyncButton() {
        if (!elements.btnCloudSync) return;

        if (useCloud) {
            elements.btnCloudSync.hidden = false;
            updateCloudSyncStatus('synced');

            // Add click handler for manual sync
            elements.btnCloudSync.addEventListener('click', async () => {
                updateCloudSyncStatus('syncing');
                await syncLocalToCloud();
                updateCloudSyncStatus('synced');
            });
        } else {
            elements.btnCloudSync.hidden = false;
            updateCloudSyncStatus('offline');
        }
    }

    function cleanTags(tags) {
        if (!tags || !Array.isArray(tags)) return [];
        const allTags = [];
        tags.forEach(tag => {
            if (typeof tag === 'string') {
                const parts = tag.split(/[,;\/]/).map(t => t.trim()).filter(Boolean);
                allTags.push(...parts);
            }
        });
        const seen = new Map();
        allTags.forEach(tag => {
            const lower = tag.toLowerCase().trim();
            if (lower && !seen.has(lower)) {
                seen.set(lower, capitalizeTag(lower));
            }
        });
        return Array.from(seen.values());
    }

    function getFolders() {
        try {
            // Use cloud data if available
            if (cloudFolders !== null) {
                return cloudFolders;
            }
            const data = localStorage.getItem(FOLDERS_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error reading folders:', e);
            return [];
        }
    }

    async function saveFolders(folders) {
        try {
            localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
            // Also save to cloud and wait for completion
            const cloudSaveSuccess = await saveFoldersToCloud(folders);
            if (!cloudSaveSuccess && useCloud) {
                console.warn('Cloud save failed for folders, data only saved locally');
            }
        } catch (e) {
            console.error('Error saving folders:', e);
        }
    }

    function addFolder(name, isSystem = false) {
        const folders = getFolders();
        if (folders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
            return folders.find(f => f.name.toLowerCase() === name.toLowerCase());
        }
        const folder = {
            id: generateId(),
            name: name,
            createdAt: new Date().toISOString(),
            isSystem: isSystem
        };
        folders.push(folder);
        saveFolders(folders);
        return folder;
    }

    function getOrCreateSuggestedFolder() {
        const folders = getFolders();
        let suggestedFolder = folders.find(f => f.name === SUGGESTED_FOLDER_NAME);
        if (!suggestedFolder) {
            suggestedFolder = addFolder(SUGGESTED_FOLDER_NAME, true);
        }
        return suggestedFolder;
    }

    function addRecipeToFolder(recipeId, folderId) {
        const recipes = getRecipes();
        const recipe = recipes.find(r => r.id === recipeId);
        if (recipe) {
            if (!recipe.folders) recipe.folders = [];
            if (!recipe.folders.includes(folderId)) {
                recipe.folders.push(folderId);
                saveRecipes(recipes, 'Added to folder');
            }
        }
    }

    function removeRecipeFromFolder(recipeId, folderId) {
        const recipes = getRecipes();
        const recipe = recipes.find(r => r.id === recipeId);
        if (recipe && recipe.folders) {
            recipe.folders = recipe.folders.filter(f => f !== folderId);
            saveRecipes(recipes, 'Removed from folder');
        }
    }

    async function saveRecipes(recipes, successMessage = null) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
            // Also save to cloud and wait for completion
            lastSyncTime = Date.now();
            const cloudSaveSuccess = await saveToCloud(recipes);
            if (cloudSaveSuccess && successMessage) {
                showToast(successMessage + ' and synced to cloud!');
            } else if (!cloudSaveSuccess && useCloud) {
                console.warn('Cloud save failed, data only saved locally');
                showToast(successMessage ? successMessage + ' (saved locally only)' : 'Warning: Changes saved locally only');
            } else if (successMessage) {
                showToast(successMessage);
            }
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

    function addRecipe(recipe, showSyncToast = true) {
        try {
            const recipes = getRecipes();
            recipe.id = generateId();
            recipe.createdAt = new Date().toISOString();
            recipe.updatedAt = recipe.createdAt;
            recipes.unshift(recipe);

            // Try to save - this may fail if localStorage is full
            const saveResult = saveRecipesWithCheck(recipes, showSyncToast);
            if (!saveResult) {
                return null;
            }
            return recipe;
        } catch (e) {
            console.error('Error adding recipe:', e);
            return null;
        }
    }

    function saveRecipesWithCheck(recipes, showSyncToast = false) {
        try {
            const data = JSON.stringify(recipes);
            localStorage.setItem(STORAGE_KEY, data);
            // Also sync to cloud after successful local save
            lastSyncTime = Date.now();
            saveToCloud(recipes).then(success => {
                if (success && showSyncToast) {
                    showToast('Recipe added and synced to cloud!');
                } else if (!success && useCloud) {
                    console.warn('Cloud sync failed after adding recipe');
                    if (showSyncToast) {
                        showToast('Recipe added locally (cloud sync failed)');
                    }
                }
            });
            return true;
        } catch (e) {
            console.error('Error saving recipes:', e);
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                showToast('Storage full! Try removing some recipes or using smaller images.');
            }
            return false;
        }
    }

    function updateRecipe(id, updates) {
        const recipes = getRecipes();
        const index = recipes.findIndex(r => r.id === id);
        if (index !== -1) {
            recipes[index] = { ...recipes[index], ...updates, updatedAt: new Date().toISOString() };
            saveRecipes(recipes, 'Recipe updated');
            return recipes[index];
        }
        return null;
    }

    async function deleteRecipeById(id) {
        const recipes = getRecipes();
        const recipe = recipes.find(r => r.id === id);

        // Delete photos from Firebase Storage if available
        if (recipe && useCloud && storage) {
            // Delete cover image
            if (recipe.image && !recipe.image.startsWith('data:')) {
                await deletePhotoFromStorage(recipe.image);
            }

            // Delete recipe photos
            if (recipe.photos && Array.isArray(recipe.photos)) {
                for (const photo of recipe.photos) {
                    if (photo.dataUrl && !photo.dataUrl.startsWith('data:')) {
                        await deletePhotoFromStorage(photo.dataUrl);
                    }
                    if (photo.storageUrl && !photo.storageUrl.startsWith('data:')) {
                        await deletePhotoFromStorage(photo.storageUrl);
                    }
                }
            }
        }

        const filtered = recipes.filter(r => r.id !== id);
        saveRecipes(filtered, 'Recipe deleted');
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
                const timeout = setTimeout(() => controller.abort(), 15000);

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
                continue;
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
            source: '',
            url: sourceUrl,
            tags: []
        };

        const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const recipeData = findRecipeInJsonLd(data);
                if (recipeData) {
                    extractFromJsonLd(recipeData, recipe);
                    if (!recipe.image) {
                        recipe.image = findBestImage(doc);
                    }
                    if (recipe.title) return recipe;
                }
            } catch (e) {
                continue;
            }
        }

        const microdataRecipe = doc.querySelector('[itemtype*="Recipe"]');
        if (microdataRecipe) {
            extractFromMicrodata(microdataRecipe, recipe);
            if (!recipe.image) {
                recipe.image = findBestImage(doc);
            }
            if (recipe.title) return recipe;
        }

        extractFromCommonSelectors(doc, recipe);

        // Final fallback: always try to find an image if none was extracted
        if (!recipe.image) {
            recipe.image = findBestImage(doc);
        }

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

        if (data.image) {
            if (typeof data.image === 'string') {
                recipe.image = data.image;
            } else if (Array.isArray(data.image)) {
                // Handle array of images - could be strings, URLs, or ImageObjects
                const firstImage = data.image[0];
                if (typeof firstImage === 'string') {
                    recipe.image = firstImage;
                } else if (firstImage && typeof firstImage === 'object') {
                    recipe.image = firstImage.url || firstImage.contentUrl || firstImage['@id'] || '';
                }
            } else if (typeof data.image === 'object') {
                // Handle ImageObject with various possible URL properties
                recipe.image = data.image.url || data.image.contentUrl || data.image['@id'] || '';
            }
        }

        if (data.recipeYield) {
            recipe.servings = Array.isArray(data.recipeYield)
                ? data.recipeYield[0]
                : data.recipeYield;
        }

        recipe.prepTime = formatDuration(data.prepTime);
        recipe.cookTime = formatDuration(data.cookTime) || formatDuration(data.totalTime);

        if (data.recipeIngredient && Array.isArray(data.recipeIngredient)) {
            recipe.ingredients = data.recipeIngredient.join('\n');
        }

        if (data.recipeInstructions) {
            if (typeof data.recipeInstructions === 'string') {
                recipe.instructions = data.recipeInstructions;
            } else if (Array.isArray(data.recipeInstructions)) {
                recipe.instructions = data.recipeInstructions.map((step, i) => {
                    if (typeof step === 'string') {
                        return `${i + 1}. ${step}`;
                    } else if (step['@type'] === 'HowToSection') {
                        // Handle HowToSection with nested steps
                        const sectionSteps = step.itemListElement?.map((s, j) => {
                            const stepText = typeof s === 'string' ? s : (s.text || s.name || s.description || '');
                            return stepText ? `${j + 1}. ${stepText}` : '';
                        }).filter(Boolean).join('\n') || '';
                        return `\n${step.name || 'Section'}:\n${sectionSteps}`;
                    } else if (step.text || step.name || step.description) {
                        // Handle HowToStep and similar objects - check multiple properties
                        const stepText = step.text || step.name || step.description;
                        return `${i + 1}. ${stepText}`;
                    } else if (step.itemListElement && Array.isArray(step.itemListElement)) {
                        // Handle steps with nested itemListElement (some sites nest instructions)
                        return step.itemListElement.map((s, j) => {
                            const stepText = typeof s === 'string' ? s : (s.text || s.name || s.description || '');
                            return stepText ? `${j + 1}. ${stepText}` : '';
                        }).filter(Boolean).join('\n');
                    }
                    return '';
                }).filter(Boolean).join('\n\n');
            }
        }

        if (data.recipeCategory) {
            const categories = Array.isArray(data.recipeCategory)
                ? data.recipeCategory
                : [data.recipeCategory];
            categories.forEach(cat => {
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

        recipe.tags = [...new Set(recipe.tags.map(t => t.toLowerCase().trim()))].map(t =>
            capitalizeTag(t)
        ).filter(Boolean);
    }

    function formatDuration(isoDuration) {
        if (!isoDuration) return '';
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
        recipe.title = doc.querySelector('h1')?.textContent?.trim() ||
                       doc.querySelector('.recipe-title')?.textContent?.trim() ||
                       doc.title || '';

        if (!recipe.image) {
            recipe.image = findBestImage(doc);
        }

        const ingredientsList = doc.querySelector('.ingredients') ||
                               doc.querySelector('[class*="ingredient"]');
        if (ingredientsList) {
            const items = ingredientsList.querySelectorAll('li');
            recipe.ingredients = Array.from(items).map(li => li.textContent.trim()).join('\n');
        }

        const instructionsList = doc.querySelector('.instructions') ||
                                doc.querySelector('[class*="instruction"]');
        if (instructionsList) {
            const items = instructionsList.querySelectorAll('li, p');
            recipe.instructions = Array.from(items).map((el, i) =>
                `${i + 1}. ${el.textContent.trim()}`
            ).join('\n\n');
        }
    }

    function findBestImage(doc) {
        // Priority 1: Open Graph image (most reliable for recipe sites)
        const ogImage = doc.querySelector('meta[property="og:image"]')?.content;
        if (ogImage) return ogImage;

        // Priority 2: Twitter card image
        const twitterImage = doc.querySelector('meta[name="twitter:image"]')?.content;
        if (twitterImage) return twitterImage;

        // Priority 3: Schema.org image meta
        const schemaImage = doc.querySelector('meta[itemprop="image"]')?.content;
        if (schemaImage) return schemaImage;

        // Priority 4: Common recipe image selectors
        const recipeSelectors = [
            '.recipe-image img', '.recipe-photo img', '[class*="hero"] img',
            '.entry-content img', '.post-content img', '.article-content img',
            '[class*="featured"] img', '[class*="recipe"] img',
            'article img', 'main img', '.content img'
        ];

        for (const selector of recipeSelectors) {
            const img = doc.querySelector(selector);
            const src = img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src');
            if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('avatar') && !src.includes('author')) {
                return src;
            }
        }

        return '';
    }

    // ============================================
    // UI Components
    // ============================================

    const elements = {
        recipeGrid: document.getElementById('recipe-grid'),
        emptyState: document.getElementById('empty-state'),
        noResults: document.getElementById('no-results'),
        // Sidebar elements
        sidebarTags: document.getElementById('sidebar-tags'),
        sidebarFolders: document.getElementById('sidebar-folders'),
        countAll: document.getElementById('count-all'),
        contentTitle: document.getElementById('content-title'),
        recipeCount: document.getElementById('recipe-count'),
        btnAddFolder: document.getElementById('btn-add-folder'),
        // Collapsible section headers
        foldersSection: document.getElementById('folders-section'),
        categoriesSection: document.getElementById('categories-section'),
        // Sidebar toggle
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
        // Header elements
        headerSearch: document.getElementById('header-search'),
        btnAddRecipe: document.getElementById('btn-add-recipe'),
        addRecipeDropdown: document.getElementById('add-recipe-dropdown'),
        btnAddFromUrl: document.getElementById('btn-add-from-url'),
        btnAddManual: document.getElementById('btn-add-manual'),
        btnAddFirst: document.getElementById('btn-add-first'),
        btnMenu: document.getElementById('btn-menu'),
        dropdownMenu: document.getElementById('dropdown-menu'),
        btnPhotoImport: document.getElementById('btn-photo-import'),
        // Auth overlay
        authOverlay: document.getElementById('auth-overlay'),
        // Modals
        modalRecipe: document.getElementById('modal-recipe'),
        modalView: document.getElementById('modal-view'),
        modalBulkImport: document.getElementById('modal-bulk-import'),
        modalFailedUrls: document.getElementById('modal-failed-urls'),
        modalPhotoImport: document.getElementById('modal-photo-import'),
        failedUrlsList: document.getElementById('failed-urls-list'),
        bulkUrls: document.getElementById('bulk-urls'),
        btnBulkImport: document.getElementById('btn-bulk-import'),
        btnDoBulkImport: document.getElementById('btn-do-bulk-import'),
        // Photo import elements
        photoImportArea: document.getElementById('photo-import-area'),
        photoPreviewContainer: document.getElementById('photo-preview-container'),
        btnProcessPhoto: document.getElementById('btn-process-photo'),
        photoFile: document.getElementById('photo-file'),
        // Form elements
        recipeForm: document.getElementById('recipe-form'),
        recipeFetchUrl: document.getElementById('recipe-fetch-url'),
        btnFetchUrl: document.getElementById('btn-fetch-url'),
        modalTitle: document.getElementById('modal-title'),
        imagePreview: document.getElementById('image-preview'),
        btnUploadImage: document.getElementById('btn-upload-image'),
        recipeImageFile: document.getElementById('recipe-image-file'),
        urlImportSection: document.getElementById('url-import-section'),
        urlDivider: document.getElementById('url-divider'),
        recipePhotosSection: document.getElementById('recipe-photos-section'),
        recipePhotosPreview: document.getElementById('recipe-photos-preview'),
        ingredientsOptional: document.getElementById('ingredients-optional'),
        instructionsOptional: document.getElementById('instructions-optional'),
        // View folder menu
        btnAddToFolder: document.getElementById('btn-add-to-folder'),
        viewFolderDropdown: document.getElementById('view-folder-dropdown'),
        viewFolderList: document.getElementById('view-folder-list'),
        btnViewNewFolder: document.getElementById('btn-view-new-folder'),
        // View recipe photos
        viewPhotosSection: document.getElementById('view-photos-section'),
        viewPhotosGallery: document.getElementById('view-photos-gallery'),
        viewIngredientsSection: document.getElementById('view-ingredients-section'),
        viewInstructionsSection: document.getElementById('view-instructions-section'),
        // Lightbox
        photoLightbox: document.getElementById('photo-lightbox'),
        lightboxImage: document.getElementById('lightbox-image'),
        lightboxPrev: document.getElementById('lightbox-prev'),
        lightboxNext: document.getElementById('lightbox-next'),
        // Other
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toast-message'),
        btnImport: document.getElementById('btn-import'),
        btnExport: document.getElementById('btn-export'),
        btnInstall: document.getElementById('btn-install'),
        btnCloudSync: document.getElementById('btn-cloud-sync'),
        importFile: document.getElementById('import-file'),
        bookmarkletDrag: document.getElementById('bookmarklet-drag')
    };

    // Track open card menus
    let openCardMenu = null;

    // Current state
    let currentFilter = 'all';
    let currentSearch = '';
    let currentViewingRecipe = null;
    let deferredInstallPrompt = null;
    let isCookbookMode = false;
    let currentPhotoIndex = 0;
    let currentPhotosArray = [];

    // ============================================
    // Rendering Functions
    // ============================================

    function renderRecipes() {
        const recipes = getRecipes();
        let filtered = recipes;

        filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        // Get the suggested folder ID
        const suggestedFolder = getFolders().find(f => f.name === SUGGESTED_FOLDER_NAME);
        const suggestedFolderId = suggestedFolder ? suggestedFolder.id : null;
        const isViewingSuggestions = currentFilter === `folder:${suggestedFolderId}`;

        // For Ivy, exclude suggested recipes from "all", "recent", "favorites" views
        // (They should only appear in the Suggested Recipes folder or when explicitly viewing it)
        if (isIvy && suggestedFolderId && !isViewingSuggestions) {
            filtered = filtered.filter(r => {
                // Exclude if the recipe is in the suggested folder AND is still marked as a suggestion
                if (r.isSuggestion && r.folders && r.folders.includes(suggestedFolderId)) {
                    return false;
                }
                return true;
            });
        }

        if (currentFilter === 'recent') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            filtered = filtered.filter(r => new Date(r.createdAt) >= oneWeekAgo);
        } else if (currentFilter === 'favorites') {
            filtered = filtered.filter(r => r.favorite);
        } else if (currentFilter.startsWith('folder:')) {
            const folderId = currentFilter.replace('folder:', '');
            filtered = filtered.filter(r => r.folders && r.folders.includes(folderId));
        } else if (currentFilter !== 'all') {
            filtered = filtered.filter(r =>
                r.tags && r.tags.some(t =>
                    t.toLowerCase() === currentFilter.toLowerCase()
                )
            );
        }

        if (currentSearch) {
            const search = currentSearch.toLowerCase();
            filtered = filtered.filter(r =>
                r.title.toLowerCase().includes(search) ||
                r.ingredients?.toLowerCase().includes(search) ||
                r.tags?.some(t => t.toLowerCase().includes(search)) ||
                r.source?.toLowerCase().includes(search)
            );
        }

        elements.countAll.textContent = recipes.length;

        let titleText = 'All Recipes';
        if (currentFilter === 'recent') {
            titleText = 'Recently Added';
        } else if (currentFilter === 'favorites') {
            titleText = 'Favorites';
        } else if (currentFilter.startsWith('folder:')) {
            const folderId = currentFilter.replace('folder:', '');
            const folder = getFolders().find(f => f.id === folderId);
            titleText = folder ? folder.name : 'Folder';
        } else if (currentFilter !== 'all') {
            titleText = currentFilter;
        }
        elements.contentTitle.textContent = titleText;
        elements.recipeCount.textContent = `${filtered.length} recipe${filtered.length !== 1 ? 's' : ''}`;

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

        let sourceName = '';
        if (recipe.source) {
            sourceName = getSourceName(recipe.source);
        }

        const folders = getFolders();
        const recipeFolders = recipe.folders || [];
        const folderOptions = folders.map(f => {
            const isInFolder = recipeFolders.includes(f.id);
            return `
            <button class="card-dropdown-item ${isInFolder ? 'in-folder' : ''}" data-action="toggle-folder" data-folder-id="${f.id}">
                <svg viewBox="0 0 24 24" fill="${isInFolder ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                ${escapeHtml(f.name)}
                ${isInFolder ? '<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
            </button>
        `}).join('');

        const isFavorite = recipe.favorite ? 'active' : '';
        const canEdit = isIvy;

        // Build menu items based on permissions
        let menuItems = '';
        if (canEdit) {
            menuItems += `
                <button class="card-dropdown-item" data-action="edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Edit
                </button>
            `;
            if (folders.length > 0) menuItems += `<div class="card-dropdown-divider"></div>`;
            menuItems += folderOptions;
            menuItems += `
                <button class="card-dropdown-item" data-action="new-folder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        <line x1="12" y1="11" x2="12" y2="17"></line>
                        <line x1="9" y1="14" x2="15" y2="14"></line>
                    </svg>
                    Add to new folder...
                </button>
                <div class="card-dropdown-divider"></div>
                <button class="card-dropdown-item" data-action="delete" style="color: var(--color-danger);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Delete
                </button>
            `;
        }

        const overlayButtons = `
            <div class="card-overlay-buttons">
                <button class="card-btn card-btn-favorite ${isFavorite}" data-action="favorite" title="Favorite">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="${recipe.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                ${canEdit ? `
                <div class="card-menu-container">
                    <button class="card-btn card-btn-menu" data-action="toggle-menu" title="More options">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                        </svg>
                    </button>
                    <div class="card-dropdown" hidden>
                        ${menuItems}
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        let imageHtml;
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

        const metaParts = [];
        if (recipe.prepTime || recipe.cookTime) {
            const time = [recipe.prepTime, recipe.cookTime].filter(Boolean).join(' + ');
            metaParts.push(`<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${escapeHtml(time)}</span>`);
        }
        if (recipe.servings) {
            metaParts.push(`<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>${escapeHtml(recipe.servings)}</span>`);
        }

        const tags = recipe.tags || [];
        const maxVisibleTags = 2;
        const visibleTags = tags.slice(0, maxVisibleTags);
        const hiddenTags = tags.slice(maxVisibleTags);
        let tagsHtml = '';
        if (tags.length > 0) {
            tagsHtml = `<div class="recipe-card-tags">
                ${visibleTags.map(t => `<span class="recipe-card-tag">${escapeHtml(t)}</span>`).join('')}
                ${hiddenTags.length > 0 ? `<span class="recipe-card-tag more-tags" data-action="show-more-tags" title="${hiddenTags.map(t => escapeHtml(t)).join(', ')}">+${hiddenTags.length} more</span>` : ''}
            </div>`;
        }

        card.innerHTML = `
            ${imageHtml}
            <div class="recipe-card-content">
                <h3 class="recipe-card-title">${escapeHtml(recipe.title)}</h3>
                ${metaParts.length ? `<div class="recipe-card-meta">${metaParts.join('')}</div>` : ''}
                ${tagsHtml}
            </div>
        `;

        card.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            const recipeId = recipe.id;

            if (btn) {
                e.stopPropagation();
                e.preventDefault();
                const action = btn.dataset.action;

                if (action === 'favorite') {
                    toggleFavorite(recipeId);
                } else if (action === 'toggle-menu') {
                    toggleCardMenu(card);
                } else if (action === 'edit') {
                    closeAllCardMenus();
                    openEditModal(recipeId);
                } else if (action === 'delete') {
                    closeAllCardMenus();
                    if (confirm('Are you sure you want to delete this recipe?')) {
                        deleteRecipeById(recipeId);
                        renderRecipes();
                        renderTagsFilter();
                        showToast('Recipe deleted');
                    }
                } else if (action === 'toggle-folder') {
                    closeAllCardMenus();
                    const folderId = btn.dataset.folderId;
                    const currentRecipe = getRecipeById(recipeId);
                    if (!currentRecipe) return;
                    const isInFolder = currentRecipe.folders && currentRecipe.folders.includes(folderId);
                    if (isInFolder) {
                        removeRecipeFromFolder(recipeId, folderId);
                        showToast('Removed from folder');
                    } else {
                        addRecipeToFolder(recipeId, folderId);
                        showToast('Added to folder');
                    }
                    renderRecipes();
                    renderFolders();
                } else if (action === 'new-folder') {
                    closeAllCardMenus();
                    const folderName = prompt('Enter folder name:');
                    if (folderName && folderName.trim()) {
                        const folder = addFolder(folderName.trim());
                        if (folder) {
                            addRecipeToFolder(recipeId, folder.id);
                            renderFolders();
                            renderRecipes();
                            showToast(`Added to "${folder.name}"`);
                        } else {
                            showToast('Folder already exists');
                        }
                    }
                } else if (action === 'show-more-tags') {
                    const currentRecipe = getRecipeById(recipeId);
                    if (!currentRecipe) return;
                    const tagsContainer = btn.closest('.recipe-card-tags');
                    const allTags = currentRecipe.tags || [];
                    tagsContainer.innerHTML = allTags.map(t => `<span class="recipe-card-tag">${escapeHtml(t)}</span>`).join('');
                }
            } else {
                openViewModal(recipeId);
            }
        });

        return card;
    }

    function toggleCardMenu(card) {
        const dropdown = card.querySelector('.card-dropdown');
        const wasOpen = !dropdown.hidden;
        closeAllCardMenus();
        if (!wasOpen) {
            dropdown.hidden = false;
            openCardMenu = dropdown;
        }
    }

    function closeAllCardMenus() {
        document.querySelectorAll('.card-dropdown').forEach(d => d.hidden = true);
        openCardMenu = null;
    }

    function getSourceName(url) {
        try {
            // Check if it's a URL
            if (!url.startsWith('http')) {
                return url; // Return as-is if not a URL (e.g., "NYT Cooking")
            }
            const hostname = new URL(url).hostname.replace('www.', '');
            const siteNames = {
                'cooking.nytimes.com': 'NYT Cooking',
                'nytimes.com': 'New York Times',
                'seriouseats.com': 'Serious Eats',
                'bonappetit.com': 'Bon Appetit',
                'allrecipes.com': 'Allrecipes',
                'epicurious.com': 'Epicurious',
                'foodnetwork.com': 'Food Network',
                'food52.com': 'Food52',
                'simplyrecipes.com': 'Simply Recipes',
                'budgetbytes.com': 'Budget Bytes',
                'minimalistbaker.com': 'Minimalist Baker',
                'halfbakedharvest.com': 'Half Baked Harvest',
                'smittenkitchen.com': 'Smitten Kitchen',
                'thekitchn.com': 'The Kitchn',
                'delish.com': 'Delish',
                'tasty.co': 'Tasty',
                'eatingwell.com': 'EatingWell'
            };
            return siteNames[hostname] || hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
        } catch {
            return url;
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

    let showAllCategories = false;

    function renderTagsFilter() {
        const tags = getAllTags();
        const maxVisible = showAllCategories ? tags.length : 8;
        const displayTags = tags.slice(0, maxVisible);
        const hasMore = tags.length > 8;

        let html = displayTags.map(tag => `
            <button class="sidebar-item ${currentFilter === tag ? 'active' : ''}" data-filter="${escapeHtml(tag)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                    <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
                ${escapeHtml(tag)}
            </button>
        `).join('');

        if (hasMore) {
            if (showAllCategories) {
                html += `
                    <button class="sidebar-item sidebar-item-toggle" id="btn-toggle-categories">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                        Less
                    </button>
                `;
            } else {
                html += `
                    <button class="sidebar-item sidebar-item-toggle" id="btn-toggle-categories">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        More
                    </button>
                `;
            }
        }

        elements.sidebarTags.innerHTML = html;

        // Add event listener for more button
        const toggleBtn = document.getElementById('btn-toggle-categories');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                showAllCategories = !showAllCategories;
                renderTagsFilter();
            });
        }

        updateSidebarActiveState();
    }

    function renderFolders() {
        const folders = getFolders();
        const recipes = getRecipes();

        if (!elements.sidebarFolders) return;

        // Separate suggested folder from regular folders
        const suggestedFolder = folders.find(f => f.name === SUGGESTED_FOLDER_NAME);
        const regularFolders = folders.filter(f => f.name !== SUGGESTED_FOLDER_NAME);

        let html = '';

        // Render regular folders first
        html += regularFolders.map(folder => {
            const count = recipes.filter(r => r.folders && r.folders.includes(folder.id)).length;
            const isActive = currentFilter === `folder:${folder.id}`;
            const canDelete = isIvy; // Only Ivy can delete folders
            return `
                <div class="sidebar-folder-item ${isActive ? 'active' : ''}">
                    <button class="sidebar-item" data-filter="folder:${folder.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        ${escapeHtml(folder.name)}
                        <span class="sidebar-item-count">${count}</span>
                    </button>
                    ${canDelete ? `
                    <button class="sidebar-folder-delete" data-folder-id="${folder.id}" title="Delete folder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6 6 18M6 6l12 12"></path>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Render suggested folder (only visible to Ivy, with special styling)
        if (suggestedFolder && isIvy) {
            const count = recipes.filter(r => r.folders && r.folders.includes(suggestedFolder.id)).length;
            const isActive = currentFilter === `folder:${suggestedFolder.id}`;
            if (count > 0) {
                html += `
                    <div class="sidebar-folder-item sidebar-folder-suggested ${isActive ? 'active' : ''}">
                        <button class="sidebar-item" data-filter="folder:${suggestedFolder.id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            ${escapeHtml(suggestedFolder.name)}
                            <span class="sidebar-item-count sidebar-item-count-new">${count}</span>
                        </button>
                    </div>
                `;
            }
        }

        elements.sidebarFolders.innerHTML = html;
    }

    function deleteFolder(folderId) {
        const recipes = getRecipes();
        recipes.forEach(recipe => {
            if (recipe.folders && recipe.folders.includes(folderId)) {
                recipe.folders = recipe.folders.filter(f => f !== folderId);
            }
        });
        saveRecipes(recipes);

        const folders = getFolders().filter(f => f.id !== folderId);
        saveFolders(folders);

        if (currentFilter === `folder:${folderId}`) {
            handleSidebarFilter('all');
        }

        renderFolders();
        renderRecipes();
    }

    function populateViewFolderList() {
        if (!elements.viewFolderList || !currentViewingRecipe) return;

        const folders = getFolders();
        const recipeFolders = currentViewingRecipe.folders || [];

        elements.viewFolderList.innerHTML = folders.map(folder => {
            const isInFolder = recipeFolders.includes(folder.id);
            return `
                <button class="view-folder-item ${isInFolder ? 'in-folder' : ''}" data-folder-id="${folder.id}">
                    <svg viewBox="0 0 24 24" fill="${isInFolder ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    ${escapeHtml(folder.name)}
                </button>
            `;
        }).join('');

        if (folders.length === 0) {
            elements.viewFolderList.innerHTML = '<p style="padding: 0.5rem 0.75rem; color: var(--color-text-muted); font-size: 0.875rem;">No folders yet</p>';
        }
    }

    function updateSidebarActiveState() {
        document.querySelectorAll('.sidebar-item[data-filter]').forEach(item => {
            const filter = item.dataset.filter;
            item.classList.toggle('active', filter === currentFilter);
        });
    }

    // ============================================
    // Modal Functions
    // ============================================

    function openAddModal(showUrl = true) {
        elements.modalTitle.textContent = isIvy ? 'Add Recipe' : 'Suggest Recipe';
        elements.recipeForm.reset();
        document.getElementById('recipe-id').value = '';
        document.getElementById('recipe-photos').value = '[]';
        elements.imagePreview.hidden = true;

        // Reset cookbook mode
        isCookbookMode = false;
        elements.recipePhotosSection.hidden = true;
        elements.recipePhotosPreview.innerHTML = '';
        elements.ingredientsOptional.hidden = true;
        elements.instructionsOptional.hidden = true;

        // Remove required from ingredients/instructions
        document.getElementById('recipe-ingredients').removeAttribute('required');
        document.getElementById('recipe-instructions').removeAttribute('required');

        // Show/hide suggester name section for non-Ivy users
        const suggesterSection = document.getElementById('suggester-section');
        if (suggesterSection) {
            suggesterSection.hidden = isIvy;
        }

        // Show/hide URL section
        if (showUrl) {
            elements.urlImportSection.hidden = false;
            elements.urlDivider.hidden = false;
        } else {
            elements.urlImportSection.hidden = true;
            elements.urlDivider.hidden = true;
        }

        openModal(elements.modalRecipe);
        if (showUrl) {
            elements.recipeFetchUrl.focus();
        } else {
            document.getElementById('recipe-title').focus();
        }
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
        // Use url field, or fallback to source if it's a URL (backward compatibility)
        document.getElementById('recipe-url').value = recipe.url || (recipe.source && recipe.source.startsWith('http') ? recipe.source : '');
        document.getElementById('recipe-photos').value = JSON.stringify(recipe.photos || []);

        if (recipe.image) {
            elements.imagePreview.style.backgroundImage = `url(${recipe.image})`;
            elements.imagePreview.hidden = false;
        } else {
            elements.imagePreview.hidden = true;
        }

        // Hide URL section for editing
        elements.urlImportSection.hidden = true;
        elements.urlDivider.hidden = true;

        // Show recipe photos if available
        const photos = recipe.photos || [];
        if (photos.length > 0) {
            isCookbookMode = true;
            elements.recipePhotosSection.hidden = false;
            elements.recipePhotosPreview.innerHTML = photos.map(p =>
                `<img src="${p}" alt="Recipe photo">`
            ).join('');
            elements.ingredientsOptional.hidden = false;
            elements.instructionsOptional.hidden = false;
        } else {
            isCookbookMode = false;
            elements.recipePhotosSection.hidden = true;
            elements.ingredientsOptional.hidden = true;
            elements.instructionsOptional.hidden = true;
        }

        // Remove required from ingredients/instructions
        document.getElementById('recipe-ingredients').removeAttribute('required');
        document.getElementById('recipe-instructions').removeAttribute('required');

        openModal(elements.modalRecipe);
    }

    function openViewModal(id) {
        const recipe = getRecipeById(id);
        if (!recipe) return;

        currentViewingRecipe = recipe;

        document.getElementById('view-title').textContent = recipe.title;

        // Show/hide edit and delete buttons based on permissions
        const editBtn = document.getElementById('btn-edit-recipe');
        const deleteBtn = document.getElementById('btn-delete-recipe');
        const folderBtn = document.getElementById('btn-add-to-folder');

        if (editBtn) editBtn.style.display = isIvy ? '' : 'none';
        if (deleteBtn) deleteBtn.style.display = isIvy ? '' : 'none';
        if (folderBtn) folderBtn.style.display = isIvy ? '' : 'none';

        // Show suggested by info if it's a suggestion
        const suggestionInfo = document.getElementById('view-suggestion-info');
        const suggestionActions = document.getElementById('view-suggestion-actions');

        if (suggestionInfo) {
            if (recipe.suggestedBy) {
                suggestionInfo.textContent = `Suggested by: ${recipe.suggestedBy}`;
                suggestionInfo.hidden = false;
            } else {
                suggestionInfo.hidden = true;
            }
        }

        // Show approve/dismiss buttons for suggestions (Ivy only)
        if (suggestionActions) {
            if (isIvy && recipe.isSuggestion) {
                suggestionActions.hidden = false;
            } else {
                suggestionActions.hidden = true;
            }
        }

        const viewImage = document.getElementById('view-image');
        if (recipe.image) {
            viewImage.style.backgroundImage = `url(${recipe.image})`;
            viewImage.hidden = false;
        } else {
            viewImage.hidden = true;
        }

        // Show recipe photos if available
        const photos = recipe.photos || [];
        if (photos.length > 0) {
            elements.viewPhotosSection.hidden = false;
            // Photos may be objects with dataUrl property or plain URLs (for backward compatibility)
            elements.viewPhotosGallery.innerHTML = photos.map((p, i) => {
                const photoUrl = typeof p === 'object' ? (p.dataUrl || p.storageUrl) : p;
                return `<div class="view-photo-item" data-index="${i}"><img src="${photoUrl}" alt="Recipe photo ${i + 1}"></div>`;
            }).join('');
        } else {
            elements.viewPhotosSection.hidden = true;
        }

        const metaParts = [];
        if (recipe.servings) metaParts.push(`<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>Serves ${escapeHtml(recipe.servings)}</span>`);
        if (recipe.prepTime) metaParts.push(`<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Prep: ${escapeHtml(recipe.prepTime)}</span>`);
        if (recipe.cookTime) metaParts.push(`<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Cook: ${escapeHtml(recipe.cookTime)}</span>`);
        document.getElementById('view-meta').innerHTML = metaParts.join('');

        document.getElementById('view-tags').innerHTML = (recipe.tags || []).map(tag =>
            `<span class="view-tag">${escapeHtml(tag)}</span>`
        ).join('');

        // Ingredients
        const ingredients = (recipe.ingredients || '').split('\n').filter(Boolean);
        if (ingredients.length > 0) {
            elements.viewIngredientsSection.hidden = false;
            document.getElementById('view-ingredients').innerHTML = ingredients.map(ing =>
                `<li>${escapeHtml(ing)}</li>`
            ).join('');
        } else {
            elements.viewIngredientsSection.hidden = true;
        }

        // Instructions
        if (recipe.instructions) {
            elements.viewInstructionsSection.hidden = false;
            document.getElementById('view-instructions').textContent = recipe.instructions;
        } else {
            elements.viewInstructionsSection.hidden = true;
        }

        const notesSection = document.getElementById('view-notes-section');
        if (recipe.notes) {
            document.getElementById('view-notes').textContent = recipe.notes;
            notesSection.hidden = false;
        } else {
            notesSection.hidden = true;
        }

        const sourceSection = document.getElementById('view-source-section');
        // Use url field, or fallback to source if it's a URL (backward compatibility)
        const recipeUrl = recipe.url || (recipe.source && recipe.source.startsWith('http') ? recipe.source : '');
        if (recipeUrl) {
            document.getElementById('view-source').href = recipeUrl;
            sourceSection.hidden = false;
        } else {
            sourceSection.hidden = true;
        }

        openModal(elements.modalView);
    }

    function setupBookmarklet() {
        const appUrl = window.location.href.split('?')[0].split('#')[0];
        // Use a named window 'ivys_recipes' so the same tab gets reused if already open
        const bookmarkletCode = `javascript:(function(){window.open('${appUrl}?url='+encodeURIComponent(window.location.href),'ivys_recipes')})()`;
        elements.bookmarkletDrag.href = bookmarkletCode;
    }

    function openModal(modal) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';

        const focusable = modal.querySelectorAll('button, input, textarea, select, a[href]');
        if (focusable.length) {
            focusable[0].focus();
        }
    }

    function closeModal(modal) {
        if (modal) {
            modal.hidden = true;
        }
        document.body.style.overflow = '';
        currentViewingRecipe = null;
    }

    function closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.hidden = true;
        });
        document.body.style.overflow = '';
        currentViewingRecipe = null;
    }

    // ============================================
    // Form Handling
    // ============================================

    async function handleFormSubmit(e) {
        e.preventDefault();

        const id = document.getElementById('recipe-id').value;
        const photos = JSON.parse(document.getElementById('recipe-photos').value || '[]');

        const recipe = {
            title: normalizeTitle(document.getElementById('recipe-title').value),
            image: document.getElementById('recipe-image').value.trim(),
            servings: document.getElementById('recipe-servings').value.trim(),
            prepTime: document.getElementById('recipe-prep-time').value.trim(),
            cookTime: document.getElementById('recipe-cook-time').value.trim(),
            tags: cleanTags(document.getElementById('recipe-tags').value
                .split(',')
                .map(t => t.trim())
                .filter(Boolean)),
            ingredients: document.getElementById('recipe-ingredients').value.trim(),
            instructions: document.getElementById('recipe-instructions').value.trim(),
            notes: document.getElementById('recipe-notes').value.trim(),
            source: document.getElementById('recipe-source').value.trim(),
            url: document.getElementById('recipe-url').value.trim(),
            photos: photos
        };

        // Check if recipe title is empty
        if (!recipe.title.trim()) {
            showToast('Please enter a recipe title');
            document.getElementById('recipe-title').focus();
            return;
        }

        // Handle non-Ivy user suggestions vs Ivy adding directly
        if (!isIvy && !id) {
            const suggesterName = document.getElementById('suggester-name')?.value?.trim() || 'Anonymous';
            recipe.suggestedBy = suggesterName;
            recipe.isSuggestion = true;

            // Add to suggested recipes folder
            const suggestedFolder = getOrCreateSuggestedFolder();
            recipe.folders = [suggestedFolder.id];
        } else if (isIvy) {
            // Explicitly clear suggestion flags when Ivy adds/edits a recipe
            // Set to false/null rather than delete, since updateRecipe merges with existing data
            recipe.isSuggestion = false;
            recipe.suggestedBy = null;
        }

        // Disable save button to prevent double submission
        const saveBtn = document.querySelector('#modal-recipe .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        // Wrap entire save process with global timeout to prevent infinite saving state
        const SAVE_TIMEOUT = 60000; // 60 seconds max for entire save
        let saveCompleted = false;

        const saveTimeoutId = setTimeout(() => {
            if (!saveCompleted) {
                console.error('Save operation timed out');
                showToast('Save timed out. Recipe saved locally.');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Recipe';
                }
                closeModal(elements.modalRecipe);
                renderRecipes();
            }
        }, SAVE_TIMEOUT);

        try {
            const recipeId = id || generateId();

            // Upload photos to Firebase Storage if available
            if (recipe.photos && recipe.photos.length > 0) {
                if (useCloud && storage) {
                    showToast('Uploading photos to cloud...');

                    // Upload each photo sequentially for better error handling
                    const uploadedPhotos = [];
                    for (let index = 0; index < recipe.photos.length; index++) {
                        const photo = recipe.photos[index];
                        if (photo.dataUrl && photo.dataUrl.startsWith('data:')) {
                            const photoId = `photo-${index}-${Date.now()}`;
                            try {
                                const url = await uploadPhotoToStorage(photo.dataUrl, recipeId, photoId);
                                // Only keep the storage URL, remove base64 data to save localStorage space
                                if (url && !url.startsWith('data:')) {
                                    uploadedPhotos.push({
                                        dataUrl: url,
                                        storageUrl: url
                                    });
                                } else {
                                    // Upload returned base64 (failed), skip this photo for localStorage
                                    console.warn('Photo upload returned base64, skipping for storage');
                                    uploadedPhotos.push({ dataUrl: url, storageUrl: url });
                                }
                            } catch (uploadError) {
                                console.warn('Photo upload failed:', uploadError);
                                // Skip failed photos to avoid localStorage quota issues
                                showToast('Some photos could not be uploaded');
                            }
                        } else {
                            uploadedPhotos.push(photo);
                        }
                    }
                    recipe.photos = uploadedPhotos;
                } else {
                    // No cloud storage - warn user about potential storage issues
                    console.warn('Cloud storage not available, cookbook photos may not save properly');
                    showToast('Cloud storage not available. Photos may not save.');
                    // Clear photos to avoid localStorage quota issues
                    recipe.photos = [];
                }
            }

            // Upload cover image to Firebase Storage if it's a data URL
            if (recipe.image && recipe.image.startsWith('data:')) {
                if (useCloud && storage) {
                    try {
                        const coverImageUrl = await uploadPhotoToStorage(recipe.image, recipeId, 'cover');
                        if (coverImageUrl && !coverImageUrl.startsWith('data:')) {
                            recipe.image = coverImageUrl;
                        } else {
                            // Upload failed, clear the image to avoid localStorage issues
                            recipe.image = '';
                        }
                    } catch (coverError) {
                        console.warn('Cover image upload failed:', coverError);
                        recipe.image = '';
                    }
                } else {
                    // No cloud storage, clear large base64 image
                    recipe.image = '';
                }
            }

            if (id) {
                updateRecipe(id, recipe);
                // Toast will be shown by saveRecipes after cloud sync
            } else {
                const savedRecipe = addRecipe(recipe, true);
                if (savedRecipe) {
                    if (!isIvy) {
                        showToast('Recipe suggested! Ivy will review it.');
                    }
                    // For Ivy, toast will be shown after cloud sync completes
                } else {
                    showToast('Error: Could not save recipe. Storage may be full.');
                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save Recipe';
                    }
                    saveCompleted = true;
                    clearTimeout(saveTimeoutId);
                    return;
                }
            }

            closeModal(elements.modalRecipe);
            renderRecipes();
            renderTagsFilter();
            renderFolders();
        } catch (error) {
            console.error('Error saving recipe:', error);
            showToast('Error saving recipe. Try using smaller images.');
        } finally {
            saveCompleted = true;
            clearTimeout(saveTimeoutId);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Recipe';
            }
        }
    }

    async function handleFetchUrl() {
        const url = elements.recipeFetchUrl.value.trim();
        if (!url) {
            showToast('Please enter a URL');
            return;
        }

        elements.btnFetchUrl.disabled = true;
        elements.btnFetchUrl.textContent = 'Fetching...';

        try {
            const recipe = await fetchRecipeFromUrl(url);

            document.getElementById('recipe-title').value = normalizeTitle(recipe.title) || '';
            document.getElementById('recipe-image').value = recipe.image || '';
            document.getElementById('recipe-servings').value = recipe.servings || '';
            document.getElementById('recipe-prep-time').value = recipe.prepTime || '';
            document.getElementById('recipe-cook-time').value = recipe.cookTime || '';
            document.getElementById('recipe-tags').value = cleanTags(recipe.tags || []).join(', ');
            document.getElementById('recipe-ingredients').value = recipe.ingredients || '';
            document.getElementById('recipe-instructions').value = recipe.instructions || '';
            document.getElementById('recipe-source').value = recipe.source || '';
            document.getElementById('recipe-url').value = recipe.url || url;

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
                recipes = await importPaprikaFile(file);
            } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
                recipes = await importHtmlFile(file);
            } else {
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
        if (!window.JSZip) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        if (!window.pako) {
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
                            let content;
                            try {
                                const decompressed = window.pako.inflate(data);
                                content = new TextDecoder().decode(decompressed);
                            } catch {
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
        let tags = [];
        if (p.categories) {
            if (Array.isArray(p.categories)) {
                tags = p.categories;
            } else {
                tags = String(p.categories).split(/[,;]/).map(t => t.trim());
            }
        }
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

                    const recipes = [];
                    const recipeBlocks = doc.querySelectorAll('.recipe, [class*="recipe"]');

                    if (recipeBlocks.length > 0) {
                        recipeBlocks.forEach(block => {
                            const recipe = extractRecipeFromHtmlElement(block);
                            if (recipe.title) recipes.push(recipe);
                        });
                    } else {
                        const recipe = extractRecipeFromHtmlElement(doc.body);
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

    function extractRecipeFromHtmlElement(element) {
        const getText = (selectors) => {
            for (const sel of selectors) {
                const el = element.querySelector(sel);
                if (el) return el.textContent.trim();
            }
            return '';
        };

        return {
            title: getText(['h1', 'h2', '.title', '.recipe-title']),
            ingredients: getText(['.ingredients', '[class*="ingredient"]']),
            instructions: getText(['.directions', '.instructions']),
            notes: getText(['.notes', '[class*="note"]']),
            prepTime: getText(['.prep-time', '[class*="prep"]']),
            cookTime: getText(['.cook-time', '[class*="cook"]']),
            servings: getText(['.servings', '.yield']),
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
                statusEl.textContent = `Failed: ${hostname}`;
            }

            await new Promise(r => setTimeout(r, 300));
        }

        statusEl.textContent = 'Import complete!';
        progressEl.textContent = `Done`;
        await new Promise(r => setTimeout(r, 1000));

        loadingEl.remove();

        renderRecipes();
        renderTagsFilter();

        let message = '';
        if (successCount > 0) {
            message = `Imported ${successCount} recipe${successCount !== 1 ? 's' : ''}`;
        }
        if (skippedCount > 0) {
            message += message ? `, ${skippedCount} skipped` : `${skippedCount} skipped`;
        }
        if (failedUrls.length > 0) {
            message += message ? `, ${failedUrls.length} failed` : `${failedUrls.length} failed`;
        }
        if (!message) {
            message = 'No recipes could be imported';
        }
        showToast(message);

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

    window.addManualRecipeFromUrl = function(url) {
        closeModal(elements.modalFailedUrls);
        openAddModal(true);
        elements.recipeFetchUrl.value = url;
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
        return tag.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    function normalizeTitle(title) {
        if (!title) return '';
        const smallWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'with'];
        const words = title.trim().split(/\s+/);
        return words.map((word, i) => {
            const lower = word.toLowerCase();
            if (i === 0 || i === words.length - 1) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            if (smallWords.includes(lower)) {
                return lower;
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
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
        const action = params.get('action');

        if (!url && text) {
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                url = urlMatch[0];
            }
        }

        if (url) {
            window.history.replaceState({}, '', window.location.pathname);
            openAddModal(true);
            elements.recipeFetchUrl.value = url;
            handleFetchUrl();
        } else if (action === 'add') {
            window.history.replaceState({}, '', window.location.pathname);
            // Wait for auth check before opening modal
            setTimeout(() => {
                if (checkAuth()) {
                    openAddModal(true);
                }
            }, 100);
        }
    }

    // ============================================
    // PWA Install
    // ============================================

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
    });

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isAndroid() {
        return /Android/.test(navigator.userAgent);
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }

    function handleInstall() {
        // If we have the native install prompt, use it
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            deferredInstallPrompt.userChoice.then((choice) => {
                if (choice.outcome === 'accepted') {
                    showToast('App installed!');
                }
                deferredInstallPrompt = null;
            });
            return;
        }

        // Otherwise show manual instructions
        const modal = document.getElementById('modal-install');
        const iosInstructions = document.getElementById('install-ios');
        const androidInstructions = document.getElementById('install-android');
        const desktopInstructions = document.getElementById('install-desktop');
        const alreadyInstalled = document.getElementById('install-already');

        // Hide all instructions first
        iosInstructions.hidden = true;
        androidInstructions.hidden = true;
        desktopInstructions.hidden = true;
        alreadyInstalled.hidden = true;

        // Check if already installed
        if (isStandalone()) {
            alreadyInstalled.hidden = false;
        } else if (isIOS()) {
            iosInstructions.hidden = false;
        } else if (isAndroid()) {
            androidInstructions.hidden = false;
        } else {
            desktopInstructions.hidden = false;
        }

        openModal(modal);
    }

    // ============================================
    // Cookbook Photo Import
    // ============================================

    let selectedPhotos = [];

    function openPhotoImportModal() {
        resetPhotoImport();
        openModal(elements.modalPhotoImport);
    }

    function resetPhotoImport() {
        selectedPhotos = [];
        if (elements.photoImportArea) elements.photoImportArea.hidden = false;
        if (elements.photoPreviewContainer) elements.photoPreviewContainer.hidden = true;
        if (elements.btnProcessPhoto) elements.btnProcessPhoto.disabled = true;
        if (elements.photoFile) elements.photoFile.value = '';
        updatePhotoPreviewDisplay();
    }

    function updatePhotoPreviewDisplay() {
        const previewContainer = elements.photoPreviewContainer;
        if (!previewContainer) return;

        if (selectedPhotos.length === 0) {
            previewContainer.hidden = true;
            elements.photoImportArea.hidden = false;
            if (elements.btnProcessPhoto) elements.btnProcessPhoto.disabled = true;
            return;
        }

        previewContainer.hidden = false;
        elements.photoImportArea.hidden = true;
        if (elements.btnProcessPhoto) elements.btnProcessPhoto.disabled = false;

        const previewHtml = `
            <div class="photo-preview-grid">
                ${selectedPhotos.map((photo, i) => `
                    <div class="photo-preview-item">
                        <img src="${photo.dataUrl}" alt="Recipe photo ${i + 1}">
                        <button type="button" class="photo-remove-btn" data-index="${i}" title="Remove photo">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6 6 18M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                `).join('')}
            </div>
            <div class="photo-preview-actions">
                <button type="button" id="btn-add-more-photos" class="btn btn-secondary btn-sm">Add More Photos</button>
            </div>
        `;
        previewContainer.innerHTML = previewHtml;

        previewContainer.querySelectorAll('.photo-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                selectedPhotos.splice(index, 1);
                updatePhotoPreviewDisplay();
            });
        });

        const addMoreBtn = previewContainer.querySelector('#btn-add-more-photos');
        if (addMoreBtn) {
            addMoreBtn.addEventListener('click', () => {
                elements.photoFile.click();
            });
        }
    }

    function handlePhotoSelect(files) {
        const fileList = files instanceof FileList ? Array.from(files) : [files];

        fileList.forEach(file => {
            if (!file || !file.type.startsWith('image/')) {
                return;
            }

            // Compress image before storing - use smaller size for mobile
            compressImage(file, 800, 0.6).then(compressedDataUrl => {
                selectedPhotos.push({
                    file: file,
                    dataUrl: compressedDataUrl
                });
                updatePhotoPreviewDisplay();
            }).catch(err => {
                console.error('Error compressing image:', err);
                // Fallback - try with even more compression
                compressImage(file, 600, 0.4).then(compressedDataUrl => {
                    selectedPhotos.push({
                        file: file,
                        dataUrl: compressedDataUrl
                    });
                    updatePhotoPreviewDisplay();
                }).catch(() => {
                    showToast('Error processing image. Try a smaller photo.');
                });
            });
        });
    }

    function compressImage(file, maxWidth, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Scale down more aggressively for mobile storage limits
                    // Max 800px width for cookbook photos to keep file size manageable
                    const effectiveMaxWidth = maxWidth || 800;
                    if (width > effectiveMaxWidth) {
                        height = (height * effectiveMaxWidth) / width;
                        width = effectiveMaxWidth;
                    }

                    // Also limit height to prevent very tall images
                    const maxHeight = 1200;
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Use lower quality for better compression (0.6 instead of 0.8)
                    const effectiveQuality = quality || 0.6;
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', effectiveQuality);

                    // If still too large (>500KB), try again with lower quality
                    if (compressedDataUrl.length > 500000 && effectiveQuality > 0.3) {
                        canvas.toDataURL('image/jpeg', 0.4);
                        resolve(canvas.toDataURL('image/jpeg', 0.4));
                    } else {
                        resolve(compressedDataUrl);
                    }
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ============================================
    // Firebase Storage Functions
    // ============================================

    /**
     * Upload a photo to Firebase Storage
     * @param {string} dataUrl - Base64 data URL of the image
     * @param {string} recipeId - Recipe ID for organizing photos
     * @param {string} photoId - Unique ID for this photo
     * @returns {Promise<string>} - Download URL of uploaded photo
     */
    async function uploadPhotoToStorage(dataUrl, recipeId, photoId) {
        if (!useCloud || !storage) {
            console.warn('Firebase Storage not available');
            throw new Error('Cloud storage not available');
        }

        try {
            // Convert data URL to blob using a more reliable method
            const base64Data = dataUrl.split(',')[1];
            const mimeType = dataUrl.split(',')[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });

            // Create storage reference
            const storageRef = storage.ref();
            const extension = mimeType.split('/')[1] || 'jpg';
            const photoRef = storageRef.child(`recipes/${recipeId}/${photoId}.${extension}`);

            // Upload with timeout to prevent hanging
            const UPLOAD_TIMEOUT = 15000; // 15 seconds per photo
            const uploadPromise = new Promise(async (resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('Upload timed out'));
                }, UPLOAD_TIMEOUT);

                try {
                    const uploadTask = photoRef.put(blob, {
                        contentType: mimeType,
                        cacheControl: 'public, max-age=31536000'
                    });

                    const snapshot = await uploadTask;
                    clearTimeout(timeoutId);
                    const downloadURL = await snapshot.ref.getDownloadURL();
                    resolve(downloadURL);
                } catch (err) {
                    clearTimeout(timeoutId);
                    reject(err);
                }
            });

            const downloadURL = await uploadPromise;
            console.log('Photo uploaded successfully:', downloadURL);
            return downloadURL;
        } catch (error) {
            console.error('Error uploading photo to Firebase Storage:', error);
            // Throw error instead of returning base64 to prevent localStorage overflow
            throw error;
        }
    }

    /**
     * Download a photo from Firebase Storage (or return if already a data URL)
     * @param {string} photoUrl - Firebase Storage URL or data URL
     * @returns {Promise<string>} - Data URL of the photo
     */
    async function downloadPhotoFromStorage(photoUrl) {
        // If it's already a data URL, return it
        if (photoUrl && photoUrl.startsWith('data:')) {
            return photoUrl;
        }

        // If it's a Firebase Storage URL, it can be used directly
        // We'll keep the URL as-is for display, no need to convert to base64
        return photoUrl;
    }

    /**
     * Delete a photo from Firebase Storage
     * @param {string} photoUrl - Firebase Storage URL to delete
     */
    async function deletePhotoFromStorage(photoUrl) {
        if (!useCloud || !storage || !photoUrl || photoUrl.startsWith('data:')) {
            return; // Not a storage URL or storage not available
        }

        try {
            const storageRef = storage.refFromURL(photoUrl);
            await storageRef.delete();
            console.log('Photo deleted from storage:', photoUrl);
        } catch (error) {
            console.warn('Error deleting photo from storage:', error);
            // Not critical if delete fails
        }
    }

    function processCookbookPhoto() {
        if (selectedPhotos.length === 0) return;

        closeModal(elements.modalPhotoImport);

        // Open add modal in cookbook mode
        isCookbookMode = true;
        openAddModal(false);

        // Set up the form for cookbook mode
        const photoUrls = selectedPhotos.map(p => p.dataUrl);

        // Use first photo as cover image
        document.getElementById('recipe-image').value = photoUrls[0];
        elements.imagePreview.style.backgroundImage = `url(${photoUrls[0]})`;
        elements.imagePreview.hidden = false;

        // Store all photos (store full objects for proper cloud upload)
        document.getElementById('recipe-photos').value = JSON.stringify(selectedPhotos);

        // Show recipe photos preview
        elements.recipePhotosSection.hidden = false;
        elements.recipePhotosPreview.innerHTML = photoUrls.map(p =>
            `<img src="${p}" alt="Recipe photo">`
        ).join('');

        // Mark ingredients/instructions as optional
        elements.ingredientsOptional.hidden = false;
        elements.instructionsOptional.hidden = false;

        // Add "Cookbook" tag
        document.getElementById('recipe-tags').value = 'Cookbook';

        // If non-Ivy user, show the suggester name field
        if (!isIvy) {
            const suggesterSection = document.getElementById('suggester-section');
            if (suggesterSection) suggesterSection.hidden = false;
        }

        showToast(`${selectedPhotos.length} photo${selectedPhotos.length > 1 ? 's' : ''} added! Enter a title and save.`);
    }

    // ============================================
    // Photo Lightbox
    // ============================================

    function openLightbox(photos, startIndex = 0) {
        currentPhotosArray = photos;
        currentPhotoIndex = startIndex;
        updateLightboxImage();
        elements.photoLightbox.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        elements.photoLightbox.hidden = true;
        document.body.style.overflow = '';
    }

    function updateLightboxImage() {
        if (currentPhotosArray.length > 0) {
            const photo = currentPhotosArray[currentPhotoIndex];
            // Handle both object format and plain URL strings
            const photoUrl = typeof photo === 'object' ? (photo.dataUrl || photo.storageUrl) : photo;
            elements.lightboxImage.src = photoUrl;
            elements.lightboxPrev.style.display = currentPhotoIndex > 0 ? 'block' : 'none';
            elements.lightboxNext.style.display = currentPhotoIndex < currentPhotosArray.length - 1 ? 'block' : 'none';
        }
    }

    function lightboxPrev() {
        if (currentPhotoIndex > 0) {
            currentPhotoIndex--;
            updateLightboxImage();
        }
    }

    function lightboxNext() {
        if (currentPhotoIndex < currentPhotosArray.length - 1) {
            currentPhotoIndex++;
            updateLightboxImage();
        }
    }

    // ============================================
    // Sidebar Toggle
    // ============================================

    function toggleSidebar() {
        const isHidden = elements.sidebar.classList.toggle('hidden');
        elements.btnSidebarToggle.classList.toggle('sidebar-hidden', isHidden);

        // On mobile, use open class instead
        if (window.innerWidth <= 1024) {
            elements.sidebar.classList.toggle('open', !isHidden);
            elements.sidebarOverlay.classList.toggle('visible', !isHidden);
        }
    }

    // ============================================
    // Mobile Search Toggle
    // ============================================

    function toggleMobileSearch(show, keepSearch = false) {
        const popup = document.getElementById('mobile-search-popup');
        const backdrop = document.getElementById('mobile-search-backdrop');
        const mobileInput = document.getElementById('mobile-search-input');
        const headerInput = document.getElementById('header-search');

        if (show) {
            popup.classList.add('visible');
            backdrop.classList.add('visible');
            // Sync with header search value
            if (headerInput && mobileInput) {
                mobileInput.value = headerInput.value || currentSearch || '';
            }
            // Focus with delay to ensure element is visible
            setTimeout(() => mobileInput.focus(), 50);
        } else {
            popup.classList.remove('visible');
            backdrop.classList.remove('visible');
            // Only clear search if not keeping it
            if (!keepSearch && mobileInput && mobileInput.value) {
                mobileInput.value = '';
                if (headerInput) headerInput.value = '';
                currentSearch = '';
                renderRecipes();
            }
        }
    }

    // ============================================
    // Event Listeners
    // ============================================

    function setupEventListeners() {
        // Add recipe dropdown
        elements.btnAddRecipe.addEventListener('click', (e) => {
            e.stopPropagation();
            const container = elements.btnAddRecipe.parentElement;
            container.classList.toggle('open');
            elements.addRecipeDropdown.hidden = !elements.addRecipeDropdown.hidden;
            elements.dropdownMenu.hidden = true;
        });

        elements.btnAddFromUrl.addEventListener('click', () => {
            elements.addRecipeDropdown.hidden = true;
            elements.btnAddRecipe.parentElement.classList.remove('open');
            openAddModal(true);
        });

        elements.btnAddManual.addEventListener('click', () => {
            elements.addRecipeDropdown.hidden = true;
            elements.btnAddRecipe.parentElement.classList.remove('open');
            openAddModal(false);
        });

        elements.btnAddFirst.addEventListener('click', () => openAddModal(true));

        // Menu dropdown
        elements.btnMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.dropdownMenu.hidden = !elements.dropdownMenu.hidden;
            elements.addRecipeDropdown.hidden = true;
            elements.btnAddRecipe.parentElement.classList.remove('open');
        });

        // Close dropdowns when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!elements.addRecipeDropdown.contains(e.target) && e.target !== elements.btnAddRecipe) {
                elements.addRecipeDropdown.hidden = true;
                elements.btnAddRecipe.parentElement.classList.remove('open');
            }
            if (!elements.dropdownMenu.contains(e.target) && e.target !== elements.btnMenu) {
                elements.dropdownMenu.hidden = true;
            }
        });

        // Sidebar toggle
        if (elements.btnSidebarToggle) {
            elements.btnSidebarToggle.addEventListener('click', toggleSidebar);
        }
        if (elements.sidebarOverlay) {
            elements.sidebarOverlay.addEventListener('click', () => {
                elements.sidebar.classList.remove('open');
                elements.sidebar.classList.add('hidden');
                elements.sidebarOverlay.classList.remove('visible');
                elements.btnSidebarToggle.classList.add('sidebar-hidden');
            });
        }

        // Dropdown actions
        elements.btnImport.addEventListener('click', () => {
            elements.addRecipeDropdown.hidden = true;
            elements.btnAddRecipe.parentElement.classList.remove('open');
            elements.importFile.click();
        });
        elements.btnBulkImport.addEventListener('click', () => {
            elements.addRecipeDropdown.hidden = true;
            elements.btnAddRecipe.parentElement.classList.remove('open');
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

        // Sync button
        const btnSync = document.getElementById('btn-sync');
        if (btnSync) {
            btnSync.addEventListener('click', async () => {
                elements.dropdownMenu.hidden = true;
                await syncLocalToCloud();
            });
        }

        // Logout button
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                elements.dropdownMenu.hidden = true;
                handleLogout();
            });
        }

        elements.importFile.addEventListener('change', importRecipes);

        // Mobile search toggle
        const btnSearchToggle = document.getElementById('btn-search-toggle');
        const mobileSearchClose = document.getElementById('mobile-search-close');
        const mobileSearchBackdrop = document.getElementById('mobile-search-backdrop');
        const mobileSearchInput = document.getElementById('mobile-search-input');

        if (btnSearchToggle) {
            btnSearchToggle.addEventListener('click', () => {
                toggleMobileSearch(true);
            });
        }
        if (mobileSearchClose) {
            mobileSearchClose.addEventListener('click', () => {
                toggleMobileSearch(false);
            });
        }
        if (mobileSearchBackdrop) {
            mobileSearchBackdrop.addEventListener('click', () => {
                toggleMobileSearch(false);
            });
        }
        if (mobileSearchInput) {
            mobileSearchInput.addEventListener('input', (e) => {
                currentSearch = e.target.value;
                // Also sync to header search
                const headerInput = document.getElementById('header-search');
                if (headerInput) headerInput.value = e.target.value;
                renderRecipes();
            });
            // Handle Enter key - close popup but keep search results
            mobileSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    toggleMobileSearch(false, true); // keepSearch = true
                }
            });
        }
        // Mobile search submit button
        const mobileSearchSubmit = document.getElementById('mobile-search-submit');
        if (mobileSearchSubmit) {
            mobileSearchSubmit.addEventListener('click', () => {
                toggleMobileSearch(false, true); // keepSearch = true
            });
        }

        // Photo import
        if (elements.btnPhotoImport) {
            elements.btnPhotoImport.addEventListener('click', () => {
                elements.addRecipeDropdown.hidden = true;
                elements.btnAddRecipe.parentElement.classList.remove('open');
                openPhotoImportModal();
            });
        }
        if (elements.photoImportArea) {
            elements.photoImportArea.addEventListener('click', () => {
                elements.photoFile.click();
            });
            elements.photoImportArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                elements.photoImportArea.style.borderColor = 'var(--color-primary)';
            });
            elements.photoImportArea.addEventListener('dragleave', () => {
                elements.photoImportArea.style.borderColor = '';
            });
            elements.photoImportArea.addEventListener('drop', (e) => {
                e.preventDefault();
                elements.photoImportArea.style.borderColor = '';
                handlePhotoSelect(e.dataTransfer.files);
            });
        }
        if (elements.photoFile) {
            elements.photoFile.addEventListener('change', (e) => {
                handlePhotoSelect(e.target.files);
                e.target.value = '';
            });
        }
        if (elements.btnProcessPhoto) {
            elements.btnProcessPhoto.addEventListener('click', processCookbookPhoto);
        }

        // Bookmarklet
        elements.bookmarkletDrag.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Drag this button to your bookmarks bar!');
        });

        // Header search
        elements.headerSearch.addEventListener('input', handleSearch);

        // Sidebar navigation
        document.querySelectorAll('.sidebar-item[data-filter]').forEach(item => {
            item.addEventListener('click', () => {
                handleSidebarFilter(item.dataset.filter);
            });
        });

        // Sidebar tags - event delegation
        elements.sidebarTags.addEventListener('click', (e) => {
            const item = e.target.closest('.sidebar-item');
            if (item && item.dataset.filter) {
                handleSidebarFilter(item.dataset.filter);
            }
        });

        // Sidebar folders - event delegation
        elements.sidebarFolders.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.sidebar-folder-delete');
            if (deleteBtn) {
                e.stopPropagation();
                const folderId = deleteBtn.dataset.folderId;
                const folders = getFolders();
                const folder = folders.find(f => f.id === folderId);
                if (folder && confirm(`Delete folder "${folder.name}"? Recipes will not be deleted.`)) {
                    deleteFolder(folderId);
                    showToast('Folder deleted');
                }
                return;
            }

            const item = e.target.closest('.sidebar-item');
            if (item && item.dataset.filter) {
                handleSidebarFilter(item.dataset.filter);
            }
        });

        // Add folder button
        elements.btnAddFolder.addEventListener('click', () => {
            const folderName = prompt('Enter folder name:');
            if (folderName && folderName.trim()) {
                const folder = addFolder(folderName.trim());
                if (folder) {
                    renderFolders();
                    showToast(`Created folder "${folder.name}"`);
                } else {
                    showToast('Folder already exists');
                }
            }
        });

        // Close card menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.card-menu-container')) {
                closeAllCardMenus();
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

        // Image upload
        if (elements.btnUploadImage) {
            elements.btnUploadImage.addEventListener('click', () => {
                elements.recipeImageFile.click();
            });
        }
        if (elements.recipeImageFile) {
            elements.recipeImageFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const dataUrl = event.target.result;
                        document.getElementById('recipe-image').value = dataUrl;
                        elements.imagePreview.style.backgroundImage = `url(${dataUrl})`;
                        elements.imagePreview.hidden = false;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

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
                const recipeId = currentViewingRecipe.id;
                closeModal(elements.modalView);
                openEditModal(recipeId);
            }
        });

        document.getElementById('btn-delete-recipe').addEventListener('click', () => {
            if (currentViewingRecipe && confirm('Delete this recipe?')) {
                deleteRecipeById(currentViewingRecipe.id);
                closeModal(elements.modalView);
                renderRecipes();
                renderTagsFilter();
                showToast('Recipe deleted');
            }
        });

        // Suggestion approve/dismiss buttons in view modal
        const approveBtn = document.getElementById('btn-approve-suggestion');
        const dismissBtn = document.getElementById('btn-dismiss-suggestion');

        if (approveBtn) {
            approveBtn.addEventListener('click', () => {
                if (currentViewingRecipe) {
                    closeModal(elements.modalView);
                    approveRecipe(currentViewingRecipe.id);
                }
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                if (currentViewingRecipe) {
                    closeModal(elements.modalView);
                    dismissRecipe(currentViewingRecipe.id);
                }
            });
        }

        // View modal folder dropdown
        if (elements.btnAddToFolder) {
            elements.btnAddToFolder.addEventListener('click', (e) => {
                e.stopPropagation();
                populateViewFolderList();
                elements.viewFolderDropdown.hidden = !elements.viewFolderDropdown.hidden;
            });
        }
        if (elements.btnViewNewFolder) {
            elements.btnViewNewFolder.addEventListener('click', () => {
                const folderName = prompt('Enter folder name:');
                if (folderName && folderName.trim()) {
                    const folder = addFolder(folderName.trim());
                    if (folder && currentViewingRecipe) {
                        addRecipeToFolder(currentViewingRecipe.id, folder.id);
                        showToast(`Added to "${folder.name}"`);
                        renderFolders();
                    }
                }
                elements.viewFolderDropdown.hidden = true;
            });
        }
        if (elements.viewFolderList) {
            elements.viewFolderList.addEventListener('click', (e) => {
                const btn = e.target.closest('.view-folder-item');
                if (btn && currentViewingRecipe) {
                    const folderId = btn.dataset.folderId;
                    const isInFolder = currentViewingRecipe.folders && currentViewingRecipe.folders.includes(folderId);
                    if (isInFolder) {
                        removeRecipeFromFolder(currentViewingRecipe.id, folderId);
                        showToast('Removed from folder');
                    } else {
                        addRecipeToFolder(currentViewingRecipe.id, folderId);
                        showToast('Added to folder');
                    }
                    currentViewingRecipe = getRecipeById(currentViewingRecipe.id);
                    populateViewFolderList();
                    renderFolders();
                }
            });
        }

        // Close folder dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (elements.viewFolderDropdown && !elements.viewFolderDropdown.hidden) {
                if (!e.target.closest('.view-folder-menu')) {
                    elements.viewFolderDropdown.hidden = true;
                }
            }
        });

        // View photos gallery - lightbox
        if (elements.viewPhotosGallery) {
            elements.viewPhotosGallery.addEventListener('click', (e) => {
                const photoItem = e.target.closest('.view-photo-item');
                if (photoItem && currentViewingRecipe && currentViewingRecipe.photos) {
                    const index = parseInt(photoItem.dataset.index);
                    openLightbox(currentViewingRecipe.photos, index);
                }
            });
        }

        // Lightbox controls
        if (elements.photoLightbox) {
            elements.photoLightbox.querySelectorAll('[data-close-lightbox]').forEach(el => {
                el.addEventListener('click', closeLightbox);
            });
            elements.lightboxPrev.addEventListener('click', lightboxPrev);
            elements.lightboxNext.addEventListener('click', lightboxNext);
        }

        // Modal close - using event delegation for reliability
        document.addEventListener('click', (e) => {
            // Check if clicked on backdrop
            if (e.target.classList.contains('modal-backdrop') || e.target.hasAttribute('data-close-modal')) {
                e.preventDefault();
                closeAllModals();
                return;
            }

            // Check if clicked on close button or its children (like the SVG)
            const closeBtn = e.target.closest('.modal-close-btn');
            if (closeBtn) {
                e.preventDefault();
                e.stopPropagation();
                closeAllModals();
                return;
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!elements.photoLightbox.hidden) {
                    closeLightbox();
                } else {
                    closeAllModals();
                }
            }

            // Lightbox navigation
            if (!elements.photoLightbox.hidden) {
                if (e.key === 'ArrowLeft') lightboxPrev();
                if (e.key === 'ArrowRight') lightboxNext();
            }

            // Ctrl/Cmd + K for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                elements.headerSearch.focus();
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
    // Auth Overlay
    // ============================================

    function showAuthOverlay() {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.hidden = false;
            document.body.style.overflow = 'hidden';
        }
    }

    function hideAuthOverlay() {
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.hidden = true;
            document.body.style.overflow = '';
        }
    }

    function handleLogout() {
        // Clear auth data
        localStorage.removeItem(AUTH_KEY);
        isIvy = false;

        // Reset auth overlay to initial state
        const questionSection = document.getElementById('auth-question-section');
        const passwordSection = document.getElementById('auth-password-section');
        const notIvySection = document.getElementById('auth-not-ivy-section');
        const passwordInput = document.getElementById('auth-password');
        const passwordError = document.getElementById('auth-password-error');

        if (questionSection) questionSection.hidden = false;
        if (passwordSection) passwordSection.hidden = true;
        if (notIvySection) notIvySection.hidden = true;
        if (passwordInput) passwordInput.value = '';
        if (passwordError) passwordError.hidden = true;

        // Show auth overlay
        showAuthOverlay();
        showToast('Logged out successfully');
    }

    function setupAuthOverlay() {
        const overlay = document.getElementById('auth-overlay');
        if (!overlay) return;

        const yesBtn = document.getElementById('auth-yes');
        const noBtn = document.getElementById('auth-no');
        const passwordSection = document.getElementById('auth-password-section');
        const questionSection = document.getElementById('auth-question-section');
        const notIvySection = document.getElementById('auth-not-ivy-section');
        const passwordInput = document.getElementById('auth-password');
        const submitPasswordBtn = document.getElementById('auth-submit-password');
        const continueBtn = document.getElementById('auth-continue');
        const passwordError = document.getElementById('auth-password-error');

        if (yesBtn) {
            yesBtn.addEventListener('click', () => {
                questionSection.hidden = true;
                passwordSection.hidden = false;
                passwordInput.focus();
            });
        }

        if (noBtn) {
            noBtn.addEventListener('click', () => {
                questionSection.hidden = true;
                notIvySection.hidden = false;
            });
        }

        if (submitPasswordBtn) {
            submitPasswordBtn.addEventListener('click', () => {
                const password = passwordInput.value;
                if (password === IVY_PASSWORD) {
                    setAuth(true);
                    hideAuthOverlay();
                    updateUIForAuth();
                    renderFolders();
                    showToast('hi bh (:');
                    // Check for new suggestions after a brief delay
                    setTimeout(checkForNewSuggestions, 500);
                } else {
                    passwordError.hidden = false;
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    submitPasswordBtn.click();
                }
            });
        }

        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                setAuth(false);
                hideAuthOverlay();
                updateUIForAuth();
                renderFolders();
                // Non-Ivy users don't get a toast, the message is shown in the auth overlay
            });
        }
    }

    function updateUIForAuth() {
        // Update UI based on whether user is Ivy or not
        const addRecipeBtn = document.getElementById('btn-add-recipe');
        const addFolderBtn = document.getElementById('btn-add-folder');

        if (!isIvy) {
            // Change "Add Recipe" to "Suggest Recipe" for non-Ivy users
            if (addRecipeBtn) {
                addRecipeBtn.innerHTML = `
                    + Suggest Recipe
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                `;
            }
            // Hide add folder button for non-Ivy users
            if (addFolderBtn) {
                addFolderBtn.style.display = 'none';
            }
        } else {
            if (addRecipeBtn) {
                addRecipeBtn.innerHTML = `
                    + Add Recipe
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                `;
            }
            if (addFolderBtn) {
                addFolderBtn.style.display = '';
            }
        }

        // Update logout button text
        const logoutText = document.getElementById('logout-text');
        if (logoutText) {
            logoutText.textContent = isIvy ? 'Log Out (Ivy)' : 'Switch User';
        }

        // Re-render recipes to update action buttons
        renderRecipes();
    }

    // ============================================
    // Suggestions Review System
    // ============================================

    function getPendingSuggestions() {
        const recipes = getRecipes();
        const suggestedFolder = getFolders().find(f => f.name === SUGGESTED_FOLDER_NAME);
        if (!suggestedFolder) return [];

        return recipes.filter(r =>
            r.isSuggestion &&
            r.folders &&
            r.folders.includes(suggestedFolder.id)
        );
    }

    function checkForNewSuggestions() {
        if (!isIvy) return;

        const suggestions = getPendingSuggestions();
        if (suggestions.length > 0) {
            showSuggestionsModal(suggestions);
        }
    }

    function showSuggestionsModal(suggestions) {
        const modal = document.getElementById('modal-suggestions');
        const grid = document.getElementById('suggestions-grid');
        if (!modal || !grid) return;

        grid.innerHTML = '';

        suggestions.forEach(recipe => {
            const card = createSuggestionCard(recipe);
            grid.appendChild(card);
        });

        openModal(modal);
    }

    function createSuggestionCard(recipe) {
        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.dataset.id = recipe.id;

        const imageHtml = recipe.image
            ? `<div class="suggestion-card-image" style="background-image: url('${recipe.image}')"></div>`
            : `<div class="suggestion-card-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
               </div>`;

        const suggestedBy = recipe.suggestedBy ? `Suggested by: ${escapeHtml(recipe.suggestedBy)}` : 'Suggested recipe';

        card.innerHTML = `
            ${imageHtml}
            <div class="suggestion-card-body">
                <h3 class="suggestion-card-title">${escapeHtml(recipe.title)}</h3>
                <p class="suggestion-card-meta">${suggestedBy}</p>
                <div class="suggestion-card-actions">
                    <button class="btn btn-approve" data-action="approve">Add to Recipes</button>
                    <button class="btn btn-dismiss" data-action="dismiss">Dismiss</button>
                </div>
            </div>
        `;

        // Click on card to view recipe
        card.querySelector('.suggestion-card-image, .suggestion-card-placeholder, .suggestion-card-title')?.addEventListener('click', () => {
            closeSuggestionsModal();
            openViewModal(recipe.id);
        });

        // Approve button
        card.querySelector('[data-action="approve"]').addEventListener('click', (e) => {
            e.stopPropagation();
            approveRecipe(recipe.id);
        });

        // Dismiss button
        card.querySelector('[data-action="dismiss"]').addEventListener('click', (e) => {
            e.stopPropagation();
            dismissRecipe(recipe.id);
        });

        return card;
    }

    function approveRecipe(recipeId) {
        const recipes = getRecipes();
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return;

        // Remove the isSuggestion flag and remove from suggested folder
        const suggestedFolder = getFolders().find(f => f.name === SUGGESTED_FOLDER_NAME);

        recipe.isSuggestion = false;
        if (suggestedFolder && recipe.folders) {
            recipe.folders = recipe.folders.filter(f => f !== suggestedFolder.id);
            if (recipe.folders.length === 0) {
                delete recipe.folders;
            }
        }

        updateRecipe(recipeId, recipe);
        showToast('Recipe added to your collection!');

        // Update the suggestions modal
        refreshSuggestionsModal();
    }

    function dismissRecipe(recipeId) {
        if (confirm('Are you sure you want to dismiss this recipe suggestion? This will delete it.')) {
            deleteRecipe(recipeId);
            showToast('Suggestion dismissed');

            // Update the suggestions modal
            refreshSuggestionsModal();
        }
    }

    function refreshSuggestionsModal() {
        const suggestions = getPendingSuggestions();
        const modal = document.getElementById('modal-suggestions');

        if (suggestions.length === 0) {
            closeSuggestionsModal();
            renderRecipes();
            renderFolders();
        } else {
            showSuggestionsModal(suggestions);
            renderRecipes();
            renderFolders();
        }
    }

    function closeSuggestionsModal() {
        const modal = document.getElementById('modal-suggestions');
        if (modal) {
            closeModal(modal);
        }
    }

    // ============================================
    // Collapsible Sections
    // ============================================

    let collapsedSections = JSON.parse(localStorage.getItem('ivys_collapsed_sections') || '{}');

    function setupCollapsibleSections() {
        const foldersLabel = document.querySelector('#folders-section .sidebar-section-label');
        const categoriesLabel = document.querySelector('#categories-section .sidebar-section-label');

        if (foldersLabel) {
            foldersLabel.classList.add('collapsible-header');
            foldersLabel.innerHTML = `
                <span>Folders</span>
                <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            foldersLabel.addEventListener('click', () => toggleSection('folders'));
            if (collapsedSections.folders) {
                document.getElementById('folders-section').classList.add('collapsed');
            }
        }

        if (categoriesLabel) {
            categoriesLabel.classList.add('collapsible-header');
            categoriesLabel.innerHTML = `
                <span>Categories</span>
                <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            categoriesLabel.addEventListener('click', () => toggleSection('categories'));
            if (collapsedSections.categories) {
                document.getElementById('categories-section').classList.add('collapsed');
            }
        }
    }

    function toggleSection(sectionName) {
        const section = document.getElementById(`${sectionName}-section`);
        if (section) {
            section.classList.toggle('collapsed');
            collapsedSections[sectionName] = section.classList.contains('collapsed');
            localStorage.setItem('ivys_collapsed_sections', JSON.stringify(collapsedSections));
        }
    }

    // ============================================
    // Handle Shared Files (Web Share Target)
    // ============================================

    function handleSharedFiles() {
        // Check if this is a share target request
        const params = new URLSearchParams(window.location.search);
        const shareAction = params.get('share');
        const received = params.get('received');
        const sharedUrl = params.get('url');
        const sharedText = params.get('text');
        const sharedTitle = params.get('title');

        // Handle shared URL or text (from apps like NYT Cooking, browsers, etc.)
        let urlToFetch = sharedUrl;
        if (!urlToFetch && sharedText) {
            // Try to extract URL from shared text
            const urlMatch = sharedText.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                urlToFetch = urlMatch[0];
            }
        }

        if (urlToFetch) {
            // Clean up URL params
            window.history.replaceState({}, '', window.location.pathname);
            // Open add modal and fetch the recipe
            setTimeout(() => {
                openAddModal(true);
                elements.recipeFetchUrl.value = urlToFetch;
                handleFetchUrl();
            }, 500);
            return;
        }

        // Listen for messages from service worker (for photo shares)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'SHARED_FILES') {
                    const files = event.data.files;
                    if (files && files.length > 0) {
                        // Add files to selected photos
                        files.forEach(file => {
                            selectedPhotos.push({
                                file: null,
                                dataUrl: file.dataUrl
                            });
                        });
                        updatePhotoPreviewDisplay();
                        openPhotoImportModal();
                        showToast(`${files.length} photo(s) received! Add recipe details.`);
                    }
                }
            });
        }

        // Check for pending shared files in cache
        if (shareAction === 'photos' && received === 'true') {
            checkPendingShares();
            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);
        }

        // Also support launchQueue for browsers that support it
        if (shareAction === 'photos' && 'launchQueue' in window) {
            window.launchQueue.setConsumer(async (launchParams) => {
                if (launchParams.files && launchParams.files.length > 0) {
                    const fileHandles = launchParams.files;
                    for (const handle of fileHandles) {
                        const file = await handle.getFile();
                        if (file.type.startsWith('image/')) {
                            const dataUrl = await fileToDataUrl(file);
                            selectedPhotos.push({
                                file: file,
                                dataUrl: dataUrl
                            });
                        }
                    }
                    if (selectedPhotos.length > 0) {
                        updatePhotoPreviewDisplay();
                        openPhotoImportModal();
                        showToast(`${selectedPhotos.length} photo(s) received! Review and continue.`);
                    }
                }
            });
        }
    }

    async function checkPendingShares() {
        try {
            const cache = await caches.open('shared-files-temp');
            const response = await cache.match('pending-shares');
            if (response) {
                const files = await response.json();
                if (files && files.length > 0) {
                    files.forEach(file => {
                        selectedPhotos.push({
                            file: null,
                            dataUrl: file.dataUrl
                        });
                    });
                    updatePhotoPreviewDisplay();
                    openPhotoImportModal();
                    showToast(`${files.length} photo(s) received! Add recipe details.`);
                }
                // Clear the pending shares
                await cache.delete('pending-shares');
            }
        } catch (e) {
            console.error('Error checking pending shares:', e);
        }
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ============================================
    // Photo Migration
    // ============================================

    /**
     * Migrate existing base64 photos to Firebase Storage
     * This runs once in the background to move photos from localStorage to cloud
     */
    async function migratePhotosToStorage() {
        if (!useCloud || !storage) {
            return; // Cloud storage not available
        }

        try {
            const recipes = getRecipes();
            let migrationCount = 0;
            const migrationKey = 'ivys_photo_migration_done';

            // Check if migration already completed
            const migrationDone = localStorage.getItem(migrationKey);
            if (migrationDone === 'true') {
                return; // Already migrated
            }

            console.log('Starting photo migration to Firebase Storage...');

            for (const recipe of recipes) {
                let recipeUpdated = false;

                // Migrate cover image if it's a data URL
                if (recipe.image && recipe.image.startsWith('data:')) {
                    try {
                        const storageUrl = await uploadPhotoToStorage(recipe.image, recipe.id, 'cover');
                        if (!storageUrl.startsWith('data:')) {
                            recipe.image = storageUrl;
                            recipeUpdated = true;
                            migrationCount++;
                        }
                    } catch (error) {
                        console.warn('Failed to migrate cover image for recipe:', recipe.id, error);
                    }
                }

                // Migrate recipe photos if they're data URLs
                if (recipe.photos && Array.isArray(recipe.photos) && recipe.photos.length > 0) {
                    const migratedPhotos = await Promise.all(
                        recipe.photos.map(async (photo, index) => {
                            if (photo.dataUrl && photo.dataUrl.startsWith('data:')) {
                                try {
                                    const photoId = `photo-${index}-${Date.now()}`;
                                    const storageUrl = await uploadPhotoToStorage(photo.dataUrl, recipe.id, photoId);
                                    if (!storageUrl.startsWith('data:')) {
                                        migrationCount++;
                                        return {
                                            ...photo,
                                            dataUrl: storageUrl,
                                            storageUrl: storageUrl
                                        };
                                    }
                                } catch (error) {
                                    console.warn('Failed to migrate photo for recipe:', recipe.id, error);
                                }
                            }
                            return photo;
                        })
                    );

                    if (JSON.stringify(migratedPhotos) !== JSON.stringify(recipe.photos)) {
                        recipe.photos = migratedPhotos;
                        recipeUpdated = true;
                    }
                }

                // Update recipe if any photos were migrated
                if (recipeUpdated) {
                    updateRecipe(recipe.id, recipe);
                }
            }

            if (migrationCount > 0) {
                console.log(`Migration complete: ${migrationCount} photos uploaded to cloud storage`);
                showToast(`${migrationCount} photos backed up to cloud!`);
            }

            // Mark migration as complete
            localStorage.setItem(migrationKey, 'true');
        } catch (error) {
            console.error('Error during photo migration:', error);
        }
    }

    // ============================================
    // Initialize
    // ============================================

    async function init() {
        // Check auth status first
        const hasAuthed = checkAuth();

        // Initialize Firebase for cloud sync
        const firebaseInitialized = initFirebase();

        // Show loading indicator
        if (elements.recipeGrid) {
            elements.recipeGrid.innerHTML = '<div class="loading-indicator">Loading recipes...</div>';
        }

        // Try to load from cloud first
        if (firebaseInitialized) {
            await loadFromCloud();
            setupCloudListeners();
            initCloudSyncButton();

            // Check if we need to sync local data to cloud
            const localRecipesData = localStorage.getItem(STORAGE_KEY);
            const localRecipes = localRecipesData ? JSON.parse(localRecipesData) : [];

            // If cloud is empty but we have local recipes, sync them to cloud
            if (cloudRecipes.length === 0 && localRecipes.length > 0) {
                console.log('Cloud is empty but found local recipes. Syncing to cloud...');
                await syncLocalToCloud();
                // Reload from cloud to update cloudRecipes
                await loadFromCloud();
            }

            // Migrate existing photos to cloud storage (runs in background)
            setTimeout(() => {
                migratePhotosToStorage();
            }, 2000); // Wait 2 seconds after load to avoid blocking UI
        } else {
            // Firebase failed to initialize, show offline status
            initCloudSyncButton();
        }

        renderRecipes();
        renderTagsFilter();
        renderFolders();
        setupEventListeners();
        setupBookmarklet();
        setupAuthOverlay();
        setupCollapsibleSections();
        checkUrlParams();
        handleSharedFiles();
        registerServiceWorker();

        // Show auth overlay if never authed before
        if (!hasAuthed) {
            showAuthOverlay();
        } else {
            updateUIForAuth();
        }
    }

    // Start the app
    init();
})();
