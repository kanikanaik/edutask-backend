# 🚀 Backend Installation & Testing Checklist

## ✅ Installation Steps

### 1. Install Packages

Run in your terminal (make sure you're in the `due_now_backend` directory):

```bash
bun install
```

**Expected packages to be installed:**

- express (web framework)
- firebase-admin (Firebase backend SDK)
- cors (CORS middleware)
- dotenv (environment variables)
- multer (file uploads)
- helmet (security headers)
- express-rate-limit (rate limiting)
- express-validator (validation)
- TypeScript and types
- tsx (TypeScript execution)

---

## 🔧 Environment Configuration Required

### Firebase Credentials (REQUIRED)

You **MUST** configure Firebase before the backend will work. Choose one option:

**Option A: Service Account JSON (Recommended)**

1. Download service account JSON from Firebase Console
2. Save it as `firebase-service-account.json` in the backend root
3. In `.env`, set:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
   FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   ```

**Option B: Individual Environment Variables**

1. In `.env`, set:
   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   ```

### Other Environment Variables (Optional, have defaults)

```env
PORT=3000                                    # Server port (default: 3000)
NODE_ENV=development                         # Environment (default: development)
CORS_ORIGINS=http://localhost:3001          # Frontend URL
RATE_LIMIT_WINDOW_MS=900000                  # 15 minutes (default)
RATE_LIMIT_MAX_REQUESTS=100                  # Max requests per window (default)
```

---

## 🧪 Testing Steps

### Step 1: Test Firebase Configuration

```bash
bun run test:config
```

**Expected output:**

```
🧪 Testing Firebase Configuration...

✅ Firebase Admin initialized successfully
   Project ID: your-project-id
   Storage Bucket: your-project-id.appspot.com

✅ Backend configuration looks good!
```

**If you see errors:**

- Make sure `.env` file exists
- Check Firebase credentials are correct
- Verify the private key has `\n` for newlines

---

### Step 2: Start the Server

```bash
bun run dev
```

**Expected output:**

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 DueNow Assignment Manager Backend                   ║
║                                                          ║
║   Server running on: http://localhost:3000              ║
║   Environment: development                               ║
║                                                          ║
║   API Endpoints:                                         ║
║   • Auth:          /api/auth                             ║
║   • Assignments:   /api/assignments                      ║
║   • Submissions:   /api/submissions                      ║
║   • Grading:       /api/grading                          ║
║   • Announcements: /api/announcements                    ║
║   • Files:         /api/files                            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

**If server doesn't start:**

- Check if port 3000 is already in use
- Verify all dependencies installed correctly
- Check for syntax errors in the logs

---

### Step 3: Test Health Endpoint

**In a new terminal:**

```bash
curl http://localhost:3000/health
```

**Or open in browser:**

```
http://localhost:3000/health
```

**Expected response:**

```json
{
  "success": true,
  "message": "DueNow Backend is running!",
  "timestamp": "2026-01-09T...",
  "environment": "development"
}
```

---

### Step 4: Test API Info Endpoint

```bash
curl http://localhost:3000/api
```

**Expected response:**

```json
{
  "success": true,
  "message": "DueNow Assignment Manager API",
  "version": "1.0.0",
  "endpoints": {
    "auth": "/api/auth",
    "assignments": "/api/assignments",
    "submissions": "/api/submissions",
    "grading": "/api/grading",
    "announcements": "/api/announcements",
    "files": "/api/files"
  }
}
```

---

## 🔍 Code Quality Checks

All backend code has been created with:

- ✅ **TypeScript** for type safety
- ✅ **Role-based authentication** (student/teacher)
- ✅ **Firebase Admin SDK** integration
- ✅ **Firestore** for database
- ✅ **Firebase Storage** for file uploads
- ✅ **Express middleware** for security (helmet, cors, rate limiting)
- ✅ **Error handling** with proper HTTP status codes
- ✅ **Input validation** and sanitization
- ✅ **Pagination** support for list endpoints
- ✅ **Comprehensive API** covering all frontend features

---

## 📋 Endpoint Summary

### Authentication

- ✅ POST `/api/auth/register` - Register user
- ✅ GET `/api/auth/me` - Get current user
- ✅ PUT `/api/auth/me` - Update profile
- ✅ GET `/api/auth/users` - List users (teacher)

### Assignments

- ✅ GET `/api/assignments` - List assignments
- ✅ GET `/api/assignments/stats` - Dashboard stats
- ✅ POST `/api/assignments` - Create (teacher)
- ✅ PUT `/api/assignments/:id` - Update (teacher)
- ✅ DELETE `/api/assignments/:id` - Delete (teacher)
- ✅ POST `/api/assignments/:id/publish` - Publish (teacher)

### Submissions

- ✅ GET `/api/submissions` - List submissions
- ✅ POST `/api/submissions` - Submit assignment (student)
- ✅ GET `/api/submissions/assignment/:id` - Get by assignment (teacher)

### Grading

- ✅ POST `/api/grading/grades` - Create grade (teacher)
- ✅ PUT `/api/grading/grades/:id` - Update grade (teacher)
- ✅ POST `/api/grading/grades/:id/publish` - Publish grade (teacher)
- ✅ POST `/api/grading/feedback` - Add feedback (teacher)
- ✅ POST `/api/grading/review-requests` - Request review (student)
- ✅ PUT `/api/grading/review-requests/:id/respond` - Respond (teacher)

### Announcements

- ✅ GET `/api/announcements` - List announcements
- ✅ POST `/api/announcements` - Create (teacher)
- ✅ PUT `/api/announcements/:id` - Update (teacher)
- ✅ DELETE `/api/announcements/:id` - Delete (teacher)

### File Uploads

- ✅ POST `/api/files/upload` - General upload
- ✅ POST `/api/files/upload/assignment-attachment` - Assignment files (teacher)
- ✅ POST `/api/files/upload/submission` - Submission files (student)
- ✅ DELETE `/api/files/:filename` - Delete file

---

## ⚠️ Common Issues & Solutions

### Issue: "Firebase configuration is missing"

**Solution:**

- Create `.env` file from `.env.example`
- Add Firebase credentials
- Run `bun run test:config` to verify

### Issue: "Cannot find module"

**Solution:**

- Run `bun install` again
- Check `node_modules` folder exists
- Delete `node_modules` and reinstall if needed

### Issue: "Port 3000 already in use"

**Solution:**

- Change PORT in `.env` to another port (e.g., 3001, 8080)
- Or kill the process using port 3000

### Issue: "CORS error from frontend"

**Solution:**

- Add your frontend URL to `CORS_ORIGINS` in `.env`
- Restart the backend server
- Example: `CORS_ORIGINS=http://localhost:3001,http://localhost:3000`

### Issue: "Authentication failed" when testing endpoints

**Solution:**

- You need to set up Firebase Auth on the frontend first
- Get a Firebase ID token from the frontend
- Include it in requests: `Authorization: Bearer <token>`

---

## 🎯 Next Steps After Backend is Running

1. **Test each endpoint** with a tool like:

   - Postman
   - Thunder Client (VS Code extension)
   - curl commands

2. **Set up Firebase Auth on frontend** to get ID tokens

3. **Update frontend Context providers** to call these endpoints instead of using mock data

4. **Test the full flow:**
   - Register/Login
   - Create assignment (teacher)
   - Submit assignment (student)
   - Grade submission (teacher)
   - View grades (student)

---

## 📝 Summary

**What you need to do:**

1. ✅ Run `bun install`
2. ✅ Configure Firebase credentials in `.env`
3. ✅ Run `bun run test:config`
4. ✅ Run `bun run dev`
5. ✅ Test `http://localhost:3000/health`
6. ✅ Integrate with frontend

**What's already done:**

- ✅ All backend code created
- ✅ All routes implemented
- ✅ Firebase integration
- ✅ Authentication & authorization
- ✅ File uploads
- ✅ Error handling
- ✅ Security middleware
- ✅ Documentation

The backend is **100% complete** and ready to use once you configure Firebase!
