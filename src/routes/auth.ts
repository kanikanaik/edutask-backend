// Authentication Routes
import { Router, Response } from 'express';
import { auth, db, Collections } from '../config/firebase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { User, CreateUserDTO, UpdateUserDTO, ApiResponse, UserRole } from '../types/index.js';
import { formatDate, sanitizeString } from '../utils/helpers.js';

const router = Router();

/**
 * POST /api/auth/register
 * Create a new user in Firestore after Firebase Auth registration
 * Note: The actual Firebase Auth user should be created on the client side
 */
router.post('/register', async (req, res: Response) => {
  try {
    const { uid, name, email, role }: { uid: string } & CreateUserDTO = req.body;

    // Validate required fields
    if (!uid || !name || !email || !role) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: uid, name, email, role',
      } as ApiResponse);
      return;
    }

    // Validate role
    if (!['student', 'teacher'].includes(role)) {
      res.status(400).json({
        success: false,
        error: 'Invalid role. Must be "student" or "teacher"',
      } as ApiResponse);
      return;
    }

    // Check if user already exists
    const existingUser = await db.collection(Collections.USERS).doc(uid).get();
    if (existingUser.exists) {
      res.status(409).json({
        success: false,
        error: 'User already exists',
      } as ApiResponse);
      return;
    }

    // Create user document in Firestore
    const now = formatDate();
    const newUser: User = {
      id: uid,
      name: sanitizeString(name),
      email: email.toLowerCase().trim(),
      role: role as UserRole,
      createdAt: now,
      // Initialize enrolledTeachers as empty array for students
      ...(role === 'student' && { enrolledTeachers: [] }),
    };

    await db.collection(Collections.USERS).doc(uid).set(newUser);

    // Set custom claims for role-based access
    await auth.setCustomUserClaims(uid, { role });

    res.status(201).json({
      success: true,
      data: newUser,
      message: 'User registered successfully',
    } as ApiResponse<User>);
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register user',
    } as ApiResponse);
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userDoc = await db.collection(Collections.USERS).doc(req.user!.uid).get();
    
    if (!userDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: userDoc.data() as User,
    } as ApiResponse<User>);
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile',
    } as ApiResponse);
  }
});

/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates: UpdateUserDTO = req.body;
    const allowedUpdates = ['name', 'avatar'];
    
    // Filter to only allowed updates
    const filteredUpdates: Record<string, any> = {};
    for (const key of Object.keys(updates)) {
      if (allowedUpdates.includes(key) && updates[key as keyof UpdateUserDTO]) {
        filteredUpdates[key] = key === 'name' 
          ? sanitizeString(updates[key as keyof UpdateUserDTO] as string)
          : updates[key as keyof UpdateUserDTO];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid updates provided',
      } as ApiResponse);
      return;
    }

    filteredUpdates.updatedAt = formatDate();

    await db.collection(Collections.USERS).doc(req.user!.uid).update(filteredUpdates);

    // Get updated user
    const updatedUser = await db.collection(Collections.USERS).doc(req.user!.uid).get();

    res.json({
      success: true,
      data: updatedUser.data() as User,
      message: 'Profile updated successfully',
    } as ApiResponse<User>);
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    } as ApiResponse);
  }
});

/**
 * GET /api/auth/users
 * Get all users (admin/teacher only)
 */
router.get('/users', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only teachers can view all users
    if (req.user!.role !== 'teacher') {
      res.status(403).json({
        success: false,
        error: 'Access denied',
      } as ApiResponse);
      return;
    }

    const roleFilter = req.query.role as string;
    let query: FirebaseFirestore.Query = db.collection(Collections.USERS);
    
    if (roleFilter && ['student', 'teacher'].includes(roleFilter)) {
      query = query.where('role', '==', roleFilter);
    }

    const snapshot = await query.get();
    const users = snapshot.docs.map(doc => doc.data() as User);

    res.json({
      success: true,
      data: users,
    } as ApiResponse<User[]>);
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users',
    } as ApiResponse);
  }
});

/**
 * GET /api/auth/users/:id
 * Get a specific user by ID
 */
router.get('/users/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const userDoc = await db.collection(Collections.USERS).doc(id).get();
    
    if (!userDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: userDoc.data() as User,
    } as ApiResponse<User>);
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user',
    } as ApiResponse);
  }
});

/**
 * POST /api/auth/verify-token
 * Verify a Firebase ID token (useful for frontend validation)
 */
router.post('/verify-token', async (req, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        error: 'Token is required',
      } as ApiResponse);
      return;
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userDoc = await db.collection(Collections.USERS).doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        user: userDoc.data() as User,
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    } as ApiResponse);
  }
});

/**
 * GET /api/auth/teachers
 * Get list of all teachers (for student enrollment)
 */
router.get('/teachers', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await db.collection(Collections.USERS)
      .where('role', '==', 'teacher')
      .get();
    
    const teachers = snapshot.docs.map(doc => doc.data() as User);
    
    res.json({
      success: true,
      data: teachers,
    } as ApiResponse<User[]>);
  } catch (error: any) {
    console.error('Get teachers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get teachers',
    } as ApiResponse);
  }
});

/**
 * POST /api/auth/enroll
 * Enroll in a teacher's class (students only)
 */
router.post('/enroll', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const { teacherId } = req.body;

    if (user!.role !== 'student') {
      res.status(403).json({
        success: false,
        error: 'Only students can enroll in teachers',
      } as ApiResponse);
      return;
    }

    if (!teacherId) {
      res.status(400).json({
        success: false,
        error: 'Teacher ID is required',
      } as ApiResponse);
      return;
    }

    // Verify teacher exists
    const teacherDoc = await db.collection(Collections.USERS).doc(teacherId).get();
    if (!teacherDoc.exists || teacherDoc.data()?.role !== 'teacher') {
      res.status(404).json({
        success: false,
        error: 'Teacher not found',
      } as ApiResponse);
      return;
    }

    // Get current enrolled teachers
    const studentDoc = await db.collection(Collections.USERS).doc(user!.uid).get();
    const currentEnrolled = studentDoc.data()?.enrolledTeachers || [];

    if (currentEnrolled.includes(teacherId)) {
      res.status(409).json({
        success: false,
        error: 'Already enrolled with this teacher',
      } as ApiResponse);
      return;
    }

    // Add teacher to enrolled list
    await db.collection(Collections.USERS).doc(user!.uid).update({
      enrolledTeachers: [...currentEnrolled, teacherId],
    });

    res.json({
      success: true,
      message: 'Successfully enrolled',
    } as ApiResponse);
  } catch (error: any) {
    console.error('Enroll error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enroll',
    } as ApiResponse);
  }
});

/**
 * DELETE /api/auth/enroll/:teacherId
 * Unenroll from a teacher's class (students only)
 */
router.delete('/enroll/:teacherId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const { teacherId } = req.params;

    if (user!.role !== 'student') {
      res.status(403).json({
        success: false,
        error: 'Only students can unenroll',
      } as ApiResponse);
      return;
    }

    const studentDoc = await db.collection(Collections.USERS).doc(user!.uid).get();
    const currentEnrolled = studentDoc.data()?.enrolledTeachers || [];

    await db.collection(Collections.USERS).doc(user!.uid).update({
      enrolledTeachers: currentEnrolled.filter((id: string) => id !== teacherId),
    });

    res.json({
      success: true,
      message: 'Successfully unenrolled',
    } as ApiResponse);
  } catch (error: any) {
    console.error('Unenroll error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unenroll',
    } as ApiResponse);
  }
});

export default router;
