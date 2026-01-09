// Announcement Routes
import { Router, Response } from 'express';
import { db, Collections } from '../config/firebase.js';
import { authenticate, requireTeacher, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  Announcement, 
  CreateAnnouncementDTO, 
  UpdateAnnouncementDTO,
  ApiResponse 
} from '../types/index.js';
import { 
  formatDate, 
  generateId,
  sanitizeString,
  getPaginationParams,
  buildPaginatedResponse
} from '../utils/helpers.js';

const router = Router();

/**
 * GET /api/announcements
 * Get all announcements (filtered based on role and assignment access)
 */
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const { page, limit } = getPaginationParams(req.query);
    const type = req.query.type as string;
    const assignmentId = req.query.assignmentId as string;

    let announcements: Announcement[] = [];

    // Get global announcements
    if (!type || type === 'global') {
      const globalSnap = await db.collection(Collections.ANNOUNCEMENTS)
        .where('type', '==', 'global')
        .get();
      
      announcements.push(...globalSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Announcement));
    }

    // Get assignment-specific announcements
    if (!type || type === 'assignment') {
      if (assignmentId) {
        // Get announcements for specific assignment
        const assignmentSnap = await db.collection(Collections.ANNOUNCEMENTS)
          .where('type', '==', 'assignment')
          .where('assignmentId', '==', assignmentId)
          .get();
        
        announcements.push(...assignmentSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Announcement));
      } else if (user!.role === 'student') {
        // For students, get announcements for published assignments only
        const publishedAssignments = await db.collection(Collections.ASSIGNMENTS)
          .where('status', 'in', ['published', 'closed'])
          .get();
        
        const assignmentIds = publishedAssignments.docs.map(doc => doc.id);
        
        if (assignmentIds.length > 0) {
          // Batch fetch announcements
          const chunks = [];
          for (let i = 0; i < assignmentIds.length; i += 10) {
            chunks.push(assignmentIds.slice(i, i + 10));
          }

          for (const chunk of chunks) {
            const assignmentAnnouncementsSnap = await db.collection(Collections.ANNOUNCEMENTS)
              .where('type', '==', 'assignment')
              .where('assignmentId', 'in', chunk)
              .get();
            
            announcements.push(...assignmentAnnouncementsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Announcement));
          }
        }
      } else {
        // For teachers, get all assignment announcements they created
        const teacherAnnouncementsSnap = await db.collection(Collections.ANNOUNCEMENTS)
          .where('type', '==', 'assignment')
          .where('createdBy', '==', user!.name)
          .get();
        
        announcements.push(...teacherAnnouncementsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Announcement));
      }
    }

    // Sort by creation date
    announcements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Remove duplicates
    const uniqueAnnouncements = Array.from(
      new Map(announcements.map(a => [a.id, a])).values()
    );

    const total = uniqueAnnouncements.length;
    const paginatedAnnouncements = uniqueAnnouncements.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: buildPaginatedResponse(paginatedAnnouncements, total, page, limit),
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get announcements error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcements',
    } as ApiResponse);
  }
});

/**
 * GET /api/announcements/assignment/:assignmentId
 * Get announcements for a specific assignment
 */
router.get('/assignment/:assignmentId', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const { user } = req;

    // Verify access to assignment
    const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(assignmentId).get();
    if (!assignmentDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Assignment not found',
      } as ApiResponse);
      return;
    }

    const assignment = assignmentDoc.data();
    
    // Students can only see announcements for published assignments
    if (user!.role === 'student' && !['published', 'closed'].includes(assignment?.status)) {
      res.status(403).json({
        success: false,
        error: 'Access denied',
      } as ApiResponse);
      return;
    }

    const snapshot = await db.collection(Collections.ANNOUNCEMENTS)
      .where('assignmentId', '==', assignmentId)
      .get();

    let announcements = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Announcement);
    // Sort by createdAt descending
    announcements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      data: announcements,
    } as ApiResponse<Announcement[]>);
  } catch (error: any) {
    console.error('Get assignment announcements error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcements',
    } as ApiResponse);
  }
});

/**
 * GET /api/announcements/:id
 * Get a specific announcement
 */
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const announcementDoc = await db.collection(Collections.ANNOUNCEMENTS).doc(id).get();

    if (!announcementDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Announcement not found',
      } as ApiResponse);
      return;
    }

    const announcement = { ...announcementDoc.data(), id: announcementDoc.id } as Announcement;

    res.json({
      success: true,
      data: announcement,
    } as ApiResponse<Announcement>);
  } catch (error: any) {
    console.error('Get announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcement',
    } as ApiResponse);
  }
});

/**
 * POST /api/announcements
 * Create a new announcement (teachers only)
 */
router.post('/', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    const data: CreateAnnouncementDTO = req.body;

    // Validate required fields
    if (!data.title || !data.content || !data.type) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: title, content, type',
      } as ApiResponse);
      return;
    }

    // If assignment-specific, verify assignment exists and teacher owns it
    if (data.type === 'assignment') {
      if (!data.assignmentId) {
        res.status(400).json({
          success: false,
          error: 'Assignment ID is required for assignment-type announcements',
        } as ApiResponse);
        return;
      }

      const assignmentDoc = await db.collection(Collections.ASSIGNMENTS).doc(data.assignmentId).get();
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
          error: 'You can only create announcements for your own assignments',
        } as ApiResponse);
        return;
      }
    }

    const now = formatDate();
    const id = generateId();

    const newAnnouncement: Announcement = {
      id,
      title: sanitizeString(data.title),
      content: sanitizeString(data.content),
      type: data.type,
      createdAt: now,
      createdBy: user!.uid,
      creatorName: user!.name,
      // Only include assignmentId if it has a value
      ...(data.assignmentId && { assignmentId: data.assignmentId }),
    };

    await db.collection(Collections.ANNOUNCEMENTS).doc(id).set(newAnnouncement);

    res.status(201).json({
      success: true,
      data: newAnnouncement,
      message: 'Announcement created successfully',
    } as ApiResponse<Announcement>);
  } catch (error: any) {
    console.error('Create announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create announcement',
    } as ApiResponse);
  }
});

/**
 * PUT /api/announcements/:id
 * Update an announcement (teachers only, own announcements)
 */
router.put('/:id', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const updates: UpdateAnnouncementDTO = req.body;

    const announcementDoc = await db.collection(Collections.ANNOUNCEMENTS).doc(id).get();

    if (!announcementDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Announcement not found',
      } as ApiResponse);
      return;
    }

    const announcement = announcementDoc.data() as Announcement;

    // Check ownership
    if (announcement.createdBy !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only edit your own announcements',
      } as ApiResponse);
      return;
    }

    const updateData: Partial<Announcement> = {};

    if (updates.title) updateData.title = sanitizeString(updates.title);
    if (updates.content) updateData.content = sanitizeString(updates.content);

    await db.collection(Collections.ANNOUNCEMENTS).doc(id).update(updateData);

    const updatedDoc = await db.collection(Collections.ANNOUNCEMENTS).doc(id).get();

    res.json({
      success: true,
      data: { ...updatedDoc.data(), id } as Announcement,
      message: 'Announcement updated successfully',
    } as ApiResponse<Announcement>);
  } catch (error: any) {
    console.error('Update announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update announcement',
    } as ApiResponse);
  }
});

/**
 * DELETE /api/announcements/:id
 * Delete an announcement (teachers only, own announcements)
 */
router.delete('/:id', authenticate, requireTeacher, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const announcementDoc = await db.collection(Collections.ANNOUNCEMENTS).doc(id).get();

    if (!announcementDoc.exists) {
      res.status(404).json({
        success: false,
        error: 'Announcement not found',
      } as ApiResponse);
      return;
    }

    const announcement = announcementDoc.data() as Announcement;

    // Check ownership
    if (announcement.createdBy !== user!.uid) {
      res.status(403).json({
        success: false,
        error: 'You can only delete your own announcements',
      } as ApiResponse);
      return;
    }

    await db.collection(Collections.ANNOUNCEMENTS).doc(id).delete();

    res.json({
      success: true,
      message: 'Announcement deleted successfully',
    } as ApiResponse);
  } catch (error: any) {
    console.error('Delete announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete announcement',
    } as ApiResponse);
  }
});

/**
 * POST /api/announcements/:id/dismiss
 * Mark an announcement as read (for the current user)
 */
router.post('/:id/dismiss', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user } = req;

    // Store dismissed announcements per user in a separate collection
    const dismissedRef = db.collection('dismissedAnnouncements').doc(`${user!.uid}_${id}`);
    
    await dismissedRef.set({
      announcementId: id,
      userId: user!.uid,
      dismissedAt: formatDate(),
    });

    res.json({
      success: true,
      message: 'Announcement dismissed',
    } as ApiResponse);
  } catch (error: any) {
    console.error('Dismiss announcement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to dismiss announcement',
    } as ApiResponse);
  }
});

export default router;
