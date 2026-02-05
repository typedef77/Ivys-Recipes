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
    const MEAL_PLANS_KEY = 'ivys_meal_plans';
    const AUTH_KEY = 'ivys_auth';
    const SUGGESTED_FOLDER_NAME = 'Suggested Recipes';
    const IVY_PASSWORD = 'Ilikeivysrecipes1!';

    // Cloud sync state
    let cloudRecipes = null;
    let cloudFolders = null;
    let cloudMealPlans = null;
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

        database.ref('mealPlans').on('value', (snapshot) => {
            const data = snapshot.val();
            cloudMealPlans = data ? Object.values(data) : [];
            localStorage.setItem(MEAL_PLANS_KEY, JSON.stringify(cloudMealPlans));
            if (Date.now() - lastSyncTime > 1000) {
                renderMealPlans();
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

    // ============================================
    // Meal Planning Management
    // ============================================

    function getMealPlans() {
        try {
            if (cloudMealPlans !== null) {
                return cloudMealPlans;
            }
            const data = localStorage.getItem(MEAL_PLANS_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error reading meal plans:', e);
            return [];
        }
    }

    async function saveMealPlans(mealPlans) {
        try {
            localStorage.setItem(MEAL_PLANS_KEY, JSON.stringify(mealPlans));
            cloudMealPlans = [...mealPlans];
            // Save to cloud if available
            if (useCloud && database) {
                try {
                    const mealPlansObj = {};
                    mealPlans.forEach(mp => { mealPlansObj[mp.id] = mp; });
                    await database.ref('mealPlans').set(mealPlansObj);
                } catch (e) {
                    console.warn('Cloud save failed for meal plans');
                }
            }
        } catch (e) {
            console.error('Error saving meal plans:', e);
        }
    }

    async function addMealPlan(name) {
        const mealPlans = getMealPlans();
        if (mealPlans.some(mp => mp.name.toLowerCase() === name.toLowerCase())) {
            return null;
        }
        const newPlan = {
            id: generateId(),
            name: name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            days: {
                monday: [],
                tuesday: [],
                wednesday: [],
                thursday: [],
                friday: [],
                saturday: [],
                sunday: []
            }
        };
        mealPlans.unshift(newPlan);
        await saveMealPlans(mealPlans);
        return newPlan;
    }

    function deleteMealPlan(planId) {
        const mealPlans = getMealPlans().filter(mp => mp.id !== planId);
        saveMealPlans(mealPlans);

        if (currentFilter === `mealplan:${planId}`) {
            handleSidebarFilter('all');
        }

        renderMealPlans();
    }

    function renameMealPlan(planId, newName) {
        const mealPlans = getMealPlans();
        const plan = mealPlans.find(mp => mp.id === planId);
        if (plan) {
            plan.name = newName;
            plan.updatedAt = new Date().toISOString();
            saveMealPlans(mealPlans);
            renderMealPlans();
            return true;
        }
        return false;
    }

    function renderMealPlans() {
        if (!elements.sidebarMealPlans) return;

        const mealPlans = getMealPlans();

        if (mealPlans.length === 0) {
            elements.sidebarMealPlans.innerHTML = '';
            return;
        }

        const html = mealPlans.map(plan => {
            const isActive = currentFilter === `mealplan:${plan.id}`;
            const totalRecipes = Object.values(plan.days).reduce((sum, day) => sum + day.length, 0);
            return `
                <div class="sidebar-folder-item ${isActive ? 'active' : ''}">
                    <button class="sidebar-item" data-filter="mealplan:${plan.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        ${escapeHtml(plan.name)}
                        <span class="sidebar-item-count">${totalRecipes}</span>
                    </button>
                    ${isIvy ? `
                        <button class="sidebar-folder-delete" data-plan-id="${plan.id}" title="Delete meal plan">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');

        elements.sidebarMealPlans.innerHTML = html;
    }

    function openMealPlanModal(recipeId) {
        if (!elements.modalMealPlan) return;

        elements.mealPlanRecipeId.value = recipeId;

        const mealPlans = getMealPlans();

        // Populate meal plan dropdown
        if (mealPlans.length === 0) {
            elements.mealPlanSelect.hidden = true;
            elements.mealPlanDay.parentElement.hidden = true;
            elements.noMealPlansMsg.hidden = false;
            elements.btnAddToMealPlan.disabled = true;
        } else {
            elements.mealPlanSelect.hidden = false;
            elements.mealPlanDay.parentElement.hidden = false;
            elements.noMealPlansMsg.hidden = true;
            elements.btnAddToMealPlan.disabled = false;

            elements.mealPlanSelect.innerHTML = '<option value="">Choose a meal plan...</option>' +
                mealPlans.map(plan => `<option value="${plan.id}">${escapeHtml(plan.name)}</option>`).join('');
        }

        openModal(elements.modalMealPlan);
    }

    function addRecipeToMealPlan(recipeId, planId, day) {
        const mealPlans = getMealPlans();
        const plan = mealPlans.find(p => p.id === planId);

        if (!plan) return false;

        if (!plan.days[day]) {
            plan.days[day] = [];
        }

        // Check if already added
        if (plan.days[day].includes(recipeId)) {
            showToast('Recipe already in this day');
            return false;
        }

        plan.days[day].push(recipeId);
        plan.updatedAt = new Date().toISOString();
        saveMealPlans(mealPlans);
        renderMealPlans();
        return true;
    }

    async function saveRecipes(recipes, successMessage = null) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
            // Update local cache immediately so getRecipes returns correct data
            // This ensures the UI reflects changes even if cloud sync is slow/fails
            cloudRecipes = [...recipes];
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
        await saveRecipes(filtered, 'Recipe deleted');
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
                    // Only return early if we got meaningful data (title AND ingredients or instructions)
                    if (recipe.title && (recipe.ingredients || recipe.instructions)) {
                        return recipe;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // Try microdata if JSON-LD didn't give us complete data
        const microdataRecipe = doc.querySelector('[itemtype*="Recipe"]');
        if (microdataRecipe) {
            extractFromMicrodata(microdataRecipe, recipe);
            if (!recipe.image) {
                recipe.image = findBestImage(doc);
            }
            if (recipe.title && (recipe.ingredients || recipe.instructions)) {
                return recipe;
            }
        }

        // Try common CSS selectors as fallback
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

        // Handle ingredients - check both recipeIngredient and ingredients properties
        const ingredientData = data.recipeIngredient || data.ingredients;
        if (ingredientData) {
            if (Array.isArray(ingredientData)) {
                recipe.ingredients = ingredientData.map(ing => {
                    if (typeof ing === 'string') return ing;
                    if (ing && typeof ing === 'object') return ing.text || ing.name || '';
                    return '';
                }).filter(Boolean).join('\n');
            } else if (typeof ingredientData === 'string') {
                recipe.ingredients = ingredientData;
            }
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
        // Only set title if not already found
        if (!recipe.title) {
            recipe.title = doc.querySelector('h1')?.textContent?.trim() ||
                           doc.querySelector('.recipe-title')?.textContent?.trim() ||
                           doc.querySelector('[class*="recipe-name"]')?.textContent?.trim() ||
                           doc.title || '';
        }

        if (!recipe.image) {
            recipe.image = findBestImage(doc);
        }

        // Only extract ingredients if not already found
        if (!recipe.ingredients) {
            // Try multiple common selectors for ingredients
            const ingredientSelectors = [
                '.ingredients li',
                '[class*="ingredient-list"] li',
                '[class*="ingredients"] li',
                '[data-testid*="ingredient"] li',
                '[class*="recipe-ingredient"]',
                '.ingredient',
                '[itemprop="recipeIngredient"]'
            ];

            for (const selector of ingredientSelectors) {
                const items = doc.querySelectorAll(selector);
                if (items.length > 0) {
                    recipe.ingredients = Array.from(items)
                        .map(el => el.textContent.trim())
                        .filter(Boolean)
                        .join('\n');
                    if (recipe.ingredients) break;
                }
            }
        }

        // Only extract instructions if not already found
        if (!recipe.instructions) {
            // Try multiple common selectors for instructions
            const instructionSelectors = [
                '.instructions li',
                '.instructions p',
                '[class*="instruction"] li',
                '[class*="instruction"] p',
                '[class*="preparation"] li',
                '[class*="preparation"] p',
                '[class*="steps"] li',
                '[class*="recipe-step"]',
                '[data-testid*="instruction"]',
                '[itemprop="recipeInstructions"]'
            ];

            for (const selector of instructionSelectors) {
                const items = doc.querySelectorAll(selector);
                if (items.length > 0) {
                    recipe.instructions = Array.from(items)
                        .map((el, i) => `${i + 1}. ${el.textContent.trim()}`)
                        .filter(s => s.length > 3)
                        .join('\n\n');
                    if (recipe.instructions) break;
                }
            }
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
        bookmarkletDrag: document.getElementById('bookmarklet-drag'),
        // View toggle
        btnGridView: document.getElementById('btn-grid-view'),
        btnListView: document.getElementById('btn-list-view'),
        // Time filter
        btnTimeFilter: document.getElementById('btn-time-filter'),
        timeFilterDropdown: document.getElementById('time-filter-dropdown'),
        timeFilterLabel: document.getElementById('time-filter-label'),
        // Bulk selection
        btnBulkSelect: document.getElementById('btn-bulk-select'),
        bulkActionsBar: document.getElementById('bulk-actions-bar'),
        btnSelectAll: document.getElementById('btn-select-all'),
        bulkSelectedCount: document.getElementById('bulk-selected-count'),
        btnBulkAddFolder: document.getElementById('btn-bulk-add-folder'),
        btnBulkDelete: document.getElementById('btn-bulk-delete'),
        btnBulkCancel: document.getElementById('btn-bulk-cancel'),
        bulkFolderDropdown: document.getElementById('bulk-folder-dropdown'),
        bulkFolderList: document.getElementById('bulk-folder-list'),
        btnBulkNewFolder: document.getElementById('btn-bulk-new-folder'),
        btnCloseBulkFolder: document.getElementById('btn-close-bulk-folder'),
        // Meal Planning
        sidebarMealPlans: document.getElementById('sidebar-meal-plans'),
        btnAddMealPlan: document.getElementById('btn-add-meal-plan'),
        mealPlanningSection: document.getElementById('meal-planning-section'),
        // Meal Plan Modal
        modalMealPlan: document.getElementById('modal-meal-plan'),
        mealPlanRecipeId: document.getElementById('meal-plan-recipe-id'),
        mealPlanSelect: document.getElementById('meal-plan-select'),
        mealPlanDay: document.getElementById('meal-plan-day'),
        noMealPlansMsg: document.getElementById('no-meal-plans-msg'),
        btnAddToMealPlan: document.getElementById('btn-add-to-meal-plan'),
        btnCreateMealPlanModal: document.getElementById('btn-create-meal-plan-modal'),
        // Bulk Meal Plan
        btnBulkAddMealPlan: document.getElementById('btn-bulk-add-meal-plan'),
        bulkMealPlanDropdown: document.getElementById('bulk-meal-plan-dropdown'),
        bulkMealPlanList: document.getElementById('bulk-meal-plan-list'),
        btnCloseBulkMealPlan: document.getElementById('btn-close-bulk-meal-plan'),
        bulkDaySelect: document.getElementById('bulk-day-select'),
        bulkMealPlanDaySelect: document.getElementById('bulk-meal-plan-day'),
        btnBulkAddToDay: document.getElementById('btn-bulk-add-to-day'),
        btnBulkNewMealPlan: document.getElementById('btn-bulk-new-meal-plan'),
        // Meal Plan Header Actions
        mealPlanActions: document.getElementById('meal-plan-actions'),
        btnRenameMealPlan: document.getElementById('btn-rename-meal-plan'),
        btnCopyIngredients: document.getElementById('btn-copy-ingredients'),
        // Ingredients Modal
        modalIngredients: document.getElementById('modal-ingredients'),
        ingredientsModalTitle: document.getElementById('ingredients-modal-title'),
        ingredientsListTextarea: document.getElementById('ingredients-list-textarea'),
        btnCopyIngredientsModal: document.getElementById('btn-copy-ingredients-modal')
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

    // View and filter state
    let currentViewMode = 'grid'; // 'grid' or 'list'
    let currentTimeFilter = 'all'; // 'all', '30', '60', '90', '120'
    let bulkSelectMode = false;
    let selectedRecipes = new Set();

    // ============================================
    // Time Parsing Utility
    // ============================================

    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return null;
        const str = timeStr.toLowerCase().trim();
        let total = 0;

        // Match hours
        const hoursMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)/);
        if (hoursMatch) {
            total += parseFloat(hoursMatch[1]) * 60;
        }

        // Match minutes
        const minsMatch = str.match(/(\d+)\s*(?:minutes?|mins?|m(?!onths?))/);
        if (minsMatch) {
            total += parseInt(minsMatch[1], 10);
        }

        // If just a number, assume minutes
        if (total === 0) {
            const numMatch = str.match(/^(\d+)$/);
            if (numMatch) {
                total = parseInt(numMatch[1], 10);
            }
        }

        return total > 0 ? total : null;
    }

    function getTotalTime(recipe) {
        const prepMins = parseTimeToMinutes(recipe.prepTime) || 0;
        const cookMins = parseTimeToMinutes(recipe.cookTime) || 0;
        return prepMins + cookMins;
    }

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
        } else if (currentFilter.startsWith('mealplan:')) {
            const planId = currentFilter.replace('mealplan:', '');
            const plans = getMealPlans();
            const plan = plans.find(p => p.id === planId);
            if (plan) {
                // Get all recipe IDs from all days
                const recipeIds = new Set();
                Object.values(plan.days).forEach(dayRecipes => {
                    dayRecipes.forEach(id => recipeIds.add(id));
                });
                filtered = filtered.filter(r => recipeIds.has(r.id));
            }
        } else if (currentFilter !== 'all') {
            filtered = filtered.filter(r =>
                r.tags && r.tags.some(t =>
                    t.toLowerCase() === currentFilter.toLowerCase()
                )
            );
        }

        if (currentSearch) {
            const searchTerms = currentSearch.toLowerCase().split(/\s+/).filter(Boolean);
            filtered = filtered.filter(r => {
                const searchableText = [
                    r.title,
                    r.ingredients,
                    r.instructions,
                    r.notes,
                    r.source,
                    ...(r.tags || [])
                ].filter(Boolean).join(' ').toLowerCase();

                // Match only if ALL search terms are found (AND logic)
                return searchTerms.every(term => searchableText.includes(term));
            });
        }

        // Apply time filter
        if (currentTimeFilter !== 'all') {
            const maxMinutes = parseInt(currentTimeFilter, 10);
            filtered = filtered.filter(r => {
                const totalTime = getTotalTime(r);
                // Include recipes with time info that's under the limit
                // Also include recipes without time info if they have at least one time field
                if (totalTime === 0) {
                    // No time info - exclude from time-filtered results
                    return false;
                }
                return totalTime <= maxMinutes;
            });
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
        } else if (currentFilter.startsWith('mealplan:')) {
            const planId = currentFilter.replace('mealplan:', '');
            const plan = getMealPlans().find(p => p.id === planId);
            titleText = plan ? plan.name : 'Meal Plan';
        } else if (currentFilter !== 'all') {
            titleText = currentFilter;
        }
        elements.contentTitle.textContent = titleText;
        elements.recipeCount.textContent = `${filtered.length} recipe${filtered.length !== 1 ? 's' : ''}`;

        // Show/hide meal plan actions
        const isViewingMealPlan = currentFilter.startsWith('mealplan:');
        if (elements.mealPlanActions) {
            elements.mealPlanActions.hidden = !isViewingMealPlan;
        }

        elements.recipeGrid.innerHTML = '';
        elements.emptyState.hidden = true;
        elements.noResults.hidden = true;

        // If viewing a meal plan, render weekly view
        if (isViewingMealPlan) {
            const planId = currentFilter.replace('mealplan:', '');
            const plan = getMealPlans().find(p => p.id === planId);
            if (plan) {
                elements.recipeGrid.innerHTML = renderMealPlanWeeklyView(plan);
                elements.recipeGrid.classList.remove('list-view', 'bulk-select-mode');

                // Set up click handlers for recipe cards in weekly view
                elements.recipeGrid.querySelectorAll('.meal-plan-card .recipe-card-link').forEach(link => {
                    link.addEventListener('click', (e) => {
                        const recipeId = link.dataset.recipeId;
                        const recipe = getRecipeById(recipeId);
                        if (recipe) {
                            openViewModal(recipe);
                        }
                    });
                });

                // Set up remove handlers
                elements.recipeGrid.querySelectorAll('.meal-plan-card-remove').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const recipeId = btn.dataset.recipeId;
                        const day = btn.dataset.day;
                        if (removeRecipeFromMealPlan(planId, day, recipeId)) {
                            renderRecipes();
                            showToast('Recipe removed from this day');
                        }
                    });
                });

                // Set up "Add Recipe" buttons
                elements.recipeGrid.querySelectorAll('[data-action="add-recipe-to-day"]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        openRecipePickerForDay(planId, btn.dataset.day);
                    });
                });

                return;
            }
        }


        // Apply view mode class
        elements.recipeGrid.classList.toggle('list-view', currentViewMode === 'list');

        // Apply bulk select mode class
        elements.recipeGrid.classList.toggle('bulk-select-mode', bulkSelectMode);

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

        // Update bulk selection UI
        updateBulkSelectionUI();
    }

    function createRecipeCard(recipe) {
        const card = document.createElement('article');
        card.className = 'recipe-card';
        card.dataset.id = recipe.id;

        // Recipe URL for new tab opening
        const recipeUrl = `${window.location.pathname}?recipe=${recipe.id}`;

        let sourceName = '';
        if (recipe.source) {
            sourceName = getSourceName(recipe.source);
        }

        // Filter out Suggested Recipes folder - Ivy shouldn't manually add recipes there
        const folders = getFolders().filter(f => f.name !== SUGGESTED_FOLDER_NAME);
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
                ${generateMealPlanSubmenu(recipe.id)}
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

        const isSelected = selectedRecipes.has(recipe.id);
        const checkboxHtml = `
            <div class="recipe-card-checkbox ${isSelected ? 'checked' : ''}" data-action="toggle-select" title="Select recipe">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
        `;

        const overlayButtons = `
            ${checkboxHtml}
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
            <a href="${recipeUrl}" class="recipe-card-link" data-recipe-link>
                ${imageHtml}
                <div class="recipe-card-content">
                    <h3 class="recipe-card-title">${escapeHtml(recipe.title)}</h3>
                    ${metaParts.length ? `<div class="recipe-card-meta">${metaParts.join('')}</div>` : ''}
                    ${tagsHtml}
                </div>
            </a>
        `;

        card.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            const link = e.target.closest('[data-recipe-link]');
            const recipeId = recipe.id;

            // Allow ctrl+click, cmd+click, middle-click to open in new tab natively
            if (link && (e.ctrlKey || e.metaKey || e.button === 1)) {
                return; // Let the browser handle it naturally
            }

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
                        // Properly await delete and cloud sync
                        (async () => {
                            await deleteRecipeById(recipeId);
                            renderRecipes();
                            renderTagsFilter();
                            renderFolders();
                        })();
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
                } else if (action === 'add-to-day') {
                    const planId = btn.dataset.planId;
                    const day = btn.dataset.day;
                    if (addRecipeToMealPlan(recipeId, planId, day)) {
                        const plan = getMealPlans().find(p => p.id === planId);
                        const dayName = day.charAt(0).toUpperCase() + day.slice(1);
                        showToast(`Added to ${plan?.name || 'meal plan'} (${dayName})`);
                    }
                    closeAllCardMenus();
                } else if (action === 'create-meal-plan') {
                    closeAllCardMenus();
                    const planName = prompt('Enter meal plan name (e.g., "Week of Jan 15"):');
                    if (planName && planName.trim()) {
                        const plan = await addMealPlan(planName.trim());
                        if (plan) {
                            renderMealPlans();
                            showToast(`Created "${plan.name}" - click menu again to add recipe`);
                        } else {
                            showToast('Meal plan with that name already exists');
                        }
                    }
                } else if (action === 'show-more-tags') {
                    const currentRecipe = getRecipeById(recipeId);
                    if (!currentRecipe) return;
                    const tagsContainer = btn.closest('.recipe-card-tags');
                    const allTags = currentRecipe.tags || [];
                    tagsContainer.innerHTML = allTags.map(t => `<span class="recipe-card-tag">${escapeHtml(t)}</span>`).join('');
                } else if (action === 'toggle-select') {
                    toggleRecipeSelection(recipeId, card);
                }
            } else {
                // In bulk select mode, clicking anywhere toggles selection
                if (bulkSelectMode) {
                    e.preventDefault();
                    toggleRecipeSelection(recipeId, card);
                    return;
                }
                // Normal click opens modal, prevent link navigation
                e.preventDefault();
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

        // Filter out Suggested Recipes folder - Ivy shouldn't manually add recipes there
        const folders = getFolders().filter(f => f.name !== SUGGESTED_FOLDER_NAME);
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

        // Show upload section for Ivy only
        const uploadSection = document.getElementById('view-upload-section');
        if (uploadSection) {
            uploadSection.hidden = !isIvy;
            // Reset upload state
            const uploadPreviewContainer = document.getElementById('upload-preview-container');
            const setAsCoverLabel = document.getElementById('set-as-cover-label');
            if (uploadPreviewContainer) uploadPreviewContainer.hidden = true;
            if (setAsCoverLabel) setAsCoverLabel.hidden = true;
            const setAsCover = document.getElementById('set-as-cover');
            if (setAsCover) setAsCover.checked = false;
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

            // Photos are already compressed, store them directly
            // No need to upload to Firebase Storage - they sync with recipe data

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

    /**
     * Compress an image file to a smaller size
     * Aggressively compresses large phone photos (iPhone, Pixel, etc.)
     * Target: ~50-100KB per image for reliable storage
     * @param {File|Blob} file - The image file to compress
     * @param {Object} options - Compression options
     * @param {number} options.maxWidth - Maximum width in pixels (default: 600)
     * @param {number} options.quality - JPEG quality 0-1 (default: 0.6)
     * @param {number} options.maxSizeKB - Max file size in KB (default: 100)
     * @returns {Promise<string>} - Compressed image as base64 data URL
     */
    function compressImage(file, options = {}) {
        const maxWidth = options.maxWidth || 600;
        const initialQuality = options.quality || 0.6;
        const maxSizeKB = options.maxSizeKB || 100;

        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                // Create canvas and draw
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Iteratively compress until under target size
                let quality = initialQuality;
                let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

                // Check size and re-compress if needed (base64 is ~33% larger than binary)
                let sizeKB = Math.round((compressedDataUrl.length * 0.75) / 1024);

                while (sizeKB > maxSizeKB && quality > 0.3) {
                    quality -= 0.1;
                    compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                    sizeKB = Math.round((compressedDataUrl.length * 0.75) / 1024);
                }

                // If still too large, reduce dimensions further
                if (sizeKB > maxSizeKB && width > 400) {
                    const smallerWidth = 400;
                    const smallerHeight = Math.round((height * smallerWidth) / width);
                    canvas.width = smallerWidth;
                    canvas.height = smallerHeight;
                    ctx.drawImage(img, 0, 0, smallerWidth, smallerHeight);
                    compressedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
                }

                console.log(`Image compressed: ${sizeKB}KB, quality: ${quality.toFixed(1)}, ${width}x${height}`);
                resolve(compressedDataUrl);
            };

            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };

            // Load image from file
            if (file instanceof File || file instanceof Blob) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target.result;
                };
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            } else if (typeof file === 'string') {
                // Already a data URL
                img.src = file;
            } else {
                reject(new Error('Invalid input: expected File, Blob, or data URL string'));
            }
        });
    }

    // ============================================
    // URL Parameters (for bookmarklet)
    // ============================================

    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        let url = params.get('url');
        const text = params.get('text');
        const action = params.get('action');
        const recipeId = params.get('recipe');

        if (!url && text) {
            const urlMatch = text.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                url = urlMatch[0];
            }
        }

        // Open specific recipe in full-page mode
        if (recipeId) {
            setTimeout(() => {
                openRecipeFullPage(recipeId);
            }, 100);
            return;
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

    // Open recipe in full-page mode (for new tab view)
    function openRecipeFullPage(recipeId) {
        const recipes = getRecipes();
        const recipe = recipes.find(r => r.id === recipeId);

        if (!recipe) {
            showToast('Recipe not found');
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }

        // Hide main app UI and show recipe in full page
        document.body.classList.add('full-page-recipe');

        // Open the view modal and make it full-page
        openViewModal(recipeId);

        // Re-enable scrolling for full-page mode (openModal sets overflow:hidden)
        document.body.style.overflow = 'auto';

        // Update page title
        document.title = `${recipe.title} - Ivy's Recipes`;
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

        fileList.forEach(async file => {
            if (!file || !file.type.startsWith('image/')) {
                return;
            }

            try {
                // Compress image - uses aggressive defaults for phone photos
                const compressedDataUrl = await compressImage(file);
                selectedPhotos.push({
                    file: file,
                    dataUrl: compressedDataUrl
                });
                updatePhotoPreviewDisplay();
            } catch (err) {
                console.error('Error compressing image:', err);
                showToast('Error processing image. Try a smaller photo.');
            }
        });
    }

    // ============================================
    // Photo Storage Helpers (for backwards compatibility)
    // ============================================

    /**
     * Get photo URL - handles both data URLs and Firebase Storage URLs
     * @param {string} photoUrl - Firebase Storage URL or data URL
     * @returns {string} - URL for display
     */
    function getPhotoUrl(photoUrl) {
        // Both data URLs and Firebase Storage URLs can be used directly
        return photoUrl;
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
    // View Mode Functions
    // ============================================

    function setViewMode(mode) {
        currentViewMode = mode;
        elements.btnGridView.classList.toggle('active', mode === 'grid');
        elements.btnListView.classList.toggle('active', mode === 'list');
        elements.recipeGrid.classList.toggle('list-view', mode === 'list');
        // Save preference
        localStorage.setItem('ivys_view_mode', mode);
    }

    function loadViewModePreference() {
        const saved = localStorage.getItem('ivys_view_mode');
        if (saved === 'list' || saved === 'grid') {
            setViewMode(saved);
        }
    }

    // ============================================
    // Time Filter Functions
    // ============================================

    function setTimeFilter(value) {
        currentTimeFilter = value;

        // Update active state on options
        document.querySelectorAll('.time-filter-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.time === value);
        });

        // Update button state and label
        if (elements.btnTimeFilter) {
            elements.btnTimeFilter.classList.toggle('active', value !== 'all');
        }
        if (elements.timeFilterLabel) {
            if (value === 'all') {
                elements.timeFilterLabel.hidden = true;
            } else {
                const labels = { '30': '<30m', '60': '<1h', '90': '<1.5h', '120': '<2h' };
                elements.timeFilterLabel.textContent = labels[value] || '';
                elements.timeFilterLabel.hidden = false;
            }
        }

        renderRecipes();
    }

    // ============================================
    // Bulk Selection Functions
    // ============================================

    function enterBulkSelectMode() {
        bulkSelectMode = true;
        selectedRecipes.clear();
        elements.btnBulkSelect.classList.add('active');
        elements.bulkActionsBar.hidden = false;
        elements.recipeGrid.classList.add('bulk-select-mode');
        updateBulkSelectionUI();
    }

    function exitBulkSelectMode() {
        bulkSelectMode = false;
        selectedRecipes.clear();
        elements.btnBulkSelect.classList.remove('active');
        elements.bulkActionsBar.hidden = true;
        elements.bulkFolderDropdown.hidden = true;
        elements.recipeGrid.classList.remove('bulk-select-mode');

        // Remove selection state from cards
        document.querySelectorAll('.recipe-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelectorAll('.recipe-card-checkbox.checked').forEach(cb => {
            cb.classList.remove('checked');
        });
    }

    function toggleRecipeSelection(recipeId, card) {
        if (selectedRecipes.has(recipeId)) {
            selectedRecipes.delete(recipeId);
            card.classList.remove('selected');
            card.querySelector('.recipe-card-checkbox')?.classList.remove('checked');
        } else {
            selectedRecipes.add(recipeId);
            card.classList.add('selected');
            card.querySelector('.recipe-card-checkbox')?.classList.add('checked');
        }
        updateBulkSelectionUI();
    }

    function toggleSelectAll() {
        const visibleCards = document.querySelectorAll('.recipe-card');
        const allSelected = visibleCards.length > 0 && selectedRecipes.size === visibleCards.length;

        if (allSelected) {
            // Deselect all
            selectedRecipes.clear();
            visibleCards.forEach(card => {
                card.classList.remove('selected');
                card.querySelector('.recipe-card-checkbox')?.classList.remove('checked');
            });
            elements.btnSelectAll.textContent = 'Select All';
        } else {
            // Select all visible
            visibleCards.forEach(card => {
                const id = card.dataset.id;
                selectedRecipes.add(id);
                card.classList.add('selected');
                card.querySelector('.recipe-card-checkbox')?.classList.add('checked');
            });
            elements.btnSelectAll.textContent = 'Deselect All';
        }
        updateBulkSelectionUI();
    }

    function updateBulkSelectionUI() {
        if (!bulkSelectMode) return;

        const count = selectedRecipes.size;
        elements.bulkSelectedCount.textContent = `${count} selected`;

        // Enable/disable bulk action buttons
        const hasSelection = count > 0;
        elements.btnBulkDelete.disabled = !hasSelection;
        elements.btnBulkAddFolder.disabled = !hasSelection;
        if (elements.btnBulkAddMealPlan) {
            elements.btnBulkAddMealPlan.disabled = !hasSelection;
        }

        // Update select all button text
        const visibleCards = document.querySelectorAll('.recipe-card');
        const allSelected = visibleCards.length > 0 && count === visibleCards.length;
        elements.btnSelectAll.textContent = allSelected ? 'Deselect All' : 'Select All';
    }

    async function handleBulkDelete() {
        const count = selectedRecipes.size;
        if (count === 0) return;

        if (!confirm(`Delete ${count} recipe${count !== 1 ? 's' : ''}? This cannot be undone.`)) {
            return;
        }

        const idsToDelete = Array.from(selectedRecipes);
        showToast(`Deleting ${count} recipe${count !== 1 ? 's' : ''}...`);

        for (const id of idsToDelete) {
            await deleteRecipeById(id);
        }

        exitBulkSelectMode();
        renderRecipes();
        renderTagsFilter();
        renderFolders();
        showToast(`Deleted ${count} recipe${count !== 1 ? 's' : ''}`);
    }

    function populateBulkFolderList() {
        const folders = getFolders().filter(f => f.name !== SUGGESTED_FOLDER_NAME);

        elements.bulkFolderList.innerHTML = folders.map(folder => `
            <button class="dropdown-item" data-folder-id="${folder.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                ${escapeHtml(folder.name)}
            </button>
        `).join('');

        if (folders.length === 0) {
            elements.bulkFolderList.innerHTML = '<p style="padding: 0.75rem; color: var(--color-text-muted); font-size: 0.875rem;">No folders yet</p>';
        }
    }

    function addSelectedRecipesToFolder(folderId) {
        const recipes = getRecipes();
        let addedCount = 0;

        selectedRecipes.forEach(recipeId => {
            const recipe = recipes.find(r => r.id === recipeId);
            if (recipe) {
                if (!recipe.folders) recipe.folders = [];
                if (!recipe.folders.includes(folderId)) {
                    recipe.folders.push(folderId);
                    addedCount++;
                }
            }
        });

        if (addedCount > 0) {
            saveRecipes(recipes);
            renderRecipes();
        }
    }

    // Bulk Meal Plan functions
    let selectedMealPlanId = null;

    function populateBulkMealPlanList() {
        const mealPlans = getMealPlans();

        elements.bulkMealPlanList.innerHTML = mealPlans.map(plan => `
            <button class="dropdown-item" data-plan-id="${plan.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ${escapeHtml(plan.name)}
            </button>
        `).join('');

        if (mealPlans.length === 0) {
            elements.bulkMealPlanList.innerHTML = '<p style="padding: 0.75rem; color: var(--color-text-muted); font-size: 0.875rem;">No meal plans yet</p>';
        }

        // Reset day selection visibility
        if (elements.bulkDaySelect) {
            elements.bulkDaySelect.hidden = true;
        }
        selectedMealPlanId = null;
    }

    function addSelectedRecipesToMealPlan(planId, day) {
        const mealPlans = getMealPlans();
        const plan = mealPlans.find(p => p.id === planId);
        if (!plan) return 0;

        if (!plan.days[day]) {
            plan.days[day] = [];
        }

        let addedCount = 0;
        selectedRecipes.forEach(recipeId => {
            if (!plan.days[day].includes(recipeId)) {
                plan.days[day].push(recipeId);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            plan.updatedAt = new Date().toISOString();
            saveMealPlans(mealPlans);
            renderMealPlans();

            // Re-render if viewing the meal plan
            if (currentFilter === `mealplan:${planId}`) {
                renderRecipes();
            }
        }

        return addedCount;
    }

    function removeRecipeFromMealPlan(planId, day, recipeId) {
        const mealPlans = getMealPlans();
        const plan = mealPlans.find(p => p.id === planId);
        if (!plan || !plan.days[day]) return false;

        const index = plan.days[day].indexOf(recipeId);
        if (index > -1) {
            plan.days[day].splice(index, 1);
            plan.updatedAt = new Date().toISOString();
            saveMealPlans(mealPlans);
            renderMealPlans();
            return true;
        }
        return false;
    }

    function moveRecipeInMealPlan(planId, fromDay, toDay, recipeId) {
        const mealPlans = getMealPlans();
        const plan = mealPlans.find(p => p.id === planId);
        if (!plan) return false;

        // Remove from old day
        if (plan.days[fromDay]) {
            const index = plan.days[fromDay].indexOf(recipeId);
            if (index > -1) {
                plan.days[fromDay].splice(index, 1);
            }
        }

        // Add to new day
        if (!plan.days[toDay]) {
            plan.days[toDay] = [];
        }
        if (!plan.days[toDay].includes(recipeId)) {
            plan.days[toDay].push(recipeId);
        }

        plan.updatedAt = new Date().toISOString();
        saveMealPlans(mealPlans);
        return true;
    }

    function openRecipePickerForDay(planId, day) {
        const dayNames = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
        const plan = getMealPlans().find(p => p.id === planId);
        if (!plan) return;

        // Get recipes already in this day to exclude them
        const existingIds = new Set(plan.days[day] || []);
        const allRecipes = getRecipes().filter(r => !r.suggestedBy);

        // Build and show the picker modal
        const modal = document.getElementById('modal-recipe-picker');
        if (!modal) return;

        const titleEl = document.getElementById('recipe-picker-title');
        const searchEl = document.getElementById('recipe-picker-search');
        const gridEl = document.getElementById('recipe-picker-grid');

        titleEl.textContent = `Add recipe to ${dayNames[day]}`;
        searchEl.value = '';

        function renderPickerResults(query) {
            const q = (query || '').toLowerCase().trim();
            const filtered = allRecipes.filter(r => {
                if (q && !r.title.toLowerCase().includes(q) &&
                    !(r.tags || []).some(t => t.toLowerCase().includes(q)) &&
                    !(r.source || '').toLowerCase().includes(q)) {
                    return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                gridEl.innerHTML = `<div class="recipe-picker-empty">No recipes found</div>`;
                return;
            }

            gridEl.innerHTML = filtered.map(recipe => {
                const inDay = existingIds.has(recipe.id);
                return `
                    <button class="recipe-picker-item ${inDay ? 'already-added' : ''}" data-recipe-id="${recipe.id}" ${inDay ? 'disabled' : ''}>
                        <div class="recipe-picker-item-image">
                            ${recipe.image
                                ? `<img src="${escapeHtml(recipe.image)}" alt="" loading="lazy">`
                                : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                                </svg>`
                            }
                        </div>
                        <div class="recipe-picker-item-info">
                            <span class="recipe-picker-item-title">${escapeHtml(recipe.title)}</span>
                            ${inDay ? '<span class="recipe-picker-item-badge">Already added</span>' : ''}
                        </div>
                    </button>
                `;
            }).join('');

            // Wire click handlers
            gridEl.querySelectorAll('.recipe-picker-item:not(.already-added)').forEach(item => {
                item.addEventListener('click', () => {
                    const recipeId = item.dataset.recipeId;
                    if (addRecipeToMealPlan(recipeId, planId, day)) {
                        existingIds.add(recipeId);
                        showToast(`Added to ${dayNames[day]}`);
                        // Mark as added visually
                        item.classList.add('already-added');
                        item.disabled = true;
                        const badge = document.createElement('span');
                        badge.className = 'recipe-picker-item-badge';
                        badge.textContent = 'Added!';
                        item.querySelector('.recipe-picker-item-info').appendChild(badge);
                        // Re-render the meal plan behind the modal
                        renderRecipes();
                        // Re-attach the picker modal since renderRecipes rebuilds the grid
                    }
                });
            });
        }

        renderPickerResults('');

        searchEl.addEventListener('input', () => {
            renderPickerResults(searchEl.value);
        });

        openModal(modal);
    }

    function showIngredientsModal(planId) {
        const mealPlans = getMealPlans();
        const plan = mealPlans.find(p => p.id === planId);
        if (!plan) return;

        const recipes = getRecipes();
        const allIngredients = [];
        const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayNames = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

        dayOrder.forEach(day => {
            const dayRecipes = plan.days[day] || [];
            if (dayRecipes.length > 0) {
                allIngredients.push(`=== ${dayNames[day]} ===`);
                dayRecipes.forEach(recipeId => {
                    const recipe = recipes.find(r => r.id === recipeId);
                    if (recipe) {
                        allIngredients.push(`\n${recipe.title}:`);
                        if (recipe.ingredients) {
                            allIngredients.push(recipe.ingredients);
                        }
                    }
                });
                allIngredients.push(''); // Empty line between days
            }
        });

        const ingredientsText = allIngredients.join('\n').trim();

        if (!ingredientsText) {
            showToast('No ingredients - add recipes to your meal plan first');
            return;
        }

        // Update modal
        if (elements.ingredientsModalTitle) {
            elements.ingredientsModalTitle.textContent = `Ingredients: ${plan.name}`;
        }
        if (elements.ingredientsListTextarea) {
            elements.ingredientsListTextarea.value = ingredientsText;
        }

        // Show modal
        openModal(elements.modalIngredients);
    }

    function copyIngredientsFromModal() {
        const text = elements.ingredientsListTextarea?.value || '';
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Ingredients copied to clipboard!');
            }).catch(() => {
                // Select all text as fallback
                elements.ingredientsListTextarea.select();
                showToast('Press Ctrl+C to copy');
            });
        }
    }

    function generateMealPlanSubmenu(recipeId) {
        const mealPlans = getMealPlans();
        const days = [
            { key: 'monday', label: 'Mon' },
            { key: 'tuesday', label: 'Tue' },
            { key: 'wednesday', label: 'Wed' },
            { key: 'thursday', label: 'Thu' },
            { key: 'friday', label: 'Fri' },
            { key: 'saturday', label: 'Sat' },
            { key: 'sunday', label: 'Sun' }
        ];

        if (mealPlans.length === 0) {
            return `
                <div class="card-meal-plan-section">
                    <div class="card-dropdown-item card-meal-plan-header">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        Add to Meal Plan
                    </div>
                    <div class="card-meal-plan-empty">
                        <p>No meal plans yet</p>
                        <button class="card-dropdown-item" data-action="create-meal-plan" data-recipe-id="${recipeId}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Create Meal Plan
                        </button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="card-meal-plan-section">
                <div class="card-dropdown-item card-meal-plan-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    Add to Meal Plan
                </div>
                ${mealPlans.map(plan => `
                    <div class="card-meal-plan-item">
                        <div class="card-meal-plan-name">${escapeHtml(plan.name)}</div>
                        <div class="card-meal-plan-days">
                            ${days.map(d => `
                                <button class="card-meal-plan-day-btn"
                                        data-action="add-to-day"
                                        data-recipe-id="${recipeId}"
                                        data-plan-id="${plan.id}"
                                        data-day="${d.key}"
                                        title="${d.key.charAt(0).toUpperCase() + d.key.slice(1)}">
                                    ${d.label}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
                <button class="card-dropdown-item card-meal-plan-new" data-action="create-meal-plan" data-recipe-id="${recipeId}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    New meal plan...
                </button>
            </div>
        `;
    }

    function renderMealPlanWeeklyView(plan) {
        const recipes = getRecipes();
        const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayNames = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

        const html = `
            <div class="meal-plan-weekly-view">
                ${dayOrder.map(day => {
                    const dayRecipes = (plan.days[day] || []).map(id => recipes.find(r => r.id === id)).filter(Boolean);
                    return `
                        <div class="meal-plan-day" data-day="${day}">
                            <div class="meal-plan-day-header">
                                <span class="meal-plan-day-name">${dayNames[day]}</span>
                                <span class="meal-plan-day-count">${dayRecipes.length} recipe${dayRecipes.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div class="meal-plan-day-recipes ${dayRecipes.length === 0 ? 'empty' : ''}" data-day="${day}" data-plan-id="${plan.id}">
                                ${dayRecipes.map(recipe => {
                                    const sourceName = recipe.source ? recipe.source.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '';
                                    const timeStr = [recipe.prepTime, recipe.cookTime].filter(Boolean).join(' + ');
                                    return `
                                        <article class="recipe-card meal-plan-card" draggable="true" data-recipe-id="${recipe.id}" data-day="${day}">
                                            <div class="meal-plan-card-drag-handle" title="Drag to move day">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                                    <circle cx="9" cy="5" r="1"></circle><circle cx="15" cy="5" r="1"></circle>
                                                    <circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle>
                                                    <circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="19" r="1"></circle>
                                                </svg>
                                            </div>
                                            <button class="meal-plan-card-remove" data-recipe-id="${recipe.id}" data-day="${day}" title="Remove from ${dayNames[day]}">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                    <path d="M18 6 6 18M6 6l12 12"></path>
                                                </svg>
                                            </button>
                                            <div class="recipe-card-link" data-recipe-id="${recipe.id}">
                                                <div class="recipe-card-image-container">
                                                    ${recipe.image
                                                        ? `<img src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.title)}" class="recipe-card-image" loading="lazy" draggable="false">`
                                                        : `<div class="recipe-card-placeholder">
                                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                                                            </svg>
                                                        </div>`
                                                    }
                                                    ${sourceName ? `<div class="card-source">${escapeHtml(sourceName)}</div>` : ''}
                                                </div>
                                                <div class="recipe-card-content">
                                                    <h3 class="recipe-card-title">${escapeHtml(recipe.title)}</h3>
                                                    ${timeStr ? `<div class="recipe-card-meta"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${escapeHtml(timeStr)}</span></div>` : ''}
                                                </div>
                                            </div>
                                        </article>
                                    `;
                                }).join('')}
                                <button class="meal-plan-add-recipe-card" data-action="add-recipe-to-day" data-day="${day}" data-plan-id="${plan.id}" title="Add a recipe to ${dayNames[day]}">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                    <span>Add Recipe</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        return html;
    }

    function setupMealPlanDragDrop() {
        // Desktop drag and drop
        document.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.meal-plan-card');
            if (item) {
                item.classList.add('dragging');
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    recipeId: item.dataset.recipeId,
                    fromDay: item.dataset.day
                }));
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => item.style.opacity = '0.4', 0);
            }
        });

        document.addEventListener('dragend', (e) => {
            const item = e.target.closest('.meal-plan-card');
            if (item) {
                item.classList.remove('dragging');
                item.style.opacity = '';
            }
            document.querySelectorAll('.meal-plan-day-recipes.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
        });

        document.addEventListener('dragover', (e) => {
            const dropZone = e.target.closest('.meal-plan-day-recipes');
            if (dropZone) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                document.querySelectorAll('.meal-plan-day-recipes.drag-over').forEach(el => {
                    if (el !== dropZone) el.classList.remove('drag-over');
                });
                dropZone.classList.add('drag-over');
            }
        });

        document.addEventListener('dragleave', (e) => {
            const dropZone = e.target.closest('.meal-plan-day-recipes');
            if (dropZone && !dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove('drag-over');
            }
        });

        document.addEventListener('drop', (e) => {
            const dropZone = e.target.closest('.meal-plan-day-recipes');
            if (dropZone) {
                e.preventDefault();
                dropZone.classList.remove('drag-over');

                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    const toDay = dropZone.dataset.day;
                    const planId = dropZone.dataset.planId;

                    if (data.recipeId && data.fromDay !== toDay) {
                        moveRecipeInMealPlan(planId, data.fromDay, toDay, data.recipeId);
                        renderRecipes();
                        showToast('Recipe moved!');
                    }
                } catch (err) {
                    console.error('Drop error:', err);
                }
            }
        });

        // Touch-based drag and drop for mobile
        let touchDragData = null;
        let touchDragEl = null;
        let touchGhost = null;

        document.addEventListener('touchstart', (e) => {
            const handle = e.target.closest('.meal-plan-card-drag-handle');
            if (!handle) return;
            const item = handle.closest('.meal-plan-card');
            if (!item) return;

            touchDragData = {
                recipeId: item.dataset.recipeId,
                fromDay: item.dataset.day
            };
            touchDragEl = item;

            touchGhost = item.cloneNode(true);
            touchGhost.classList.add('touch-drag-ghost');
            touchGhost.style.position = 'fixed';
            touchGhost.style.width = Math.min(item.offsetWidth, 180) + 'px';
            touchGhost.style.zIndex = '9999';
            touchGhost.style.pointerEvents = 'none';
            touchGhost.style.opacity = '0.85';
            touchGhost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
            touchGhost.style.transform = 'scale(0.95)';

            const touch = e.touches[0];
            touchGhost.style.left = (touch.clientX - 90) + 'px';
            touchGhost.style.top = (touch.clientY - 30) + 'px';

            document.body.appendChild(touchGhost);
            item.classList.add('dragging');
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!touchDragData || !touchGhost) return;
            e.preventDefault();

            const touch = e.touches[0];
            touchGhost.style.left = (touch.clientX - 90) + 'px';
            touchGhost.style.top = (touch.clientY - 30) + 'px';

            const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            const dropZone = elemBelow?.closest('.meal-plan-day-recipes');

            document.querySelectorAll('.meal-plan-day-recipes.drag-over').forEach(el => {
                if (el !== dropZone) el.classList.remove('drag-over');
            });
            if (dropZone) {
                dropZone.classList.add('drag-over');
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (!touchDragData) return;

            const touch = e.changedTouches[0];
            const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            const dropZone = elemBelow?.closest('.meal-plan-day-recipes');

            if (dropZone && touchDragData.fromDay !== dropZone.dataset.day) {
                const planId = dropZone.dataset.planId;
                moveRecipeInMealPlan(planId, touchDragData.fromDay, dropZone.dataset.day, touchDragData.recipeId);
                renderRecipes();
                showToast('Recipe moved!');
            }

            // Cleanup
            document.querySelectorAll('.meal-plan-day-recipes.drag-over').forEach(el => {
                el.classList.remove('drag-over');
            });
            if (touchDragEl) {
                touchDragEl.classList.remove('dragging');
                touchDragEl.style.opacity = '';
            }
            if (touchGhost && touchGhost.parentNode) {
                touchGhost.parentNode.removeChild(touchGhost);
            }
            touchDragData = null;
            touchDragEl = null;
            touchGhost = null;
        });
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

        // Meal Planning - Add new meal plan
        if (elements.btnAddMealPlan) {
            elements.btnAddMealPlan.addEventListener('click', async () => {
                const planName = prompt('Enter meal plan name (e.g., "Week of Jan 15"):');
                if (planName && planName.trim()) {
                    const plan = await addMealPlan(planName.trim());
                    if (plan) {
                        renderMealPlans();
                        showToast(`Created meal plan "${plan.name}"`);
                    } else {
                        showToast('Meal plan with that name already exists');
                    }
                }
            });
        }

        // Meal Planning - Click on meal plan or delete
        if (elements.sidebarMealPlans) {
            elements.sidebarMealPlans.addEventListener('click', (e) => {
                const deleteBtn = e.target.closest('.sidebar-folder-delete');
                if (deleteBtn) {
                    e.stopPropagation();
                    const planId = deleteBtn.dataset.planId;
                    const plans = getMealPlans();
                    const plan = plans.find(p => p.id === planId);
                    if (plan && confirm(`Delete meal plan "${plan.name}"?`)) {
                        deleteMealPlan(planId);
                        showToast('Meal plan deleted');
                    }
                    return;
                }

                const item = e.target.closest('.sidebar-item');
                if (item && item.dataset.filter) {
                    handleSidebarFilter(item.dataset.filter);
                }
            });

            // Double-click to rename
            elements.sidebarMealPlans.addEventListener('dblclick', (e) => {
                const item = e.target.closest('.sidebar-item');
                if (item && item.dataset.filter && item.dataset.filter.startsWith('mealplan:')) {
                    const planId = item.dataset.filter.replace('mealplan:', '');
                    const plans = getMealPlans();
                    const plan = plans.find(p => p.id === planId);
                    if (plan) {
                        const newName = prompt('Enter new name:', plan.name);
                        if (newName && newName.trim() && newName.trim() !== plan.name) {
                            renameMealPlan(planId, newName.trim());
                            showToast('Meal plan renamed');
                        }
                    }
                }
            });
        }

        // Meal Plan Modal - Add to meal plan button
        if (elements.btnAddToMealPlan) {
            elements.btnAddToMealPlan.addEventListener('click', () => {
                const recipeId = elements.mealPlanRecipeId.value;
                const planId = elements.mealPlanSelect.value;
                const day = elements.mealPlanDay.value;

                if (!planId) {
                    showToast('Please select a meal plan');
                    return;
                }

                if (addRecipeToMealPlan(recipeId, planId, day)) {
                    const plan = getMealPlans().find(p => p.id === planId);
                    const dayName = day.charAt(0).toUpperCase() + day.slice(1);
                    showToast(`Added to ${plan?.name || 'meal plan'} (${dayName})`);
                    closeModal(elements.modalMealPlan);
                }
            });
        }

        // Meal Plan Modal - Create new plan button
        if (elements.btnCreateMealPlanModal) {
            elements.btnCreateMealPlanModal.addEventListener('click', async () => {
                const planName = prompt('Enter meal plan name (e.g., "Week of Jan 15"):');
                if (planName && planName.trim()) {
                    const plan = await addMealPlan(planName.trim());
                    if (plan) {
                        renderMealPlans();
                        // Refresh the modal
                        const recipeId = elements.mealPlanRecipeId.value;
                        openMealPlanModal(recipeId);
                        elements.mealPlanSelect.value = plan.id;
                        showToast(`Created meal plan "${plan.name}"`);
                    } else {
                        showToast('Meal plan with that name already exists');
                    }
                }
            });
        }

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
            elements.recipeImageFile.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file && file.type.startsWith('image/')) {
                    try {
                        // Compress cover image before storing
                        const compressedDataUrl = await compressImage(file);
                        document.getElementById('recipe-image').value = compressedDataUrl;
                        elements.imagePreview.style.backgroundImage = `url(${compressedDataUrl})`;
                        elements.imagePreview.hidden = false;
                    } catch (err) {
                        console.error('Error compressing image:', err);
                        showToast('Error processing image');
                    }
                }
            });
        }

        // Edit modal photo upload
        const editPhotoUpload = document.getElementById('edit-photo-upload');
        const btnEditUploadPhotos = document.getElementById('btn-edit-upload-photos');
        const editPhotosPreview = document.getElementById('edit-photos-preview');
        let editPendingPhotos = [];

        if (btnEditUploadPhotos && editPhotoUpload) {
            btnEditUploadPhotos.addEventListener('click', () => {
                editPhotoUpload.click();
            });

            editPhotoUpload.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                for (const file of files) {
                    if (file && file.type.startsWith('image/')) {
                        try {
                            // Compress image before storing
                            const compressedDataUrl = await compressImage(file);
                            editPendingPhotos.push({ dataUrl: compressedDataUrl });
                            renderEditPhotosPreview();
                        } catch (err) {
                            console.error('Error compressing image:', err);
                            showToast('Error processing image');
                        }
                    }
                }
                e.target.value = ''; // Reset file input
            });
        }

        function renderEditPhotosPreview() {
            if (!editPhotosPreview) return;

            // Get existing photos from the recipe being edited
            const existingPhotosJson = document.getElementById('recipe-photos')?.value || '[]';
            let existingPhotos = [];
            try {
                existingPhotos = JSON.parse(existingPhotosJson);
            } catch (e) {
                existingPhotos = [];
            }

            // Combine existing and pending photos
            const allPhotos = [...existingPhotos, ...editPendingPhotos];

            editPhotosPreview.innerHTML = allPhotos.map((photo, index) => {
                const photoUrl = photo.dataUrl || photo.storageUrl || photo;
                return `
                    <div class="edit-photo-item" style="background-image: url('${photoUrl}')" data-index="${index}">
                        <button type="button" class="remove-photo" data-index="${index}">&times;</button>
                    </div>
                `;
            }).join('');

            // Add remove handlers
            editPhotosPreview.querySelectorAll('.remove-photo').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const index = parseInt(btn.dataset.index);
                    if (index < existingPhotos.length) {
                        // Remove from existing photos
                        existingPhotos.splice(index, 1);
                        document.getElementById('recipe-photos').value = JSON.stringify(existingPhotos);
                    } else {
                        // Remove from pending photos
                        const pendingIndex = index - existingPhotos.length;
                        editPendingPhotos.splice(pendingIndex, 1);
                    }
                    renderEditPhotosPreview();
                });
            });

            // Update hidden field with combined photos
            const combinedPhotos = [...existingPhotos, ...editPendingPhotos];
            document.getElementById('recipe-photos').value = JSON.stringify(combinedPhotos);
        }

        // Clear pending photos when opening add modal
        const originalOpenAddModal = openAddModal;
        openAddModal = function(showUrl = false) {
            editPendingPhotos = [];
            if (editPhotosPreview) editPhotosPreview.innerHTML = '';
            originalOpenAddModal(showUrl);
        };

        // Load existing photos when opening edit modal
        const originalOpenEditModal = openEditModal;
        openEditModal = function(id) {
            editPendingPhotos = [];
            originalOpenEditModal(id);
            // Render existing photos after modal opens
            setTimeout(renderEditPhotosPreview, 100);
        };

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
        document.getElementById('btn-open-new-tab').addEventListener('click', () => {
            if (currentViewingRecipe) {
                const url = `${window.location.pathname}?recipe=${currentViewingRecipe.id}`;
                window.open(url, '_blank');
            }
        });

        document.getElementById('btn-edit-recipe').addEventListener('click', () => {
            if (currentViewingRecipe) {
                const recipeId = currentViewingRecipe.id;
                closeModal(elements.modalView);
                openEditModal(recipeId);
            }
        });

        document.getElementById('btn-delete-recipe').addEventListener('click', async () => {
            if (currentViewingRecipe && confirm('Delete this recipe?')) {
                const recipeId = currentViewingRecipe.id;
                closeModal(elements.modalView);
                await deleteRecipeById(recipeId);
                renderRecipes();
                renderTagsFilter();
                renderFolders();
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

        // Image upload in view modal
        const viewImageUpload = document.getElementById('view-image-upload');
        const btnUploadViewImage = document.getElementById('btn-upload-view-image');
        const uploadPreview = document.getElementById('upload-preview');
        const uploadPreviewContainer = document.getElementById('upload-preview-container');
        const setAsCoverLabel = document.getElementById('set-as-cover-label');
        const setAsCoverCheckbox = document.getElementById('set-as-cover');
        const btnSaveUploadedImage = document.getElementById('btn-save-uploaded-image');
        const btnCancelUpload = document.getElementById('btn-cancel-upload');
        let pendingUploadDataUrl = null;

        if (btnUploadViewImage && viewImageUpload) {
            btnUploadViewImage.addEventListener('click', () => {
                viewImageUpload.click();
            });

            viewImageUpload.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    // Compress image before storing
                    pendingUploadDataUrl = await compressImage(file);
                    uploadPreview.style.backgroundImage = `url(${pendingUploadDataUrl})`;
                    uploadPreviewContainer.hidden = false;
                    setAsCoverLabel.hidden = false;
                } catch (err) {
                    console.error('Error compressing image:', err);
                    showToast('Error processing image');
                }
                e.target.value = ''; // Reset file input
            });
        }

        if (btnSaveUploadedImage) {
            btnSaveUploadedImage.addEventListener('click', async () => {
                if (!pendingUploadDataUrl || !currentViewingRecipe) return;

                const setAsCover = setAsCoverCheckbox?.checked;
                btnSaveUploadedImage.disabled = true;
                btnSaveUploadedImage.textContent = 'Saving...';

                try {
                    const recipe = currentViewingRecipe;
                    // Image is already compressed, store directly
                    const imageUrl = pendingUploadDataUrl;

                    // Update recipe
                    const updates = {};

                    if (setAsCover) {
                        updates.image = imageUrl;
                    } else {
                        // Add to photos array
                        const photos = recipe.photos || [];
                        photos.push({ dataUrl: imageUrl });
                        updates.photos = photos;
                    }

                    updateRecipe(recipe.id, updates);

                    // Refresh the view
                    pendingUploadDataUrl = null;
                    uploadPreviewContainer.hidden = true;
                    setAsCoverLabel.hidden = true;
                    if (setAsCoverCheckbox) setAsCoverCheckbox.checked = false;

                    // Refresh the modal view and recipe list
                    openViewModal(recipe.id);
                    renderRecipes();
                    showToast(setAsCover ? 'Cover image updated!' : 'Image added!');
                } catch (error) {
                    console.error('Error saving image:', error);
                    showToast('Error saving image. Try a smaller image.');
                } finally {
                    btnSaveUploadedImage.disabled = false;
                    btnSaveUploadedImage.textContent = 'Save Image';
                }
            });
        }

        if (btnCancelUpload) {
            btnCancelUpload.addEventListener('click', () => {
                pendingUploadDataUrl = null;
                uploadPreviewContainer.hidden = true;
                setAsCoverLabel.hidden = true;
                if (setAsCoverCheckbox) setAsCoverCheckbox.checked = false;
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
                // Exit bulk select mode first
                if (bulkSelectMode) {
                    exitBulkSelectMode();
                    return;
                }
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

        // View toggle (Grid/List)
        if (elements.btnGridView) {
            elements.btnGridView.addEventListener('click', () => {
                setViewMode('grid');
            });
        }
        if (elements.btnListView) {
            elements.btnListView.addEventListener('click', () => {
                setViewMode('list');
            });
        }

        // Time filter
        if (elements.btnTimeFilter) {
            elements.btnTimeFilter.addEventListener('click', (e) => {
                e.stopPropagation();
                elements.timeFilterDropdown.hidden = !elements.timeFilterDropdown.hidden;
                // Close other dropdowns
                elements.addRecipeDropdown.hidden = true;
                elements.dropdownMenu.hidden = true;
                if (elements.bulkFolderDropdown) elements.bulkFolderDropdown.hidden = true;
            });
        }
        if (elements.timeFilterDropdown) {
            elements.timeFilterDropdown.addEventListener('click', (e) => {
                const option = e.target.closest('.time-filter-option');
                if (option) {
                    const timeValue = option.dataset.time;
                    setTimeFilter(timeValue);
                    elements.timeFilterDropdown.hidden = true;
                }
            });
        }

        // Close time filter dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (elements.timeFilterDropdown && !elements.timeFilterDropdown.hidden) {
                if (!e.target.closest('.time-filter-container')) {
                    elements.timeFilterDropdown.hidden = true;
                }
            }
        });

        // Bulk selection toggle
        if (elements.btnBulkSelect) {
            elements.btnBulkSelect.addEventListener('click', () => {
                if (bulkSelectMode) {
                    exitBulkSelectMode();
                } else {
                    enterBulkSelectMode();
                }
            });
        }

        // Bulk actions
        if (elements.btnSelectAll) {
            elements.btnSelectAll.addEventListener('click', toggleSelectAll);
        }
        if (elements.btnBulkCancel) {
            elements.btnBulkCancel.addEventListener('click', exitBulkSelectMode);
        }
        if (elements.btnBulkDelete) {
            elements.btnBulkDelete.addEventListener('click', handleBulkDelete);
        }
        if (elements.btnBulkAddFolder) {
            elements.btnBulkAddFolder.addEventListener('click', (e) => {
                e.stopPropagation();
                populateBulkFolderList();
                elements.bulkFolderDropdown.hidden = false;
            });
        }
        if (elements.btnCloseBulkFolder) {
            elements.btnCloseBulkFolder.addEventListener('click', () => {
                elements.bulkFolderDropdown.hidden = true;
            });
        }
        if (elements.btnBulkNewFolder) {
            elements.btnBulkNewFolder.addEventListener('click', () => {
                const folderName = prompt('Enter folder name:');
                if (folderName && folderName.trim()) {
                    const folder = addFolder(folderName.trim());
                    if (folder) {
                        addSelectedRecipesToFolder(folder.id);
                        elements.bulkFolderDropdown.hidden = true;
                        renderFolders();
                        showToast(`Added ${selectedRecipes.size} recipe(s) to "${folder.name}"`);
                    }
                }
            });
        }
        if (elements.bulkFolderList) {
            elements.bulkFolderList.addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (item && item.dataset.folderId) {
                    addSelectedRecipesToFolder(item.dataset.folderId);
                    elements.bulkFolderDropdown.hidden = true;
                    const folder = getFolders().find(f => f.id === item.dataset.folderId);
                    renderFolders();
                    showToast(`Added ${selectedRecipes.size} recipe(s) to "${folder?.name || 'folder'}"`);
                }
            });
        }

        // Close bulk folder dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (elements.bulkFolderDropdown && !elements.bulkFolderDropdown.hidden) {
                if (!e.target.closest('.bulk-folder-dropdown') && !e.target.closest('#btn-bulk-add-folder')) {
                    elements.bulkFolderDropdown.hidden = true;
                }
            }
        });

        // Bulk Meal Plan event listeners
        if (elements.btnBulkAddMealPlan) {
            elements.btnBulkAddMealPlan.addEventListener('click', (e) => {
                e.stopPropagation();
                populateBulkMealPlanList();
                elements.bulkMealPlanDropdown.hidden = false;
            });
        }
        if (elements.btnCloseBulkMealPlan) {
            elements.btnCloseBulkMealPlan.addEventListener('click', () => {
                elements.bulkMealPlanDropdown.hidden = true;
                if (elements.bulkDaySelect) elements.bulkDaySelect.hidden = true;
                selectedMealPlanId = null;
            });
        }
        if (elements.btnBulkNewMealPlan) {
            elements.btnBulkNewMealPlan.addEventListener('click', async () => {
                const planName = prompt('Enter meal plan name (e.g., "Week of Jan 15"):');
                if (planName && planName.trim()) {
                    const plan = await addMealPlan(planName.trim());
                    if (plan) {
                        renderMealPlans();
                        populateBulkMealPlanList();
                        showToast(`Created meal plan "${plan.name}"`);
                    } else {
                        showToast('Meal plan with that name already exists');
                    }
                }
            });
        }
        if (elements.bulkMealPlanList) {
            elements.bulkMealPlanList.addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (item && item.dataset.planId) {
                    // Select this meal plan and show day selection
                    selectedMealPlanId = item.dataset.planId;
                    // Highlight selected plan
                    elements.bulkMealPlanList.querySelectorAll('.dropdown-item').forEach(el => {
                        el.classList.toggle('in-folder', el.dataset.planId === selectedMealPlanId);
                    });
                    // Show day selection
                    if (elements.bulkDaySelect) {
                        elements.bulkDaySelect.hidden = false;
                    }
                }
            });
        }
        if (elements.btnBulkAddToDay) {
            elements.btnBulkAddToDay.addEventListener('click', () => {
                if (!selectedMealPlanId) {
                    showToast('Please select a meal plan first');
                    return;
                }
                const day = elements.bulkMealPlanDaySelect?.value || 'monday';
                const count = addSelectedRecipesToMealPlan(selectedMealPlanId, day);
                if (count > 0) {
                    const plan = getMealPlans().find(p => p.id === selectedMealPlanId);
                    const dayName = day.charAt(0).toUpperCase() + day.slice(1);
                    showToast(`Added ${count} recipe(s) to ${plan?.name || 'meal plan'} (${dayName})`);
                }
                elements.bulkMealPlanDropdown.hidden = true;
                if (elements.bulkDaySelect) elements.bulkDaySelect.hidden = true;
                selectedMealPlanId = null;
            });
        }

        // Close bulk meal plan dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (elements.bulkMealPlanDropdown && !elements.bulkMealPlanDropdown.hidden) {
                if (!e.target.closest('.bulk-folder-dropdown') && !e.target.closest('#btn-bulk-add-meal-plan')) {
                    elements.bulkMealPlanDropdown.hidden = true;
                    if (elements.bulkDaySelect) elements.bulkDaySelect.hidden = true;
                    selectedMealPlanId = null;
                }
            }
        });

        // Meal Plan Header Actions
        if (elements.btnRenameMealPlan) {
            elements.btnRenameMealPlan.addEventListener('click', () => {
                if (!currentFilter.startsWith('mealplan:')) return;
                const planId = currentFilter.replace('mealplan:', '');
                const plans = getMealPlans();
                const plan = plans.find(p => p.id === planId);
                if (plan) {
                    const newName = prompt('Enter new name:', plan.name);
                    if (newName && newName.trim() && newName.trim() !== plan.name) {
                        renameMealPlan(planId, newName.trim());
                        elements.contentTitle.textContent = newName.trim();
                        showToast('Meal plan renamed');
                    }
                }
            });
        }
        if (elements.btnCopyIngredients) {
            elements.btnCopyIngredients.addEventListener('click', () => {
                if (!currentFilter.startsWith('mealplan:')) return;
                const planId = currentFilter.replace('mealplan:', '');
                showIngredientsModal(planId);
            });
        }

        // Ingredients modal copy button
        if (elements.btnCopyIngredientsModal) {
            elements.btnCopyIngredientsModal.addEventListener('click', copyIngredientsFromModal);
        }

        // Set up meal plan drag and drop
        setupMealPlanDragDrop();
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

                        // Check for updates immediately and periodically
                        registration.update();

                        // Check for updates every 5 minutes
                        setInterval(() => {
                            registration.update();
                        }, 5 * 60 * 1000);

                        // Handle updates - when new SW is waiting, activate it
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            if (newWorker) {
                                newWorker.addEventListener('statechange', () => {
                                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                        // New version available, reload to get it
                                        console.log('New version available, reloading...');
                                        window.location.reload();
                                    }
                                });
                            }
                        });
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
            deleteRecipeById(recipeId);
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
        const mealPlanningLabel = document.querySelector('#meal-planning-section .sidebar-section-label');

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

        if (mealPlanningLabel) {
            mealPlanningLabel.classList.add('collapsible-header');
            mealPlanningLabel.innerHTML = `
                <span>Meal Planning</span>
                <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;
            mealPlanningLabel.addEventListener('click', () => toggleSection('meal-planning'));
            if (collapsedSections['meal-planning']) {
                document.getElementById('meal-planning-section').classList.add('collapsed');
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

        // Listen for messages from service worker (for photo shares and updates)
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
                // Handle content updates - reload on next user interaction or after short delay
                if (event.data && event.data.type === 'CONTENT_UPDATED') {
                    console.log('New content available');
                    // Auto-reload after a short delay if user is not actively doing something
                    setTimeout(() => {
                        if (!document.querySelector('.modal:not([hidden])')) {
                            window.location.reload();
                        }
                    }, 2000);
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

            // Photo migration disabled - photos now stored as compressed base64 directly with recipe data
        } else {
            // Firebase failed to initialize, show offline status
            initCloudSyncButton();
        }

        renderRecipes();
        renderTagsFilter();
        renderFolders();
        renderMealPlans();
        setupEventListeners();
        setupBookmarklet();
        setupAuthOverlay();
        setupCollapsibleSections();
        loadViewModePreference();
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
