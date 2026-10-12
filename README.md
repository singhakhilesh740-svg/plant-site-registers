# Plant Site Registers — Google Login + Firebase Cloud

Plant Site Registers app (Works · Material · Expense · Manage), ab **Gmail login** aur **Firebase Firestore** cloud sync ke saath.

- Har user ka data alag: `users/{uid}/works`, `users/{uid}/mat`, `users/{uid}/exp`, `users/{uid}/meta/lists`
- Offline kaam karta hai — net aate hi upload
- Ek account se phone + web dono par same data
- Purane app ka phone data, pehli baar login par khud cloud me upload ho jata hai

## Folder structure

```
www/                  web app (GitHub Pages + APK dono yahi use karte hain)
  index.html          app
  firebase-config.js  ← apna Firebase web config yahan paste karo
  js/cloud.js         login + sync (src/cloud.js se build hota hai)
src/cloud.js          sync code ka source
firestore.rules       Firestore security rules
android-res/          app icons
scripts/patch-android.js
.github/workflows/    build-apk.yml (APK) + pages.yml (website)
```

## Setup (ek baar)

### 1. Firebase project
1. https://console.firebase.google.com → **Add project** → naam e.g. `plant-site-registers`
2. **Build → Authentication → Get started → Sign-in method → Google → Enable** (support email: apna Gmail) → Save
3. **Build → Firestore Database → Create database** → location `asia-south1 (Mumbai)` → production mode
4. Firestore → **Rules** tab → `firestore.rules` ka content paste → **Publish**

### 2. Web app config
Project settings (⚙) → **Your apps → Web (`</>`)** → naam `plant-site-registers-web` → Register → jo `firebaseConfig` mile uski values `www/firebase-config.js` me paste karo.

### 3. Android app + SHA-1
Project settings → **Add app → Android**
- Package name: `com.roadregister.app` (purana hi rakha hai taaki naya APK purane app ke upar install ho)
- SHA-1 aur SHA-256: neeche step 4 wale keystore ke
- **google-services.json download** karo (Google sign-in enable karne ke *baad* download karna, warna login fail hoga)

### 4. Signing keystore (GitHub secret ke liye)
Purana APK is key se signed hai: **SHA-1 `33:8F:BF:A1:C6:65:F7:A5:09:73:AD:5C:E9:8C:D8:B4:7D:0B:7B:F9`**

**Option A (best — phone ka purana data bachega):** jis PC par purana APK banaya tha, wahan ka debug keystore use karo. PowerShell:
```powershell
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -storepass android | findstr SHA
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.android\debug.keystore")) | Set-Clipboard
```
SHA-1 upar wale se match kare to yahi use karo — naya APK purane ke upar install hoga.

**Option B:** saath diya `DEBUG_KEYSTORE_BASE64.txt` use karo
(SHA-1 `47:A9:89:58:32:66:2B:EC:78:DE:CD:1E:DA:09:EB:1B:F5:C0:35:E2`,
SHA-256 `D1:CC:66:2E:F9:63:BB:D6:9B:0D:F6:76:59:8B:88:B4:60:A5:BD:98:FA:DE:40:04:8D:3D:32:17:1A:44:89:12`).
Isme purana app **uninstall** karna padega — pehle zaroori data Excel/PDF export kar lo.

Jo bhi keystore use karo, uska SHA-1 + SHA-256 Firebase Android app me add hona chahiye.

### 5. GitHub repo
```bash
git init && git add . && git commit -m "Plant Site Registers with Google login + Firebase"
git branch -M main
git remote add origin https://github.com/singhakhilesh740-svg/plant-site-registers.git
git push -u origin main
```
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
| Name | Value |
|---|---|
| `GOOGLE_SERVICES_JSON` | google-services.json ka poora content |
| `DEBUG_KEYSTORE_BASE64` | step 4 ka base64 text |

### 6. Website (GitHub Pages)
Repo → **Settings → Pages → Source: GitHub Actions**.
Firebase → Authentication → **Settings → Authorized domains → Add** `singhakhilesh740-svg.github.io`

### 7. APK download
Repo → **Actions → Build Android APK** → latest run → **Artifacts → PlantSiteRegisters-apk** → zip me `PlantSiteRegisters.apk`.
Har `git push` par naya APK + website auto-update.

## Code change ke baad
`src/cloud.js` badla ho to `npm install && npm run build`. `www/index.html` badalne par build ki zaroorat nahi — bas push.

## Local Android Studio build (optional)
```bash
npm install
npm run build
npx cap add android
copy google-services.json android\app\
node scripts/patch-android.js
npx cap sync android
npx cap open android
```

## Firebase Console me data kahan dikhega
Firestore Database → `users` → (user ka UID) → `works` / `mat` / `exp` / `meta`.
`users/{uid}` document me email, naam, last login bhi save hota hai.
