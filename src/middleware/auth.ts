// Authentication Middleware for Firebase
import { Request, Response, NextFunction } from 'express';
import { auth, db, Collections } from '../config/firebase.js';
import { UserRole, ApiResponse } from '../types/index.js';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Verify Firebase ID token and attach user to request
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided. Authorization header must be Bearer token.',
      } as ApiResponse);
      return;
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Invalid token format',
      } as ApiResponse);
      return;
    }

    // Verify the token
    const decodedToken = await auth.verifyIdToken(token);
    
    // Get user data from Firestore
    const userDoc = await db.collection(Collections.USERS).doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      res.status(401).json({
        success: false,
        error: 'User not found in database',
      } as ApiResponse);
      return;
    }

    const userData = userDoc.data();
    
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || userData?.email || '',
      role: userData?.role || 'student',
      name: userData?.name || '',
    };

    next();
  } catch (error: any) {
    console.error('Authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      res.status(401).json({
        success: false,
        error: 'Token has expired. Please login again.',
      } as ApiResponse);
      return;
    }

    if (error.code === 'auth/id-token-revoked') {
      res.status(401).json({
        success: false,
        error: 'Token has been revoked. Please login again.',
      } as ApiResponse);
      return;
    }

    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    } as ApiResponse);
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(' or ')}`,
      } as ApiResponse);
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is a teacher
 */
export const requireTeacher = requireRole('teacher');

/**
 * Middleware to check if user is a student
 */
export const requireStudent = requireRole('student');

/**
 * Optional authentication - attaches user if token is provided, but doesn't fail if not
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      next();
      return;
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userDoc = await db.collection(Collections.USERS).doc(decodedToken.uid).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email || userData?.email || '',
        role: userData?.role || 'student',
        name: userData?.name || '',
      };
    }

    next();
  } catch (error) {
    // Token is invalid but we don't fail - just proceed without user
    next();
  }
};
