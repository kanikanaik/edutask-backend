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

  // Check if service account file path is provided
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './firebase-service-account.json';
  
  // Try to load from service account JSON file
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || serviceAccount.project_id + '.appspot.com',
    });
  }

  throw new Error(
    'Firebase service account file not found. Please:\n' +
    '1. Download your service account JSON from Firebase Console\n' +
    '2. Save it as "firebase-service-account.json" in the project root, or\n' +
    '3. Set GOOGLE_APPLICATION_CREDENTIALS env variable to the file path'
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
