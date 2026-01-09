// DueNow Assignment Manager - Backend Server
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import {
  authRoutes,
  assignmentRoutes,
  submissionRoutes,
  gradingRoutes,
  announcementRoutes,
  fileRoutes,
} from './routes/index.js';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Required for Vercel and other reverse proxies
app.set('trust proxy', 1);

// ============ MIDDLEWARE ============

// CORS configuration - Allow all origins
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (development)
if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ============ ROUTES ============

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'DueNow Backend is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API version info
app.get('/api', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'DueNow Assignment Manager API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      assignments: '/api/assignments',
      submissions: '/api/submissions',
      grading: '/api/grading',
      announcements: '/api/announcements',
      files: '/api/files',
    },
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/grading', gradingRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/files', fileRoutes);

// ============ ERROR HANDLING ============

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// Global error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);

  // Check for specific error types
  if (error.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: error.message,
    });
    return;
  }

  if (error.name === 'UnauthorizedError') {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
    return;
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
  });
});

// ============ SERVER START ============

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 DueNow Assignment Manager Backend                   ║
║                                                          ║
║   Server running on: http://localhost:${PORT}              ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(38)}║
║                                                          ║
║   API Endpoints:                                         ║
║   • Auth:          /api/auth                             ║
║   • Assignments:   /api/assignments                      ║
║   • Submissions:   /api/submissions                      ║
║   • Grading:       /api/grading                          ║
║   • Announcements: /api/announcements                    ║
║   • Files:         /api/files                            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);
});

export default app;