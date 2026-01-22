# Firebase Setup Guide for Ivy's Recipes

This guide will walk you through setting up Firebase Realtime Database for your recipe app so you can access your recipes from anywhere.

## Prerequisites

- A Google account
- Your recipe app already configured with Firebase credentials in `app.js`

## What You're Setting Up

Firebase Realtime Database (free tier) will store:
- All your recipe data (titles, ingredients, instructions, etc.)
- Recipe photos (as compressed base64 images)
- Folders and organization
- Favorites and tags

**Good news:** Everything syncs automatically across all your devices! Photos are compressed to ~1MB each, and the free tier gives you 1GB of storage (enough for hundreds of recipes with photos).

---

## Firebase Realtime Database Setup

Your recipes, photos, and folders are all stored in Firebase Realtime Database.

### Step 1: Access Firebase Console

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Sign in with your Google account
3. Click on your project: **ivys-recipes**

### Step 2: Navigate to Realtime Database

1. In the left sidebar, click **"Build"** section
2. Click **"Realtime Database"**
3. You should see your database URL: `https://ivys-recipes-default-rtdb.firebaseio.com`

### Step 3: Configure Database Rules

1. Click on the **"Rules"** tab at the top
2. Replace the existing rules with the following:

```json
{
  "rules": {
    "recipes": {
      ".read": true,
      ".write": true,
      "$recipeId": {
        ".validate": "newData.hasChildren(['title', 'createdAt'])"
      }
    },
    "folders": {
      ".read": true,
      ".write": true,
      "$folderId": {
        ".validate": "newData.hasChildren(['name', 'createdAt'])"
      }
    }
  }
}
```

3. Click **"Publish"** button to save the rules

### What These Rules Do:

- **`.read: true`** - Allows anyone to read recipes and folders (so you and visitors can browse)
- **`.write: true`** - Allows anyone to write (the app handles permissions client-side with the Ivy password)
- **`.validate`** - Ensures recipes have required fields (title, createdAt) and folders have (name, createdAt)

### Optional: More Restrictive Rules

If you want only authenticated users to write data (requires Firebase Authentication setup):

```json
{
  "rules": {
    "recipes": {
      ".read": true,
      ".write": "auth != null"
    },
    "folders": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

**Note:** This requires implementing Firebase Authentication, which is not currently in the app.

---

## Testing Your Setup

### Test on Desktop

1. Open your recipe app in a browser
2. Enter the Ivy password when prompted (or browse as a visitor)
3. Try adding a new recipe with a photo
4. Go to Firebase Console > Realtime Database > Data tab
5. You should see your recipe appear under the `recipes` node with all its data including the photo
6. Try editing or deleting the recipe - changes should sync immediately

### Test on Mobile

1. Open your recipe app on your phone
2. Add or edit a recipe
3. The changes should appear instantly on your desktop browser (and vice versa!)
4. Try going offline (airplane mode), editing a recipe, then going back online
5. Changes should sync when reconnected

### Test Multiple Devices

1. Open the app on your phone and computer at the same time
2. Add a recipe on one device
3. It should appear on the other device within seconds
4. This is how you can access your recipes from anywhere!

---

## Troubleshooting

### "Permission denied" errors

**Problem:** You see errors in the browser console like `PERMISSION_DENIED`

**Solutions:**
1. Check that you published the Database rules (Step 3 above)
2. Make sure the rules allow `.read: true` and `.write: true`
3. Try refreshing the Firebase console and check the Rules tab
4. Clear your browser cache and reload the app

### Photos not syncing

**Problem:** Recipes sync but photos don't appear on other devices

**Solutions:**
1. Photos are embedded in the recipe data, so if recipes sync, photos should too
2. Check your internet connection - photos are ~1MB each and need good bandwidth
3. Open DevTools > Console and look for errors
4. Check Firebase Console > Realtime Database > Data > recipes > [recipe-id] > photos
5. You should see base64 data (long strings starting with `data:image/jpeg;base64,`)

### "Storage full" or "QuotaExceededError"

**Problem:** Can't save recipes with photos, getting quota errors

**Solutions:**
1. This means you've hit the browser's localStorage limit (usually 5-10MB)
2. Check Firebase Console to ensure cloud sync is working - data should be there
3. Your recipes ARE in the cloud, so you can clear browser data and they'll reload
4. To free up space:
   - Delete old/unused recipes
   - Use fewer photos per recipe
   - The app already compresses images (800px, 60% quality)

### Changes not syncing between devices

**Problem:** Add a recipe on one device but it doesn't appear on another

**Solutions:**
1. Check internet connection on both devices
2. Refresh the app on both devices (pull down to refresh on mobile)
3. Check Firebase Console > Realtime Database > Data to see if data is there
4. Open browser console and look for Firebase connection errors
5. Make sure both devices are connected to the same Firebase project

### Database quota limits

**Free Spark Plan Limits:**
- **Realtime Database**: 1 GB stored, 10 GB/month downloaded
- **Maximum connections**: 100 simultaneous connections
- **Bandwidth**: No daily limit on free tier, but 10GB/month total

**What this means for you:**
- You can store approximately **500-1,000 recipes with photos** (compressed ~1MB each)
- You can store approximately **10,000 text-only recipes** (no photos)
- If you hit limits, consider:
  - Upgrading to Blaze (pay-as-you-go) plan (~$5/month for most users)
  - Compressing images more aggressively
  - Deleting unused recipes/photos
  - Using external image URLs instead of embedded photos

### Check your current usage:

1. Go to Firebase Console
2. Click **"Usage and billing"** in the left sidebar
3. View your **Realtime Database** usage stats
4. If you're close to 1GB, time to upgrade or clean up

---

## How It Works

### Data Storage

All your data is stored in Firebase Realtime Database in this structure:

```
ivys-recipes (root)
├── recipes/
│   ├── recipe-id-1/
│   │   ├── title: "Chocolate Cake"
│   │   ├── ingredients: "..."
│   │   ├── instructions: "..."
│   │   ├── image: "data:image/jpeg;base64,..." (cover image)
│   │   ├── photos: [
│   │   │   { dataUrl: "data:image/jpeg;base64,..." },
│   │   │   { dataUrl: "data:image/jpeg;base64,..." }
│   │   │ ]
│   │   ├── tags: ["dessert", "chocolate"]
│   │   ├── folders: ["folder-id-1"]
│   │   └── createdAt: "2026-01-22T..."
│   ├── recipe-id-2/
│   └── ...
└── folders/
    ├── folder-id-1/
    │   ├── name: "Desserts"
    │   └── createdAt: "2026-01-22T..."
    └── ...
```

### Sync Strategy

1. **Initial Load**: App loads data from Firebase when you open it
2. **Real-time Listeners**: App listens for changes and updates automatically
3. **Local Cache**: Browser localStorage keeps a backup for offline access
4. **Cloud Priority**: Cloud data takes priority over local data

### Image Compression

Photos are automatically compressed before saving:
- **Max width**: 800px (maintains aspect ratio)
- **Quality**: 60% (fallback to 40% if still too large)
- **Format**: JPEG
- **Target size**: Under 500KB per image

This ensures your recipes load fast and you don't hit storage limits quickly.

---

## Security Considerations

### Current Setup (Password-Based Access)

The app uses a simple password system:
- **Ivy** (with password): Full access to add, edit, delete
- **Visitors** (no password): Can browse and suggest recipes

The Firebase rules allow anyone to read/write, but the app controls permissions client-side.

**This is fine for:**
- Personal/family use
- Trusted users only
- The Ivy password is kept private

**Not recommended for:**
- Public websites
- Untrusted users
- Sensitive data

### Recommended for Production (Firebase Authentication)

For better security, consider implementing Firebase Authentication:

1. **Enable Firebase Authentication:**
   - Email/password auth for Ivy
   - Anonymous auth for guests (read-only)

2. **Update Database Rules:**
   ```json
   {
     "rules": {
       "recipes": {
         ".read": true,
         ".write": "auth.uid === 'YOUR-IVY-USER-ID'"
       },
       "folders": {
         ".read": true,
         ".write": "auth.uid === 'YOUR-IVY-USER-ID'"
       }
     }
   }
   ```

This ensures only you can modify recipes at the database level, not just client-side.

---

## Summary Checklist

- [ ] Firebase Realtime Database rules published
- [ ] Test: Add a recipe and see it in Firebase Console
- [ ] Test: Add a recipe with a photo and see it sync
- [ ] Test: Open app on two devices and verify sync works
- [ ] Test: Go offline, make changes, go online - verify sync
- [ ] Check Usage & Billing to monitor quota (aim to stay under 1GB)
- [ ] (Optional) Set up Firebase Authentication for production

---

## FAQ

**Q: Do I need to pay for Firebase?**
A: No! The free Spark plan is enough for personal use (1GB storage, 10GB/month bandwidth).

**Q: Can I access recipes without internet?**
A: Yes! Recipes are cached in your browser. You can view them offline, but changes won't sync until you're back online.

**Q: Will my photos use a lot of data?**
A: Each photo is compressed to ~500KB-1MB. If you have 100 recipes with 2 photos each, that's ~200MB total.

**Q: Can I share recipes with family?**
A: Yes! Just share the website URL. They can browse recipes (no password needed) or suggest recipes.

**Q: What if I accidentally delete a recipe?**
A: Currently there's no undo. Consider exporting your recipes regularly (Export button in menu) as a backup.

**Q: Can I use my own images instead of compressed ones?**
A: You can use image URLs (from other websites) as cover images, and those won't count toward storage. Just paste the URL in the "Cover Image URL" field.

---

## Need Help?

If you encounter issues:

1. Check the browser DevTools Console (F12) for errors
2. Review Firebase Console > Realtime Database > Data (to see your data)
3. Check Firebase Console > Usage and billing (for quota)
4. Test your internet connection
5. Refer to official docs: [Firebase Documentation](https://firebase.google.com/docs)

Your app is now configured for cloud sync across all devices! 🎉
