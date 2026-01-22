# Firebase Setup Guide for Ivy's Recipes

This guide will walk you through setting up Firebase for your recipe app, including Realtime Database and Cloud Storage for photo backup.

## Prerequisites

- A Google account
- Your recipe app already configured with Firebase credentials in `app.js`

## Table of Contents

1. [Firebase Realtime Database Setup](#1-firebase-realtime-database-setup)
2. [Firebase Storage Setup](#2-firebase-storage-setup)
3. [Testing Your Setup](#3-testing-your-setup)
4. [Troubleshooting](#4-troubleshooting)

---

## 1. Firebase Realtime Database Setup

Your recipes and folders are stored in Firebase Realtime Database. Follow these steps to configure security rules:

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

- **`.read: true`** - Allows anyone to read recipes and folders (so visitors can browse)
- **`.write: true`** - Allows anyone to write (the app handles permissions client-side)
- **`.validate`** - Ensures recipes have required fields (title, createdAt) and folders have (name, createdAt)

### Optional: More Restrictive Rules

If you want only authenticated users to write data, you can use these rules instead:

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

## 2. Firebase Storage Setup

Photos (cover images and cookbook photos) are stored in Firebase Storage. This keeps your localStorage from filling up!

### Step 1: Navigate to Storage

1. In the Firebase Console, click **"Build"** in the left sidebar
2. Click **"Storage"**
3. If you haven't set up Storage yet, click **"Get started"**
   - Click **"Next"** on the security rules screen
   - Select your Cloud Storage location (choose the closest to your users)
   - Click **"Done"**

### Step 2: Configure Storage Rules

1. Click on the **"Rules"** tab at the top
2. Replace the existing rules with the following:

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Allow public read access to all files
    match /{allPaths=**} {
      allow read: if true;
    }

    // Allow write access to recipe photos for all users
    // (App handles permissions client-side)
    match /recipes/{recipeId}/{fileName} {
      allow write: if true;
      allow delete: if true;

      // Optional: Limit file size to 5MB and only allow images
      // allow write: if request.resource.size < 5 * 1024 * 1024
      //               && request.resource.contentType.matches('image/.*');
    }
  }
}
```

3. Click **"Publish"** to save the rules

### What These Rules Do:

- **`allow read: if true`** - Anyone can view photos (so visitors can see recipe images)
- **`allow write: if true`** - Anyone can upload photos in the `/recipes/{recipeId}/` folder structure
- **`allow delete: if true`** - Photos can be deleted when recipes are removed

### Optional: More Restrictive Storage Rules

If you want only authenticated users to upload/delete photos:

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
    }

    match /recipes/{recipeId}/{fileName} {
      allow write: if request.auth != null;
      allow delete: if request.auth != null;
    }
  }
}
```

### Step 3: Verify Your Storage Bucket

1. Go back to the **"Files"** tab in Storage
2. Your storage bucket should be: **ivys-recipes.firebasestorage.app**
3. This matches the config in your `app.js` file ✓

---

## 3. Testing Your Setup

### Test Realtime Database

1. Open your recipe app in a browser
2. Try adding a new recipe
3. Go to Firebase Console > Realtime Database > Data tab
4. You should see your recipe appear under the `recipes` node
5. Try editing or deleting the recipe
6. Changes should reflect immediately in the Firebase console

### Test Firebase Storage

1. In your recipe app, add a recipe with a photo:
   - Click **"+ Add Recipe"** > **"From URL"** or **"Manual Entry"**
   - Upload a cover image or use **"From Cookbook Photo"**
   - Save the recipe
2. You should see a toast notification: **"Uploading photos to cloud..."**
3. Go to Firebase Console > Storage > Files tab
4. You should see a folder structure like:
   ```
   recipes/
   └── [recipe-id]/
       ├── cover.jpg
       └── photo-0-[timestamp].jpg
   ```
5. Click on a photo to view it - you should see the image preview

### Test Photo Migration

If you had recipes with photos **before** adding Firebase Storage:

1. Refresh your recipe app
2. Wait a few seconds (migration runs in the background)
3. You should see a toast: **"X photos backed up to cloud!"**
4. Check Firebase Storage - old photos should now be uploaded
5. The app will mark migration as complete so it only runs once

---

## 4. Troubleshooting

### "Permission denied" errors in Database

**Problem:** You see errors in the browser console like `PERMISSION_DENIED`

**Solutions:**
1. Check that you published the Database rules (Step 1.3)
2. Make sure the rules allow `.read: true` and `.write: true`
3. Try refreshing the Firebase console and check the Rules tab

### "Upload failed" or photos not appearing

**Problem:** Photos don't upload to Storage or show broken images

**Solutions:**
1. Verify Storage rules are published (Step 2.2)
2. Check your `app.js` has the correct `storageBucket` value:
   ```javascript
   storageBucket: "ivys-recipes.firebasestorage.app"
   ```
3. Open browser DevTools > Console and look for errors
4. Check Firebase Console > Storage > Files to see if uploads are arriving
5. Make sure you have internet connection (Storage requires online access)

### Photos still stored in localStorage

**Problem:** Photos aren't migrating to cloud

**Solutions:**
1. Open DevTools > Application > Local Storage
2. Check `ivys_recipes` - if photos are base64 data URLs (very long strings starting with `data:image`), they haven't migrated yet
3. Force migration by clearing this localStorage key:
   ```javascript
   localStorage.removeItem('ivys_photo_migration_done');
   ```
4. Refresh the page - migration should run again
5. Check browser console for migration logs: `"Starting photo migration to Firebase Storage..."`

### Database/Storage quota limits

**Free Spark Plan Limits:**
- **Realtime Database**: 1 GB stored, 10 GB/month downloaded
- **Storage**: 5 GB stored, 1 GB/day downloaded
- **Bandwidth**: 360 MB/day

**What this means for you:**
- You can store approximately **5,000-10,000 recipes** (with text only)
- You can store approximately **5,000 photos** (assuming ~1MB each after compression)
- If you hit limits, consider:
  - Upgrading to Blaze (pay-as-you-go) plan
  - Compressing images more aggressively
  - Deleting unused recipes/photos

### Check your current usage:

1. Go to Firebase Console
2. Click **"Usage and billing"** in the left sidebar
3. View your usage stats for Database and Storage

---

## Security Considerations

### Current Setup (Open Access)

The current rules allow **anyone** to read and write data. This is fine if:
- You're the only user (or trust all users)
- You're okay with visitors suggesting recipes
- The app handles permissions (Ivy vs. non-Ivy users) client-side

### Recommended for Production (Authenticated Access)

For better security, consider:

1. **Enable Firebase Authentication:**
   - Email/password auth for Ivy
   - Anonymous auth for guests (read-only)

2. **Update Database Rules:**
   ```json
   {
     "rules": {
       "recipes": {
         ".read": true,
         ".write": "auth.uid === 'ivy-user-id'"
       }
     }
   }
   ```

3. **Update Storage Rules:**
   ```
   allow write: if request.auth.uid == 'ivy-user-id';
   ```

This ensures only you (Ivy) can modify recipes, while others can still browse.

---

## Summary Checklist

- [ ] Firebase Realtime Database rules published
- [ ] Firebase Storage rules published
- [ ] Test: Add a recipe and see it in Firebase Console
- [ ] Test: Upload a photo and see it in Storage
- [ ] Test: Photos migrate from localStorage to Storage
- [ ] Check Usage & Billing to monitor quota
- [ ] (Optional) Set up Firebase Authentication for production

---

## Need Help?

If you encounter issues:

1. Check the browser DevTools Console for errors
2. Review Firebase Console > Realtime Database > Data (for recipe data)
3. Review Firebase Console > Storage > Files (for photos)
4. Check Firebase Console > Usage and billing (for quota)
5. Refer to official docs: [Firebase Documentation](https://firebase.google.com/docs)

Your app is now configured for cloud sync and photo backup! 🎉
