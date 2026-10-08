# CertiChain AI: GitHub par chalane ka guide

Is folder me 3 cheezein hain:
- `index.html`: aapki website (login, ledger, verify, history, backup sab isi me)
- `firestore.rules`: database ki security rules
- `ai-server/`: chhota server jo certificate ko Claude se check karwata hai

Aapko sirf **2 cheezein index.html me paste** karni hain: `FIREBASE_CONFIG` aur `AI_URL`.

---

## Step 1: Firebase (shared ledger aur login), free hai

1. console.firebase.google.com par jao, **Add project** karo (naam kuch bhi, Google Analytics band kar sakti ho).
2. Left menu me **Build > Firestore Database > Create database**. Location `asia-south1 (Mumbai)` chuno, mode **Production** rakho.
3. Firestore me **Rules** tab kholo. Jo likha hai sab hata kar `firestore.rules` file ka poora text paste karo, phir **Publish**.
4. **Build > Authentication > Get started > Email/Password > Enable**.
5. Project settings (gear icon) > **Your apps** > `</>` (Web) dabao, app ka naam do, **Register**. Jo `firebaseConfig` dikhe use copy karo.
6. `index.html` me ye line dhoondo aur values bhar do (sirf 4 values chahiye):
   `const FIREBASE_CONFIG={apiKey:'',authDomain:'',projectId:'',appId:''};`

## Step 2: GitHub Pages

1. Is poore folder ko ek GitHub repo me upload karo.
2. Repo me **Settings > Pages > Source: Deploy from a branch > main / (root)** chuno. Kuch minute baad link milega, jaise `https://yourname.github.io/certichain/`.
3. Firebase me **Authentication > Settings > Authorized domains > Add domain** me `yourname.github.io` daalo (bina `https://` aur bina `/certichain` ke).

## Step 3: AI server (Vercel), unstored certificate check ke liye

1. vercel.com par GitHub se login karo, **Add New > Project**, wahi repo import karo.
2. **Root Directory** me `ai-server` chuno, phir Deploy.
3. Vercel > Project > **Settings > Environment Variables**:
   - `ANTHROPIC_API_KEY` = console.anthropic.com se banayi hui key
   - `ALLOWED_ORIGINS` = `https://yourname.github.io` (sirf site ka address, bina path ke)
4. **Deployments** me jaakar Redeploy karo.
5. `index.html` me ye line badlo:
   `const AI_URL='https://YOUR-PROJECT.vercel.app/api/analyze';`
6. Updated `index.html` GitHub par dobara upload karo.
7. Anthropic console me **monthly spend limit** zaroor lagao.

## Step 4: Pehla admin (jo certificates issue kar sakta hai)

1. Apni site khol kar **Sign up** karo.
2. Left menu (profile) kholo. Wahan **Account ID** dikhega. Use copy karo.
3. Firebase > Firestore > **Start collection** > Collection ID: `admins` > Document ID: wahi Account ID > ek field `role` = `admin` > Save.
4. Site refresh karo. Menu me ab **Editor** likha aayega aur Issue certificate chalega.

Doosre college staff ke liye bhi yehi karo: wo sign up kare, Account ID bheje, aap `admins` me add karo.

## Step 5: Test

1. Admin se ek certificate issue karo aur credential file save karo.
2. Doosre phone ya laptop par kisi aur account se login karke wahi certificate upload karo. **Original** aana chahiye (ledger shared hai).
3. Ek bina issue kiya certificate upload karo. Verify page par badge **AI engine connected** dikhna chahiye aur AI se result aana chahiye.
4. Kisi certificate me naam badal kar upload karo. **Fake** aana chahiye.
5. History me jaakar **Download full backup** aur **Export history (CSV)** try karo.

## Purana data (agar pehle demo me kuch issue kiya tha)
Purane browser me History > **Download full backup** karo. Phir naye link par admin se login karke **Restore from backup** karo. Ledger aur certificates Firebase me chale jaayenge.

## Dhyan rakhne ki baatein
- Firebase config ko public rakhna theek hai, wo secret nahi hota. Asli suraksha `firestore.rules` se hoti hai. Rules publish karna na bhoolo.
- Anthropic API key kabhi `index.html` me mat daalna. Wo sirf Vercel me rahegi.
- Ledger ke blocks kisi se edit ya delete nahi ho sakte (rules me band hai). Galat certificate ko **Revoke** karna hota hai.
- Badi sankhya me use karne se pehle Firebase Authentication me email verification aur App Check lagana achha rahega.
