# Ivy's Recipes

A simple, beautiful recipe manager that works like Pocket but for recipes. Save recipes from any website, organize them with tags, and find them easily.

## Features

- **Save recipes from any URL** - Paste a recipe link and automatically extract title, ingredients, instructions, cook time, and more
- **Tag and organize** - Add tags like "Quick", "Vegan", "Instant Pot", "Summer" to categorize your recipes
- **Search instantly** - Find recipes by name, ingredient, or tag
- **Works offline** - Once loaded, the app works without internet (it's a Progressive Web App)
- **Install on any device** - Add to your home screen on phone or desktop for app-like experience
- **Export/Import** - Backup your recipes to a JSON file or transfer to another device
- **Bookmarklet** - One-click save from any recipe website

## Getting Started

### Option 1: Host on GitHub Pages (Recommended)

1. Fork this repository
2. Go to Settings > Pages
3. Select "Deploy from a branch" and choose `main`
4. Your app will be live at `https://yourusername.github.io/Ivys-Recipes`

### Option 2: Run Locally

Just open `index.html` in your browser. No server required!

For full PWA features (install prompt, offline), you'll need a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve
```

Then open `http://localhost:8000`

## How to Use

### Adding Recipes

1. Click **+ Add Recipe**
2. Either:
   - Paste a recipe URL and click **Fetch** to auto-extract recipe details
   - Or enter the recipe details manually
3. Add tags to help organize (click suggestions or type your own)
4. Click **Save Recipe**

### Using the Bookmarklet

1. Click the menu (⋯) > **Get Bookmarklet**
2. Drag the button to your bookmarks bar
3. When you find a recipe online, click the bookmark to save it

### Installing the App

**On Phone:**
- iOS: Tap Share > "Add to Home Screen"
- Android: Tap menu > "Install app" or "Add to Home Screen"

**On Desktop:**
- Chrome/Edge: Click the install icon in the address bar

### Backup & Sync

Your recipes are stored in your browser's local storage. To backup or transfer:

1. Click menu (⋯) > **Export Recipes** to download a JSON file
2. On another device, click **Import Recipes** to restore

## Generating App Icons

For the best experience when installing the app, generate PNG icons:

1. Open `icons/generate-icons.html` in your browser
2. Download each icon size
3. Save them in the `icons/` folder

## Tech Stack

- Pure HTML, CSS, and JavaScript (no frameworks)
- Progressive Web App (PWA) with offline support
- LocalStorage for data persistence
- Uses recipe schema.org structured data for auto-extraction

## License

MIT License - feel free to use and modify!
