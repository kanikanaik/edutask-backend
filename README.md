# DueNow Assignment Manager - Backend

A comprehensive backend API for the DueNow Assignment Manager application, built with Express.js and Firebase (Authentication + Firestore).

## 🚀 Features

- **Role-Based Authentication** - Firebase Auth with custom claims for student/teacher roles
- **Assignment Management** - Full CRUD for assignments with priority calculation
- **Submission System** - Multi-attempt submissions with late submission handling
- **Grading System** - Numeric scores, letter grades, and rubric-based grading
- **Feedback System** - Teacher feedback on submissions
- **Grade Review Requests** - Students can request grade reviews
- **Announcements** - Global and assignment-specific announcements
- **File Uploads** - Firebase Storage for assignment attachments and submissions

## 📋 Prerequisites

- Node.js 18+
- Firebase Project with:
  - Authentication enabled
  - Firestore database
  - Storage bucket

## 🛠️ Installation

1. **Clone and navigate to backend directory:**

   ```bash
   cd due_now_backend
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Firebase credentials:

   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-client-email@your-project-id.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   PORT=3000
   NODE_ENV=development
   CORS_ORIGINS=http://localhost:3001,http://localhost:3000
   ```

4. **Start the server:**

   ```bash
   # Development (with hot reload)
   npm run dev

   # Production
   npm run build
   npm start
   ```

## 🔐 Authentication Flow

The backend expects Firebase ID tokens for authentication. The frontend should:

1. Create users via Firebase Auth client SDK
2. Call `POST /api/auth/register` to store user data in Firestore
3. Include `Authorization: Bearer <firebase-id-token>` header in all authenticated requests

## 📚 API Documentation

### Base URL

```
http://localhost:3000/api
```

### Authentication Headers

```
Authorization: Bearer <firebase-id-token>
```

---

### 🔑 Auth Endpoints

| Method | Endpoint             | Description                    | Auth Required |
| ------ | -------------------- | ------------------------------ | ------------- |
| POST   | `/auth/register`     | Register new user in Firestore | No            |
| GET    | `/auth/me`           | Get current user profile       | Yes           |
| PUT    | `/auth/me`           | Update current user profile    | Yes           |
| GET    | `/auth/users`        | Get all users (teachers only)  | Yes (Teacher) |
| GET    | `/auth/users/:id`    | Get user by ID                 | Yes           |
| POST   | `/auth/verify-token` | Verify Firebase ID token       | No            |

**Register User:**

```json
POST /api/auth/register
{
  "uid": "firebase-user-id",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "student" // or "teacher"
}
```

---

### 📝 Assignment Endpoints

| Method | Endpoint                   | Description              | Auth Required |
| ------ | -------------------------- | ------------------------ | ------------- |
| GET    | `/assignments`             | Get all assignments      | Yes           |
| GET    | `/assignments/stats`       | Get dashboard statistics | Yes           |
| GET    | `/assignments/:id`         | Get assignment by ID     | Yes           |
| POST   | `/assignments`             | Create new assignment    | Yes (Teacher) |
| PUT    | `/assignments/:id`         | Update assignment        | Yes (Teacher) |
| DELETE | `/assignments/:id`         | Delete assignment        | Yes (Teacher) |
| POST   | `/assignments/:id/publish` | Publish draft assignment | Yes (Teacher) |
| POST   | `/assignments/:id/close`   | Close assignment         | Yes (Teacher) |

**Create Assignment:**

```json
POST /api/assignments
{
  "title": "React Hooks Essay",
  "description": "Write about useState and useEffect",
  "dueDate": "2026-01-15",
  "difficulty": "medium", // easy, medium, hard
  "allowLateSubmission": true,
  "maxAttempts": 3,
  "status": "published", // draft, published
  "rubric": [
    { "name": "Content", "weight": 40 },
    { "name": "Code Quality", "weight": 30 },
    { "name": "Documentation", "weight": 30 }
  ]
}
```

---

### 📤 Submission Endpoints

| Method | Endpoint                      | Description                | Auth Required |
| ------ | ----------------------------- | -------------------------- | ------------- |
| GET    | `/submissions`                | Get submissions            | Yes           |
| GET    | `/submissions/:id`            | Get submission by ID       | Yes           |
| POST   | `/submissions`                | Create/update submission   | Yes (Student) |
| GET    | `/submissions/assignment/:id` | Get assignment submissions | Yes (Teacher) |
| GET    | `/submissions/student/:id`    | Get student submissions    | Yes (Teacher) |

**Create Submission:**

```json
POST /api/submissions
{
  "assignmentId": "assignment-id",
  "textContent": "My submission content...",
  "fileUrl": "https://storage.url/file.pdf", // optional
  "integrityConfirmed": true
}
```

---

### 📊 Grading Endpoints

| Method | Endpoint                               | Description           | Auth Required |
| ------ | -------------------------------------- | --------------------- | ------------- |
| GET    | `/grading/grades`                      | Get grades            | Yes           |
| GET    | `/grading/grades/:id`                  | Get grade by ID       | Yes           |
| POST   | `/grading/grades`                      | Create grade          | Yes (Teacher) |
| PUT    | `/grading/grades/:id`                  | Update grade          | Yes (Teacher) |
| POST   | `/grading/grades/:id/publish`          | Publish grade         | Yes (Teacher) |
| GET    | `/grading/feedback/:submissionId`      | Get feedback          | Yes           |
| POST   | `/grading/feedback`                    | Create feedback       | Yes (Teacher) |
| PUT    | `/grading/feedback/:id`                | Update feedback       | Yes (Teacher) |
| GET    | `/grading/review-requests`             | Get review requests   | Yes           |
| POST   | `/grading/review-requests`             | Create review request | Yes (Student) |
| PUT    | `/grading/review-requests/:id/respond` | Respond to request    | Yes (Teacher) |

**Create Grade:**

```json
POST /api/grading/grades
{
  "submissionId": "submission-id",
  "numericScore": 85,
  "letterGrade": "B",
  "comments": "Good work!",
  "status": "draft", // draft, finalized
  "rubricScores": [
    { "id": "rubric-1", "name": "Content", "weight": 40, "score": 90 },
    { "id": "rubric-2", "name": "Code Quality", "weight": 30, "score": 80 }
  ]
}
```

**Create Feedback:**

```json
POST /api/grading/feedback
{
  "submissionId": "submission-id",
  "content": "Great work! Consider adding more examples.",
  "status": "reviewed" // reviewed, needs-improvement, pending
}
```

**Create Review Request:**

```json
POST /api/grading/review-requests
{
  "gradeId": "grade-id",
  "message": "I believe question 3 was graded incorrectly..."
}
```

---

### 📢 Announcement Endpoints

| Method | Endpoint                        | Description                  | Auth Required |
| ------ | ------------------------------- | ---------------------------- | ------------- |
| GET    | `/announcements`                | Get announcements            | Yes           |
| GET    | `/announcements/:id`            | Get announcement by ID       | Yes           |
| GET    | `/announcements/assignment/:id` | Get assignment announcements | Yes           |
| POST   | `/announcements`                | Create announcement          | Yes (Teacher) |
| PUT    | `/announcements/:id`            | Update announcement          | Yes (Teacher) |
| DELETE | `/announcements/:id`            | Delete announcement          | Yes (Teacher) |
| POST   | `/announcements/:id/dismiss`    | Dismiss announcement         | Yes           |

**Create Announcement:**

```json
POST /api/announcements
{
  "title": "Office Hours Extended",
  "content": "Office hours will be extended this week...",
  "type": "global", // global, assignment
  "assignmentId": "assignment-id" // required if type is "assignment"
}
```

---

### 📁 File Upload Endpoints

| Method | Endpoint                              | Description                  | Auth Required |
| ------ | ------------------------------------- | ---------------------------- | ------------- |
| POST   | `/files/upload`                       | General file upload          | Yes           |
| POST   | `/files/upload/assignment-attachment` | Upload assignment attachment | Yes (Teacher) |
| POST   | `/files/upload/submission`            | Upload submission file       | Yes (Student) |
| DELETE | `/files/:filename`                    | Delete file                  | Yes           |
| GET    | `/files/signed-url/:filename`         | Get signed URL               | Yes           |

**Upload File:**

```
POST /api/files/upload
Content-Type: multipart/form-data

file: <file>
folder: "uploads" (optional)
```

**Upload Submission:**

```
POST /api/files/upload/submission
Content-Type: multipart/form-data

file: <file>
assignmentId: "assignment-id"
```

---

## 🗄️ Firestore Collections

```
users/
  {userId}/
    - id, name, email, role, avatar, createdAt

assignments/
  {assignmentId}/
    - id, title, description, dueDate, teacherId, status, priority, difficulty, ...

submissions/
  {submissionId}/
    - id, assignmentId, studentId, textContent, fileUrl, status, attemptHistory, ...

grades/
  {gradeId}/
    - id, submissionId, teacherId, numericScore, letterGrade, rubricScores, status, ...

feedback/
  {feedbackId}/
    - id, submissionId, teacherId, content, status, ...

gradeReviewRequests/
  {requestId}/
    - id, gradeId, studentId, message, status, ...

announcements/
  {announcementId}/
    - id, title, content, type, assignmentId, createdBy, ...
```

## 🔒 Security Rules

Make sure to configure Firestore security rules appropriately. The backend handles authorization through middleware, but additional Firestore rules provide defense in depth.

## 🧪 Testing

```bash
# Run tests (if configured)
npm test

# Test API endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api
```

## 📝 Response Format

All API responses follow this format:

**Success:**

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

**Error:**

```json
{
  "success": false,
  "error": "Error message",
  "errors": [{ "field": "email", "message": "Invalid email" }]
}
```

**Paginated:**

```json
{
  "success": true,
  "data": {
    "data": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

## 🤝 Frontend Integration

Update your frontend `AuthContext.tsx` to integrate with these endpoints. Example:

```typescript
const login = async (email: string, password: string, role: UserRole) => {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );
  const token = await userCredential.user.getIdToken();

  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const { data: user } = await response.json();
  setUser(user);
};
```

## 📄 License

MIT
