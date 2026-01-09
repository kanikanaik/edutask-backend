// Grading Routes (Grades, Feedback, Review Requests)
import { Router, Response } from 'express';
import { db, Collections } from '../config/firebase.js';
import { authenticate, requireTeacher, requireStudent, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  Grade, 
  CreateGradeDTO, 
  UpdateGradeDTO,
  Feedback,
  CreateFeedbackDTO,
  UpdateFeedbackDTO,
  GradeReviewRequest,
  CreateGradeReviewRequestDTO,
  RespondToReviewRequestDTO,
  Submission,
  Assignment,
  ApiResponse 
} from '../types/index.js';
import { 
  formatDate, 
  generateId,
  calculateLetterGrade,
  calculateTotalFromRubric,
  getPaginationParams,
  buildPaginatedResponse
} from '../utils/helpers.js';

const router = Router();

function sanitizeRubricScores(
  rubricScores: { weight: number; score?: number; [key: string]: any }[]
): { weight: number; score?: number; [key: string]: any }[] {
  return rubricScores.map((criterion) => {
    const { score, ...rest } = criterion;
    return {
      ...rest,
      ...(typeof score === 'number' ? { score } : {}),
    };
  });
}

// ============ GRADE ENDPOINTS ============

/**
 * GET /api/grading/grades
 * Get grades (students see their own, teachers see all for their assignments)
 */
router.get('/grades', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const { page, limit } = getPaginationParams(req.query);
    const status = req.query.status as string;

    let grades: Grade[] = [];

    if (user!.role === 'student') {
      // Get student's submissions first
      const submissionsSnap = await db.collection(Collections.SUBMISSIONS)
        .where('studentId', '==', user!.uid)
        .get();
      
      const submissionIds = submissionsSnap.docs.map(doc => doc.id);
      
      if (submissionIds.length > 0) {
        // Batch fetch grades
        const chunks = [];
        for (let i = 0; i < submissionIds.length; i += 10) {
          chunks.push(submissionIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const gradesSnap = await db.collection(Collections.GRADES)
            .where('submissionId', 'in', chunk)
            .where('status', '==', 'finalized') // Students only see published grades
            .get();
          
          grades.push(...gradesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Grade));
        }
      }
    } else {
      // Teachers see all grades for their submissions
      const assignmentsSnap = await db.collection(Collections.ASSIGNMENTS)
        .where('teacherId', '==', user!.uid)
        .get();
      
      const assignmentIds = assignmentsSnap.docs.map(doc => doc.id);
      
      if (assignmentIds.length > 0) {
        // Get submissions for these assignments
        const chunks = [];
        for (let i = 0; i < assignmentIds.length; i += 10) {
          chunks.push(assignmentIds.slice(i, i + 10));
        }

        const submissionIds: string[] = [];
        for (const chunk of chunks) {
          const submissionsSnap = await db.collection(Collections.SUBMISSIONS)
            .where('assignmentId', 'in', chunk)
            .get();
          submissionIds.push(...submissionsSnap.docs.map(doc => doc.id));
        }

        if (submissionIds.length > 0) {
          const gradeChunks = [];
          for (let i = 0; i < submissionIds.length; i += 10) {
            gradeChunks.push(submissionIds.slice(i, i + 10));
          }

          for (const chunk of gradeChunks) {
            let query: FirebaseFirestore.Query = db.collection(Collections.GRADES)
              .where('submissionId', 'in', chunk);
            
            if (status) {
              query = query.where('status', '==', status);
            }

            const gradesSnap = await query.get();
            grades.push(...gradesSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Grade));
          }
        }
      }
    }

    // Sort by graded date
    grades.sort((a, b) => 
      new Date(b.gradedAt || 0).getTime() - new Date(a.gradedAt || 0).getTime()
    );

    const total = grades.length;
    const paginatedGrades = grades.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: buildPaginatedResponse(paginatedGrades, total, page, limit),
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get grades error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch grades',
    } as ApiResponse);
  }
});

/**
 * GET /api/grading/grades/:id
 * Get a specific grade
 */
router.get('/grades/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const gradeDoc = await db.collection(Collections.GRADES).doc(id).get();

    if (!gradeDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Grade not found',
      } as ApiResponse);
      return;
    }

    const grade = { ...gradeDoc.data(), id: gradeDoc.id } as Grade;

    // Check access
    const submissionDoc = await db.collection(Collections.SUBMISSIONS).doc(grade.submissionId).get();
    if (!submissionDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Associated submission not found',
      } as ApiResponse);
      return;
    }

    const submission = submissionDoc.data() as Submission;

    // Students can only see their own finalized grades
    if (user!.role === 'student') {
      if (submission.studentId !== user!.uid || grade.status !== 'finalized') {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        } as ApiResponse);
        return;
      }
    }

    res.json({
      success: true,
      data: grade,
    } as ApiResponse<Grade>);
  } catch (error: any) {
    console.error('Get grade error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch grade',
    } as ApiResponse);
  }
});

/**
 * POST /api/grading/grades
 * Create a grade (teachers only)
 */
router.post('/grades', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const data: CreateGradeDTO = req.body;

    if (!data.submissionId) {
      res.status(400).json({
        success: false,
        error: 'Submission ID is required',
      } as ApiResponse);
      return;
    }

    // Verify submission exists and belongs to teacher's assignment
    const submissionDoc = await db.collection(Collections.SUBMISSIONS).doc(data.submissionId).get();
    if (!submissionDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      } as ApiResponse);
      return;
    }

    const submission = submissionDoc.data() as Submission;
    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(submission.assignmentId).get();
    
    if (!assignmentDoc.exists || assignmentDoc.data()?.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only grade submissions for your own assignments',
      } as ApiResponse);
      return;
    }

    // Check if grade already exists
    if (submission.gradeId) {
      res.status(409).json({
        success: false,
        error: 'Grade already exists. Use PUT to update.',
      } as ApiResponse);
      return;
    }

    const now = formatDate();
    const id = generateId();

    // Calculate total score from rubric if provided
    let totalScore = data.totalScore;
    let letterGrade = data.letterGrade;

    if (data.rubricScores && data.rubricScores.length > 0) {
      const sanitizedRubricScores = sanitizeRubricScores(data.rubricScores);
      totalScore = calculateTotalFromRubric(sanitizedRubricScores);
      letterGrade = letterGrade || calculateLetterGrade(totalScore) as Grade['letterGrade'];
      data.rubricScores = sanitizedRubricScores as any;
    } else if (data.numericScore !== undefined && !letterGrade) {
      letterGrade = calculateLetterGrade(data.numericScore) as Grade['letterGrade'];
    }

    const newGrade: Grade = {
      id,
      submissionId: data.submissionId,
      teacherId: user!.uid,
      teacherName: user!.name,
      status: data.status || 'draft',
      gradedAt: now,
      // Only include optional fields if they have values
      ...(data.numericScore !== undefined && { numericScore: data.numericScore }),
      ...(letterGrade && { letterGrade }),
      ...(data.rubricScores && { rubricScores: data.rubricScores }),
      ...(totalScore !== undefined && { totalScore }),
      ...(data.comments && { comments: data.comments }),
      ...(data.status === 'finalized' && { publishedAt: now }),
    };

    await db.collection(Collections.GRADES).doc(id).set(newGrade);

    // Update submission with grade reference
    await db.collection(Collections.SUBMISSIONS).doc(data.submissionId).update({
      gradeId: id,
    });

    res.status(201).json({
      success: true,
      data: newGrade,
      message: 'Grade created successfully',
    } as ApiResponse<Grade>);
  } catch (error: any) {
    console.error('Create grade error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create grade',
    } as ApiResponse);
  }
});

/**
 * PUT /api/grading/grades/:id
 * Update a grade (teachers only)
 */
router.put('/grades/:id', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const updates: UpdateGradeDTO = req.body;

    const gradeDoc = await db.collection(Collections.GRADES).doc(id).get();
    if (!gradeDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Grade not found',
      } as ApiResponse);
      return;
    }

    const grade = gradeDoc.data() as Grade;

    // Verify teacher owns this grade
    if (grade.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only update your own grades',
      } as ApiResponse);
      return;
    }

    const now = formatDate();
    const updateData: Partial<Grade> = {};

    if (updates.numericScore !== undefined) updateData.numericScore = updates.numericScore;
    if (updates.letterGrade) updateData.letterGrade = updates.letterGrade;
    if (updates.rubricScores !== undefined) {
      const sanitizedRubricScores = sanitizeRubricScores(updates.rubricScores);
      updateData.rubricScores = sanitizedRubricScores as any;
      updateData.totalScore = calculateTotalFromRubric(sanitizedRubricScores);
    }
    if (updates.totalScore !== undefined) updateData.totalScore = updates.totalScore;
    if (updates.comments !== undefined) updateData.comments = updates.comments;
    if (updates.status) {
      updateData.status = updates.status;
      if (updates.status === 'finalized' && !grade.publishedAt) {
        updateData.publishedAt = now;
      }
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid fields provided to update',
      } as ApiResponse);
      return;
    }

    await db.collection(Collections.GRADES).doc(id).update(updateData);

    const updatedDoc = await db.collection(Collections.GRADES).doc(id).get();

    res.json({
      success: true,
      data: { ...updatedDoc.data(), id } as Grade,
      message: 'Grade updated successfully',
    } as ApiResponse<Grade>);
  } catch (error: any) {
    console.error('Update grade error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update grade',
    } as ApiResponse);
  }
});

/**
 * POST /api/grading/grades/:id/publish
 * Publish a draft grade (teachers only)
 */
router.post('/grades/:id/publish', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const gradeDoc = await db.collection(Collections.GRADES).doc(id).get();
    if (!gradeDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Grade not found',
      } as ApiResponse);
      return;
    }

    const grade = gradeDoc.data() as Grade;

    if (grade.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only publish your own grades',
      } as ApiResponse);
      return;
    }

    if (grade.status === 'finalized') {
      res.status(400).json({
        success: false,
        error: 'Grade is already published',
      } as ApiResponse);
      return;
    }

    await db.collection(Collections.GRADES).doc(id).update({
      status: 'finalized',
      publishedAt: formatDate(),
    });

    res.json({
      success: true,
      message: 'Grade published successfully',
    } as ApiResponse);
  } catch (error: any) {
    console.error('Publish grade error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to publish grade',
    } as ApiResponse);
  }
});

// ============ FEEDBACK ENDPOINTS ============

/**
 * GET /api/grading/feedback/:submissionId
 * Get feedback for a submission
 */
router.get('/feedback/:submissionId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { submissionId } = req.params;
    const { user } = req;

    // Verify access to submission
    const submissionDoc = await db.collection(Collections.SUBMISSIONS).doc(submissionId).get();
    if (!submissionDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      } as ApiResponse);
      return;
    }

    const submission = submissionDoc.data() as Submission;

    // Check access
    if (user!.role === 'student' && submission.studentId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'Access denied',
      } as ApiResponse);
      return;
    }

    if (!submission.feedbackId) {
      res.json({
        success: true,
        data: null,
      } as ApiResponse);
      return;
    }

    const feedbackDoc = await db.collection(Collections.FEEDBACK).doc(submission.feedbackId).get();
    
    res.json({
      success: true,
      data: feedbackDoc.exists ? { ...feedbackDoc.data(), id: feedbackDoc.id } as Feedback : null,
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feedback',
    } as ApiResponse);
  }
});

/**
 * POST /api/grading/feedback
 * Create feedback (teachers only)
 */
router.post('/feedback', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const data: CreateFeedbackDTO = req.body;

    if (!data.submissionId || !data.content) {
      res.status(400).json({
        success: false,
        error: 'Submission ID and content are required',
      } as ApiResponse);
      return;
    }

    // Verify submission exists and belongs to teacher's assignment
    const submissionDoc = await db.collection(Collections.SUBMISSIONS).doc(data.submissionId).get();
    if (!submissionDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      } as ApiResponse);
      return;
    }

    const submission = submissionDoc.data() as Submission;
    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(submission.assignmentId).get();
    
    if (!assignmentDoc.exists || assignmentDoc.data()?.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only add feedback to your own assignments',
      } as ApiResponse);
      return;
    }

    const now = formatDate();
    const id = generateId();

    const newFeedback: Feedback = {
      id,
      submissionId: data.submissionId,
      teacherId: user!.uid,
      teacherName: user!.name,
      content: data.content,
      status: data.status || 'reviewed',
      createdAt: now,
    };

    await db.collection(Collections.FEEDBACK).doc(id).set(newFeedback);

    // Update submission with feedback reference
    await db.collection(Collections.SUBMISSIONS).doc(data.submissionId).update({
      feedbackId: id,
    });

    res.status(201).json({
      success: true,
      data: newFeedback,
      message: 'Feedback added successfully',
    } as ApiResponse<Feedback>);
  } catch (error: any) {
    console.error('Create feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create feedback',
    } as ApiResponse);
  }
});

/**
 * PUT /api/grading/feedback/:id
 * Update feedback (teachers only)
 */
router.put('/feedback/:id', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const updates: UpdateFeedbackDTO = req.body;

    const feedbackDoc = await db.collection(Collections.FEEDBACK).doc(id).get();
    if (!feedbackDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Feedback not found',
      } as ApiResponse);
      return;
    }

    const feedback = feedbackDoc.data() as Feedback;

    if (feedback.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only update your own feedback',
      } as ApiResponse);
      return;
    }

    const updateData: Partial<Feedback> = {
      updatedAt: formatDate(),
    };

    if (updates.content) updateData.content = updates.content;
    if (updates.status) updateData.status = updates.status;

    await db.collection(Collections.FEEDBACK).doc(id).update(updateData);

    const updatedDoc = await db.collection(Collections.FEEDBACK).doc(id).get();

    res.json({
      success: true,
      data: { ...updatedDoc.data(), id } as Feedback,
      message: 'Feedback updated successfully',
    } as ApiResponse<Feedback>);
  } catch (error: any) {
    console.error('Update feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update feedback',
    } as ApiResponse);
  }
});

// ============ GRADE REVIEW REQUEST ENDPOINTS ============

/**
 * GET /api/grading/review-requests
 * Get grade review requests
 */
router.get('/review-requests', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const { page, limit } = getPaginationParams(req.query);
    const status = req.query.status as string;

    let query: FirebaseFirestore.Query;

    if (user!.role === 'student') {
      query = db.collection(Collections.GRADE_REVIEW_REQUESTS)
        .where('studentId', '==', user!.uid);
    } else {
      query = db.collection(Collections.GRADE_REVIEW_REQUESTS)
        .where('teacherId', '==', user!.uid);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    // Don't use orderBy with multiple where clauses - sort in code instead
    const snapshot = await query.get();
    let requests = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as GradeReviewRequest);
    
    // Sort by createdAt descending in code
    requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = requests.length;
    const paginatedRequests = requests.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: buildPaginatedResponse(paginatedRequests, total, page, limit),
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get review requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch review requests',
    } as ApiResponse);
  }
});

/**
 * POST /api/grading/review-requests
 * Create a grade review request (students only)
 */
router.post('/review-requests', authenticate, requireStudent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const data: CreateGradeReviewRequestDTO = req.body;

    if (!data.gradeId || !data.message) {
      res.status(400).json({
        success: false,
        error: 'Grade ID and message are required',
      } as ApiResponse);
      return;
    }

    // Get the grade
    const gradeDoc = await db.collection(Collections.GRADES).doc(data.gradeId).get();
    if (!gradeDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Grade not found',
      } as ApiResponse);
      return;
    }

    const grade = gradeDoc.data() as Grade;

    // Verify the grade belongs to the student
    const submissionDoc = await db.collection(Collections.SUBMISSIONS).doc(grade.submissionId).get();
    if (!submissionDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Submission not found',
      } as ApiResponse);
      return;
    }

    const submission = submissionDoc.data() as Submission;

    if (submission.studentId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only request review for your own grades',
      } as ApiResponse);
      return;
    }

    // Get assignment info
    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(submission.assignmentId).get();
    const assignment = assignmentDoc.data() as Assignment;

    // Check for existing pending request
    const existingSnap = await db.collection(Collections.GRADE_REVIEW_REQUESTS)
      .where('gradeId', '==', data.gradeId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      res.status(409).json({
        success: false,
        error: 'A pending review request already exists for this grade',
      } as ApiResponse);
      return;
    }

    const now = formatDate();
    const id = generateId();

    const newRequest: GradeReviewRequest = {
      id,
      gradeId: data.gradeId,
      studentId: user!.uid,
      studentName: user!.name,
      assignmentId: submission.assignmentId,
      assignmentTitle: assignment.title,
      message: data.message,
      status: 'pending',
      createdAt: now,
      teacherId: grade.teacherId,
    };

    await db.collection(Collections.GRADE_REVIEW_REQUESTS).doc(id).set(newRequest);

    res.status(201).json({
      success: true,
      data: newRequest,
      message: 'Review request submitted successfully',
    } as ApiResponse<GradeReviewRequest>);
  } catch (error: any) {
    console.error('Create review request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create review request',
    } as ApiResponse);
  }
});

/**
 * PUT /api/grading/review-requests/:id/respond
 * Respond to a grade review request (teachers only)
 */
router.put('/review-requests/:id/respond', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const data: RespondToReviewRequestDTO = req.body;

    if (!data.status || !['accepted', 'declined'].includes(data.status)) {
      res.status(400).json({
        success: false,
        error: 'Valid status (accepted/declined) is required',
      } as ApiResponse);
      return;
    }

    const requestDoc = await db.collection(Collections.GRADE_REVIEW_REQUESTS).doc(id).get();
    if (!requestDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Review request not found',
      } as ApiResponse);
      return;
    }

    const request = requestDoc.data() as GradeReviewRequest;

    if (request.teacherId !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only respond to your own review requests',
      } as ApiResponse);
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).json({
        success: false,
        error: 'Review request has already been responded to',
      } as ApiResponse);
      return;
    }

    await db.collection(Collections.GRADE_REVIEW_REQUESTS).doc(id).update({
      status: data.status,
      respondedAt: formatDate(),
      responseMessage: data.message || null,
    });

    res.json({
      success: true,
      message: `Review request ${data.status}`,
    } as ApiResponse);
  } catch (error: any) {
    console.error('Respond to review request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to respond to review request',
    } as ApiResponse);
  }
});

export default router;
