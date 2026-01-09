// Firebase Admin SDK Configuration
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Initialize Firebase Admin
const initializeFirebase = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Try to load from environment variables first
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace escaped newlines with actual newlines
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.projectId}.appspot.com`,
    });
  }

  // Fall back to service account JSON file
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './firebase-service-account.json';
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || serviceAccount.project_id + '.appspot.com',
    });
  }

  throw new Error(
    'Firebase credentials not found. Please either:\n' +
    '1. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables, or\n' +
    '2. Download your service account JSON from Firebase Console and save it as "firebase-service-account.json"'
  );
};

const app = initializeFirebase();

// Export initialized services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Collection names
export const Collections = {
  USERS: 'users',
  ASSIGNMENTS: 'assignments',
  SUBMISSIONS: 'submissions',
  FEEDBACK: 'feedback',
  GRADES: 'grades',
  GRADE_REVIEW_REQUESTS: 'gradeReviewRequests',
  ANNOUNCEMENTS: 'announcements',
} as const;

export default admin;
