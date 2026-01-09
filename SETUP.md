# Backend Setup Instructions

## 1️⃣ Install Dependencies

Run this command in the terminal:

```bash
bun install
```

If you get PowerShell execution policy errors, run this first:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

---

## 2️⃣ Configure Firebase

### Step 1: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Click the **Settings gear** ⚙️ → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the JSON file (e.g., `firebase-service-account.json`)

### Step 2: Enable Required Firebase Services

In Firebase Console:

1. **Authentication**

   - Go to Authentication → Sign-in method
   - Enable **Email/Password** provider

2. **Firestore Database**

   - Go to Firestore Database
   - Click **Create Database**
   - Start in **Test Mode** (for development)
   - Choose your location

3. **Storage**
   - Go to Storage
   - Click **Get Started**
   - Start in **Test Mode** (for development)

### Step 3: Update Environment Variables

Edit the `.env` file in the backend root directory:

**Option A: Use Service Account JSON File (Easier)**

```env
# Just specify the path to your JSON file
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json

FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3001,http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Option B: Use Individual Environment Variables**

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3001,http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Important:** Make sure to replace:

- `your-project-id` with your actual Firebase project ID
- `FIREBASE_CLIENT_EMAIL` with the email from the service account
- `FIREBASE_PRIVATE_KEY` with the private key (keep the quotes and `\n` for newlines)

---

## 3️⃣ Run the Backend

### Development Mode (with auto-reload):

```bash
bun run dev
```

### Production Mode:

```bash
bun run build
bun start
```

### Test the Server:

Once running, visit:

- Health check: http://localhost:3000/health
- API info: http://localhost:3000/api

---

## 4️⃣ Test the Endpoints

### Test Authentication:

```bash
# This won't work yet - you need Firebase Auth first
# We'll test after setting up the frontend
```

### Quick Health Check:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "success": true,
  "message": "DueNow Backend is running!",
  "timestamp": "2026-01-09T...",
  "environment": "development"
}
```

---

## 5️⃣ Firestore Security Rules (Optional for Development)

For development, you can use these permissive rules (Firebase Console → Firestore → Rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // ⚠️ Development only!
    }
  }
}
```

**For Production**, use proper security rules that check authentication:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }

    match /assignments/{assignmentId} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.role == 'teacher';
    }

    // Add more specific rules for other collections
  }
}
```

---

## 6️⃣ Storage Security Rules (Optional for Development)

Firebase Console → Storage → Rules:

**Development:**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true; // ⚠️ Development only!
    }
  }
}
```

**Production:**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{userId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }

    match /assignments/{assignmentId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.role == 'teacher';
    }

    match /submissions/{assignmentId}/{userId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
  }
}
```

---

## 🔧 Troubleshooting

### Error: "Firebase configuration is missing"

- Make sure `.env` file exists and has correct credentials
- Check that environment variables are loaded (try `console.log(process.env.FIREBASE_PROJECT_ID)`)

### Error: "Could not reach Cloud Firestore backend"

- Check your internet connection
- Verify Firebase project exists
- Make sure Firestore is enabled in Firebase Console

### Error: "CORS error" from frontend

- Add your frontend URL to `CORS_ORIGINS` in `.env`
- Restart the backend server after changing `.env`

### Error: "Too many requests"

- Increase `RATE_LIMIT_MAX_REQUESTS` in `.env`
- Or wait for the rate limit window to reset

---

## 📝 Next Steps

1. ✅ Install dependencies
2. ✅ Configure Firebase
3. ✅ Update `.env` file
4. ✅ Run the backend
5. 🔄 Set up frontend to connect to backend
6. 🔄 Test authentication flow
7. 🔄 Test CRUD operations

The backend is now ready! Next, you'll need to update your frontend to use these API endpoints instead of the mock data in the Context providers.
