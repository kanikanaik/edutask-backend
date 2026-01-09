// Assignment Routes
import { Router, Response } from 'express';
import { db, Collections } from '../config/firebase.js';
import { authenticate, requireTeacher, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  Assignment, 
  CreateAssignmentDTO, 
  UpdateAssignmentDTO, 
  ApiResponse,
  TeacherStats,
  StudentStats 
} from '../types/index.js';
import { 
  calculatePriorityFromDeadline, 
  formatDate, 
  sanitizeString, 
  generateId,
  getPaginationParams,
  buildPaginatedResponse,
  isOverdue
} from '../utils/helpers.js';

const router = Router();

/**
 * GET /api/assignments
 * Get all assignments (filtered by role)
 */
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const { page, limit } = getPaginationParams(req.query);
    const status = req.query.status as string;
    const teacherId = req.query.teacherId as string;

    let query: FirebaseFirestore.Query = db.collection(Collections.ASSIGNMENTS);

    // Teachers see their own assignments, students see published/closed from enrolled teachers
    if (user!.role === 'student') {
      // Get student's enrolled teachers
      const userDoc = await db.collection(Collections.USERS).doc(user!.uid).get();
      const userData = userDoc.data();
      const enrolledTeachers = userData?.enrolledTeachers || [];
      
      if (enrolledTeachers.length === 0) {
        // No enrolled teachers - show all published assignments
        query = query.where('status', 'in', ['published', 'closed']);
      } else {
        // Show published assignments only from enrolled teachers
        // Note: 'in' query limited to 10 items
        const teacherChunks = [];
        for (let i = 0; i < enrolledTeachers.length; i += 10) {
          teacherChunks.push(enrolledTeachers.slice(i, i + 10));
        }
        
        let allAssignments: Assignment[] = [];
        for (const chunk of teacherChunks) {
          const chunkQuery = db.collection(Collections.ASSIGNMENTS)
            .where('teacherId', 'in', chunk)
            .where('status', 'in', ['published', 'closed']);
          const snapshot = await chunkQuery.get();
          allAssignments.push(...snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Assignment));
        }
        
        console.log(`[Assignments] Student ${user!.uid}, Enrolled: ${enrolledTeachers.length} teachers, Found: ${allAssignments.length} assignments`);
        
        // Sort and return early
        allAssignments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        const total = allAssignments.length;
        const paginatedAssignments = allAssignments.slice((page - 1) * limit, page * limit);
        
        res.json({
          success: true,
          data: buildPaginatedResponse(paginatedAssignments, total, page, limit),
        } as ApiResponse);
        return;
      }
    } else {
      // Teachers see only their own assignments
      const targetTeacherId = teacherId || user!.uid;
      query = query.where('teacherId', '==', targetTeacherId);
      
      // Filter by status if provided
      if (status) {
        query = query.where('status', '==', status);
      }
    }

    // Don't use orderBy with where - sort in code to avoid composite index
    const snapshot = await query.get();
    let assignments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Assignment);
    
    console.log(`[Assignments] User: ${user!.role} (${user!.uid}), Found: ${assignments.length} assignments`);
    
    // Sort by due date ascending
    assignments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // Apply pagination
    const total = assignments.length;
    const paginatedAssignments = assignments.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: buildPaginatedResponse(paginatedAssignments, total, page, limit),
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get assignments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assignments',
    } as ApiResponse);
  }
});

/**
 * GET /api/assignments/stats
 * Get assignment statistics for dashboard
 */
router.get('/stats', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;

    if (user!.role === 'teacher') {
      // Teacher stats
      const assignmentsSnap = await db.collection(Collections.ASSIGNMENTS)
        .where('teacherId', '==', user!.uid)
        .get();
      
      const assignments = assignmentsSnap.docs.map(doc => doc.data() as Assignment);
      
      const submissionsSnap = await db.collection(Collections.SUBMISSIONS).get();
      const submissions = submissionsSnap.docs
        .filter(doc => assignments.some(a => a.id === doc.data().assignmentId))
        .map(doc => doc.data());

      const gradesSnap = await db.collection(Collections.GRADES).get();
      const grades = gradesSnap.docs.map(doc => doc.data());

      const stats: TeacherStats = {
        totalAssignments: assignments.length,
        publishedAssignments: assignments.filter(a => a.status === 'published').length,
        draftAssignments: assignments.filter(a => a.status === 'draft').length,
        totalSubmissions: submissions.length,
        pendingGrades: submissions.filter(s => 
          !grades.some(g => g.submissionId === s.id && g.status !== 'not-graded')
        ).length,
        gradedSubmissions: submissions.filter(s => 
          grades.some(g => g.submissionId === s.id && g.status === 'finalized')
        ).length,
      };

      res.json({ success: true, data: stats } as ApiResponse<TeacherStats>);
    } else {
      // Student stats
      const assignmentsSnap = await db.collection(Collections.ASSIGNMENTS)
        .where('status', 'in', ['published', 'closed'])
        .get();
      
      const assignments = assignmentsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Assignment);
      
      const submissionsSnap = await db.collection(Collections.SUBMISSIONS)
        .where('studentId', '==', user!.uid)
        .get();
      
      const submissions = submissionsSnap.docs.map(doc => doc.data());
      const submittedIds = submissions.map(s => s.assignmentId);

      const gradesSnap = await db.collection(Collections.GRADES)
        .where('submissionId', 'in', submissions.map(s => s.id).slice(0, 10) || ['none'])
        .get();
      
      const grades = gradesSnap.docs.map(doc => doc.data());
      const numericGrades = grades.filter(g => g.numericScore !== undefined).map(g => g.numericScore);
      const averageGrade = numericGrades.length > 0 
        ? Math.round(numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length)
        : undefined;

      const stats: StudentStats = {
        totalAssignments: assignments.length,
        submittedCount: submissions.length,
        pendingCount: assignments.filter(a => 
          !submittedIds.includes(a.id) && !isOverdue(a.dueDate)
        ).length,
        overdueCount: assignments.filter(a => 
          !submittedIds.includes(a.id) && isOverdue(a.dueDate)
        ).length,
        averageGrade,
      };

      res.json({ success: true, data: stats } as ApiResponse<StudentStats>);
    }
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
    } as ApiResponse);
  }
});

/**
 * GET /api/assignments/:id
 * Get a specific assignment
 */
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(id).get();

    if (!assignmentDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Assignment not found',
      } as ApiResponse);
      return;
    }

    const assignment = { ...assignmentDoc.data(), id: assignmentDoc.id } as Assignment;

    // Students can only see published/closed assignments
    if (user!.role === 'student' && !['published', 'closed'].includes(assignment.status)) {
      res.status(403).json({
        success: false,
        error: 'Access denied',
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: assignment,
    } as ApiResponse<Assignment>);
  } catch (error: any) {
    console.error('Get assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch assignment',
    } as ApiResponse);
  }
});

/**
 * POST /api/assignments
 * Create a new assignment (teachers only)
 */
router.post('/', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const data: CreateAssignmentDTO = req.body;

    // Validate required fields
    if (!data.title || !data.description || !data.dueDate || !data.difficulty) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: title, description, dueDate, difficulty',
      } as ApiResponse);
      return;
    }

    const now = formatDate();
    const id = generateId();
    const priority = calculatePriorityFromDeadline(data.dueDate);

    // Process rubric if provided
    const rubric = data.rubric?.map((criterion, index) => ({
      ...criterion,
      id: `rubric-${id}-${index}`,
    }));

    const newAssignment: Assignment = {
      id,
      title: sanitizeString(data.title),
      description: sanitizeString(data.description),
      dueDate: data.dueDate,
      createdAt: now,
      teacherId: user!.uid,
      teacherName: user!.name,
      status: data.status || 'published',
      priority,
      difficulty: data.difficulty,
      allowLateSubmission: data.allowLateSubmission ?? true,
      maxAttempts: data.maxAttempts ?? 3,
      // Only include optional fields if they have values
      ...(rubric && { rubric }),
      ...(data.attachmentUrl && { attachmentUrl: data.attachmentUrl }),
    };

    await db.collection(Collections.ASSIGNMENTS).doc(id).set(newAssignment);

    res.status(201).json({
      success: true,
      data: newAssignment,
      message: 'Assignment created successfully',
    } as ApiResponse<Assignment>);
  } catch (error: any) {
    console.error('Create assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create assignment',
    } as ApiResponse);
  }
});

/**
 * PUT /api/assignments/:id
 * Update an assignment (teachers only, own assignments)
 */
router.put('/:id', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const updates: UpdateAssignmentDTO = req.body;

    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(id).get();

    if (!assignmentDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Assignment not found',
      } as ApiResponse);
      return;
    }

    const assignment = assignmentDoc.data() as Assignment;

    // Check ownership
    if (assignment.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only edit your own assignments',
      } as ApiResponse);
      return;
    }

    // Prepare updates
    const updateData: Partial<Assignment> = {
      updatedAt: formatDate(),
    };

    if (updates.title) updateData.title = sanitizeString(updates.title);
    if (updates.description) updateData.description = sanitizeString(updates.description);
    if (updates.dueDate) {
      updateData.dueDate = updates.dueDate;
      updateData.priority = calculatePriorityFromDeadline(updates.dueDate);
    }
    if (updates.status) updateData.status = updates.status;
    if (updates.difficulty) updateData.difficulty = updates.difficulty;
    if (updates.allowLateSubmission !== undefined) updateData.allowLateSubmission = updates.allowLateSubmission;
    if (updates.maxAttempts !== undefined) updateData.maxAttempts = updates.maxAttempts;
    if (updates.rubric) updateData.rubric = updates.rubric;
    if (updates.attachmentUrl !== undefined) updateData.attachmentUrl = updates.attachmentUrl;

    await db.collection(Collections.ASSIGNMENTS).doc(id).update(updateData);

    const updatedDoc = await db.collection(Collections.ASSIGNMENTS).doc(id).get();

    res.json({
      success: true,
      data: { ...updatedDoc.data(), id } as Assignment,
      message: 'Assignment updated successfully',
    } as ApiResponse<Assignment>);
  } catch (error: any) {
    console.error('Update assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update assignment',
    } as ApiResponse);
  }
});

/**
 * DELETE /api/assignments/:id
 * Delete an assignment (teachers only, own assignments)
 */
router.delete('/:id', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(id).get();

    if (!assignmentDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Assignment not found',
      } as ApiResponse);
      return;
    }

    const assignment = assignmentDoc.data() as Assignment;

    // Check ownership
    if (assignment.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only delete your own assignments',
      } as ApiResponse);
      return;
    }

    // Delete the assignment
    await db.collection(Collections.ASSIGNMENTS).doc(id).delete();

    // Optionally: Delete related submissions, grades, etc.
    const submissionsSnap = await db.collection(Collections.SUBMISSIONS)
      .where('assignmentId', '==', id)
      .get();
    
    const batch = db.batch();
    submissionsSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    res.json({
      success: true,
      message: 'Assignment deleted successfully',
    } as ApiResponse);
  } catch (error: any) {
    console.error('Delete assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete assignment',
    } as ApiResponse);
  }
});

/**
 * POST /api/assignments/:id/close
 * Close an assignment (teachers only)
 */
router.post('/:id/close', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(id).get();

    if (!assignmentDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Assignment not found',
      } as ApiResponse);
      return;
    }

    const assignment = assignmentDoc.data() as Assignment;

    if (assignment.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only close your own assignments',
      } as ApiResponse);
      return;
    }

    await db.collection(Collections.ASSIGNMENTS).doc(id).update({
      status: 'closed',
      updatedAt: formatDate(),
    });

    res.json({
      success: true,
      message: 'Assignment closed successfully',
    } as ApiResponse);
  } catch (error: any) {
    console.error('Close assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to close assignment',
    } as ApiResponse);
  }
});

/**
 * POST /api/assignments/:id/publish
 * Publish a draft assignment (teachers only)
 */
router.post('/:id/publish', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(id).get();

    if (!assignmentDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Assignment not found',
      } as ApiResponse);
      return;
    }

    const assignment = assignmentDoc.data() as Assignment;

    if (assignment.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only publish your own assignments',
      } as ApiResponse);
      return;
    }

    await db.collection(Collections.ASSIGNMENTS).doc(id).update({
      status: 'published',
      updatedAt: formatDate(),
    });

    res.json({
      success: true,
      message: 'Assignment published successfully',
    } as ApiResponse);
  } catch (error: any) {
    console.error('Publish assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to publish assignment',
    } as ApiResponse);
  }
});

export default router;
