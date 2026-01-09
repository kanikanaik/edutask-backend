// Submission Routes
import { Router, Response } from 'express';
import { db, Collections } from '../config/firebase.js';
import { authenticate, requireStudent, requireTeacher, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  Submission, 
  CreateSubmissionDTO, 
  SubmissionAttempt,
  Assignment,
  ApiResponse 
} from '../types/index.js';
import { 
  formatDate, 
  generateId,
  getPaginationParams,
  buildPaginatedResponse,
  isOverdue
} from '../utils/helpers.js';

const router = Router();

/**
 * GET /api/submissions
 * Get submissions (students see their own, teachers see all for their assignments)
 */
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const { page, limit } = getPaginationParams(req.query);
    const assignmentId = req.query.assignmentId as string;
    const studentId = req.query.studentId as string;
    const status = req.query.status as string;

    let submissions: Submission[] = [];

    if (user!.role === 'student') {
      // Students can only see their own submissions
      let query: FirebaseFirestore.Query = db.collection(Collections.SUBMISSIONS)
        .where('studentId', '==', user!.uid);
      
      if (assignmentId) {
        query = query.where('assignmentId', '==', assignmentId);
      }

      // Don't use orderBy with where - sort in code to avoid composite index
      const snapshot = await query.get();
      submissions = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Submission);
      // Sort by submittedAt descending
      submissions.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    } else {
      // Teachers see submissions for their assignments
      const assignmentsSnap = await db.collection(Collections.ASSIGNMENTS)
        .where('teacherId', '==', user!.uid)
        .get();
      
      const teacherAssignmentIds = assignmentsSnap.docs.map(doc => doc.id);
      
      if (teacherAssignmentIds.length === 0) {
        res.json({
          success: true,
          data: buildPaginatedResponse([], 0, page, limit),
        } as ApiResponse);
        return;
      }

      // Filter by specific assignment if provided
      const filterAssignmentIds = assignmentId 
        ? [assignmentId].filter(id => teacherAssignmentIds.includes(id))
        : teacherAssignmentIds;

      if (filterAssignmentIds.length === 0) {
        res.json({
          success: true,
          data: buildPaginatedResponse([], 0, page, limit),
        } as ApiResponse);
        return;
      }

      // Firestore 'in' query limited to 10 items
      const chunks = [];
      for (let i = 0; i < filterAssignmentIds.length; i += 10) {
        chunks.push(filterAssignmentIds.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        let query: FirebaseFirestore.Query = db.collection(Collections.SUBMISSIONS)
          .where('assignmentId', 'in', chunk);
        
        if (studentId) {
          query = query.where('studentId', '==', studentId);
        }

        const snapshot = await query.get();
        submissions.push(...snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Submission));
      }

      // Sort by submittedAt descending
      submissions.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }

    // Filter by status if provided
    if (status) {
      submissions = submissions.filter(s => s.status === status);
    }

    // Populate grades and feedback for submissions
    for (const submission of submissions) {
      // Fetch grade if gradeId exists
      if (submission.gradeId) {
        const gradeDoc = await db.collection(Collections.GRADES).doc(submission.gradeId).get();
        if (gradeDoc.exists) {
          (submission as any).grade = { ...gradeDoc.data(), id: gradeDoc.id };
        }
      }

      // Fetch feedback if feedbackId exists
      if (submission.feedbackId) {
        const feedbackDoc = await db.collection(Collections.FEEDBACK).doc(submission.feedbackId).get();
        if (feedbackDoc.exists) {
          (submission as any).feedback = { ...feedbackDoc.data(), id: feedbackDoc.id };
        }
      }
    }

    // Apply pagination
    const total = submissions.length;
    const paginatedSubmissions = submissions.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: buildPaginatedResponse(paginatedSubmissions, total, page, limit),
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch submissions',
    } as ApiResponse);
  }
});

/**
 * GET /api/submissions/:id
 * Get a specific submission
 */
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const submissionDoc = await db.collection(Collections.SUBMISSIONS).doc(id).get();

    if (!submissionDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      } as ApiResponse);
      return;
    }

    const submission = { ...submissionDoc.data(), id: submissionDoc.id } as Submission;

    // Students can only see their own submissions
    if (user!.role === 'student' && submission.studentId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'Access denied',
      } as ApiResponse);
      return;
    }

    // Teachers can only see submissions for their assignments
    if (user!.role === 'teacher') {
      const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(submission.assignmentId).get();
      if (!assignmentDoc.exists || assignmentDoc.data()?.teacherId !== user!.uid) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        } as ApiResponse);
        return;
      }
    }

    // Get associated grade and feedback if exists
    let grade = null;
    let feedback = null;

    if (submission.gradeId) {
      const gradeDoc = await db.collection(Collections.GRADES).doc(submission.gradeId).get();
      if (gradeDoc.exists) {
        grade = gradeDoc.data();
      }
    }

    if (submission.feedbackId) {
      const feedbackDoc = await db.collection(Collections.FEEDBACK).doc(submission.feedbackId).get();
      if (feedbackDoc.exists) {
        feedback = feedbackDoc.data();
      }
    }

    res.json({
      success: true,
      data: { ...submission, grade, feedback },
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch submission',
    } as ApiResponse);
  }
});

/**
 * POST /api/submissions
 * Create/update a submission (students only)
 */
router.post('/', authenticate, requireStudent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const data: CreateSubmissionDTO = req.body;

    // Validate required fields
    if (!data.assignmentId) {
      res.status(400).json({
        success: false,
        error: 'Assignment ID is required',
      } as ApiResponse);
      return;
    }

    if (!data.textContent && !data.fileUrl) {
      res.status(400).json({
        success: false,
        error: 'Either text content or file is required',
      } as ApiResponse);
      return;
    }

    if (!data.integrityConfirmed) {
      res.status(400).json({
        success: false,
        error: 'Academic integrity must be confirmed',
      } as ApiResponse);
      return;
    }

    // Get the assignment
    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(data.assignmentId).get();
    
    if (!assignmentDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Assignment not found',
      } as ApiResponse);
      return;
    }

    const assignment = assignmentDoc.data() as Assignment;

    // Check if assignment is published
    if (assignment.status !== 'published') {
      res.status(400).json({
        success: false,
        error: 'Cannot submit to this assignment',
      } as ApiResponse);
      return;
    }

    const now = formatDate();
    const assignmentOverdue = isOverdue(assignment.dueDate);

    // Check if late submission is allowed
    if (assignmentOverdue && !assignment.allowLateSubmission) {
      res.status(400).json({
        success: false,
        error: 'Late submissions are not allowed for this assignment',
      } as ApiResponse);
      return;
    }

    // Check for existing submission
    const existingSnap = await db.collection(Collections.SUBMISSIONS)
      .where('assignmentId', '==', data.assignmentId)
      .where('studentId', '==', user!.uid)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      // Update existing submission
      const existingDoc = existingSnap.docs[0];
      const existingSubmission = existingDoc.data() as Submission;

      // Check max attempts
      if (existingSubmission.currentAttempt >= assignment.maxAttempts) {
        res.status(400).json({
          success: false,
          error: `Maximum attempts (${assignment.maxAttempts}) reached`,
        } as ApiResponse);
        return;
      }

      const newAttempt: SubmissionAttempt = {
        attemptNumber: existingSubmission.currentAttempt + 1,
        submittedAt: now,
        ...(data.textContent && { textContent: data.textContent }),
        ...(data.fileUrl && { fileUrl: data.fileUrl }),
      };

      const updatedSubmission: Partial<Submission> = {
        submittedAt: now,
        status: assignmentOverdue ? 'late' : 'submitted',
        attemptHistory: [...existingSubmission.attemptHistory, newAttempt],
        currentAttempt: existingSubmission.currentAttempt + 1,
        integrityConfirmed: data.integrityConfirmed,
        ...(data.textContent && { textContent: data.textContent }),
        ...(data.fileUrl && { fileUrl: data.fileUrl }),
      };

      await db.collection(Collections.SUBMISSIONS).doc(existingDoc.id).update(updatedSubmission);

      const updatedDoc = await db.collection(Collections.SUBMISSIONS).doc(existingDoc.id).get();

      res.json({
        success: true,
        data: { ...updatedDoc.data(), id: existingDoc.id } as Submission,
        message: 'Submission updated successfully',
      } as ApiResponse<Submission>);
    } else {
      // Create new submission
      const id = generateId();
      const newSubmission: Submission = {
        id,
        assignmentId: data.assignmentId,
        studentId: user!.uid,
        studentName: user!.name,
        submittedAt: now,
        status: assignmentOverdue ? 'late' : 'submitted',
        attemptHistory: [
          {
            attemptNumber: 1,
            submittedAt: now,
            ...(data.textContent && { textContent: data.textContent }),
            ...(data.fileUrl && { fileUrl: data.fileUrl }),
          },
        ],
        currentAttempt: 1,
        integrityConfirmed: data.integrityConfirmed,
        // Only include optional fields if they have values
        ...(data.textContent && { textContent: data.textContent }),
        ...(data.fileUrl && { fileUrl: data.fileUrl }),
      };

      await db.collection(Collections.SUBMISSIONS).doc(id).set(newSubmission);

      res.status(201).json({
        success: true,
        data: newSubmission,
        message: 'Submission created successfully',
      } as ApiResponse<Submission>);
    }
  } catch (error: any) {
    console.error('Create submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create submission',
    } as ApiResponse);
  }
});

/**
 * GET /api/submissions/assignment/:assignmentId
 * Get all submissions for an assignment (teachers only)
 */
router.get('/assignment/:assignmentId', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const { user } = req;
    const { page, limit } = getPaginationParams(req.query);

    // Verify teacher owns the assignment
    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(assignmentId).get();
    
    if (!assignmentDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Assignment not found',
      } as ApiResponse);
      return;
    }

    if (assignmentDoc.data()?.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'Access denied',
      } as ApiResponse);
      return;
    }

    const snapshot = await db.collection(Collections.SUBMISSIONS)
      .where('assignmentId', '==', assignmentId)
      .get();

    let submissions = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Submission);
    // Sort by submittedAt descending
    submissions.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    
    const total = submissions.length;
    const paginatedSubmissions = submissions.slice((page - 1) * limit, page * limit);

    // Get grades for submissions
    const submissionIds = paginatedSubmissions.map(s => s.id);
    const gradesMap: Record<string, any> = {};

    if (submissionIds.length > 0) {
      // Batch fetch grades
      for (const submission of paginatedSubmissions) {
        if (submission.gradeId) {
          const gradeDoc = await db.collection(Collections.GRADES).doc(submission.gradeId).get();
          if (gradeDoc.exists) {
            gradesMap[submission.id] = gradeDoc.data();
          }
        }
      }
    }

    const submissionsWithGrades = paginatedSubmissions.map(s => ({
      ...s,
      grade: gradesMap[s.id] || null,
    }));

    res.json({
      success: true,
      data: buildPaginatedResponse(submissionsWithGrades, total, page, limit),
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get assignment submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch submissions',
    } as ApiResponse);
  }
});

/**
 * GET /api/submissions/student/:studentId
 * Get all submissions by a student (teachers only)
 */
router.get('/student/:studentId', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { studentId } = req.params;
    const { user } = req;
    const { page, limit } = getPaginationParams(req.query);

    // Get teacher's assignments
    const assignmentsSnap = await db.collection(Collections.ASSIGNMENTS)
      .where('teacherId', '==', user!.uid)
      .get();
    
    const teacherAssignmentIds = assignmentsSnap.docs.map(doc => doc.id);

    if (teacherAssignmentIds.length === 0) {
      res.json({
        success: true,
        data: buildPaginatedResponse([], 0, page, limit),
      } as ApiResponse);
      return;
    }

    // Get student's submissions for teacher's assignments
    const snapshot = await db.collection(Collections.SUBMISSIONS)
      .where('studentId', '==', studentId)
      .get();

    const submissions = snapshot.docs
      .map(doc => ({ ...doc.data(), id: doc.id }) as Submission)
      .filter(s => teacherAssignmentIds.includes(s.assignmentId))
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    const total = submissions.length;
    const paginatedSubmissions = submissions.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: buildPaginatedResponse(paginatedSubmissions, total, page, limit),
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get student submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch submissions',
    } as ApiResponse);
  }
});

export default router;
