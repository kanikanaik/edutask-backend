// File Upload Routes
import { Router, Response } from 'express';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '../config/firebase.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { ApiResponse, FileUploadResponse } from '../types/index.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

const uploadSingleFile = upload.single('file') as unknown as RequestHandler;

/**
 * POST /api/files/upload
 * Upload a file to Firebase Storage
 */
router.post('/upload', authenticate, uploadSingleFile, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file provided',
      } as ApiResponse);
      return;
    }

    const { user } = req;
    const file = req.file;
    const folder = req.body.folder || 'uploads';

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop();
    const uniqueFilename = `${folder}/${user!.uid}/${uuidv4()}.${fileExtension}`;

    // Get bucket reference
    const bucket = storage.bucket();
    const fileRef = bucket.file(uniqueFilename);

    // Upload file
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedBy: user!.uid,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Make file publicly accessible (or use signed URLs for private files)
    await fileRef.makePublic();

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;

    const response: FileUploadResponse = {
      url: publicUrl,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    };

    res.status(201).json({
      success: true,
      data: response,
      message: 'File uploaded successfully',
    } as ApiResponse<FileUploadResponse>);
  } catch (error: any) {
    console.error('File upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload file',
    } as ApiResponse);
  }
});

/**
 * POST /api/files/upload/assignment-attachment
 * Upload an assignment attachment (teachers only)
 */
router.post('/upload/assignment-attachment', authenticate, uploadSingleFile, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;

    if (user!.role !== 'teacher') {
      res.status(403).json({
        success: false,
        error: 'Only teachers can upload assignment attachments',
      } as ApiResponse);
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file provided',
      } as ApiResponse);
      return;
    }

    const file = req.file;
    const assignmentId = req.body.assignmentId || 'new';

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop();
    const uniqueFilename = `assignments/${assignmentId}/${uuidv4()}.${fileExtension}`;

    // Get bucket reference
    const bucket = storage.bucket();
    const fileRef = bucket.file(uniqueFilename);

    // Upload file
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedBy: user!.uid,
          uploadedAt: new Date().toISOString(),
          type: 'assignment-attachment',
        },
      },
    });

    // Make file publicly accessible
    await fileRef.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;

    const response: FileUploadResponse = {
      url: publicUrl,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    };

    res.status(201).json({
      success: true,
      data: response,
      message: 'Assignment attachment uploaded successfully',
    } as ApiResponse<FileUploadResponse>);
  } catch (error: any) {
    console.error('Assignment attachment upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload attachment',
    } as ApiResponse);
  }
});

/**
 * POST /api/files/upload/submission
 * Upload a submission file (students only)
 */
router.post('/upload/submission', authenticate, uploadSingleFile, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;

    if (user!.role !== 'student') {
      res.status(403).json({
        success: false,
        error: 'Only students can upload submission files',
      } as ApiResponse);
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file provided',
      } as ApiResponse);
      return;
    }

    const file = req.file;
    const assignmentId = req.body.assignmentId;

    if (!assignmentId) {
      res.status(400).json({
        success: false,
        error: 'Assignment ID is required',
      } as ApiResponse);
      return;
    }

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop();
    const uniqueFilename = `submissions/${assignmentId}/${user!.uid}/${uuidv4()}.${fileExtension}`;

    // Get bucket reference
    const bucket = storage.bucket();
    const fileRef = bucket.file(uniqueFilename);

    // Upload file
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedBy: user!.uid,
          uploadedAt: new Date().toISOString(),
          type: 'submission',
          assignmentId,
        },
      },
    });

    // Make file publicly accessible
    await fileRef.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;

    const response: FileUploadResponse = {
      url: publicUrl,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    };

    res.status(201).json({
      success: true,
      data: response,
      message: 'Submission file uploaded successfully',
    } as ApiResponse<FileUploadResponse>);
  } catch (error: any) {
    console.error('Submission file upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload submission file',
    } as ApiResponse);
  }
});

/**
 * DELETE /api/files/:filename
 * Delete a file from Firebase Storage
 */
router.delete('/:filename(*)', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename } = req.params;
    const { user } = req;

    // Get bucket reference
    const bucket = storage.bucket();
    const fileRef = bucket.file(filename);

    // Check if file exists
    const [exists] = await fileRef.exists();
    if (!exists) {
      res.status(404).json({
        success: false,
        error: 'File not found',
      } as ApiResponse);
      return;
    }

    // Get file metadata to verify ownership
    const [metadata] = await fileRef.getMetadata();
    const uploadedBy = metadata.metadata?.uploadedBy;

    // Only allow deletion by the uploader or teachers
    if (uploadedBy !== user!.uid && user!.role !== 'teacher') {
      res.status(403).json({
        success: false,
        error: 'You can only delete your own files',
      } as ApiResponse);
      return;
    }

    await fileRef.delete();

    res.json({
      success: true,
      message: 'File deleted successfully',
    } as ApiResponse);
  } catch (error: any) {
    console.error('File deletion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete file',
    } as ApiResponse);
  }
});

/**
 * GET /api/files/signed-url/:filename
 * Get a signed URL for private file access
 */
router.get('/signed-url/:filename(*)', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { filename } = req.params;

    // Get bucket reference
    const bucket = storage.bucket();
    const fileRef = bucket.file(filename);

    // Check if file exists
    const [exists] = await fileRef.exists();
    if (!exists) {
      res.status(404).json({
        success: false,
        error: 'File not found',
      } as ApiResponse);
      return;
    }

    // Generate signed URL (valid for 1 hour)
    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    res.json({
      success: true,
      data: { url: signedUrl },
    } as ApiResponse);
  } catch (error: any) {
    console.error('Signed URL generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate signed URL',
    } as ApiResponse);
  }
});

// Error handling middleware for multer errors
router.use((error: any, req: AuthenticatedRequest, res: Response, next: Function) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: 'File size exceeds the 10MB limit',
      } as ApiResponse);
      return;
    }
    res.status(400).json({
      success: false,
      error: error.message,
    } as ApiResponse);
    return;
  }

  if (error.message?.includes('File type')) {
    res.status(400).json({
      success: false,
      error: error.message,
    } as ApiResponse);
    return;
  }

  next(error);
});

export default router;
