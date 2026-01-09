// Type definitions for DueNow Assignment Manager Backend

// ============ USER TYPES ============
export type UserRole = 'student' | 'teacher';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  enrolledTeachers?: string[]; // Array of teacher UIDs (for students only)
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUserDTO {
  name: string;
  email: string;
  role: UserRole;
  enrolledTeachers?: string[];
}

export interface UpdateUserDTO {
  name?: string;
  avatar?: string;
}

// ============ ASSIGNMENT TYPES ============
export type AssignmentStatus = 'draft' | 'published' | 'submitted' | 'late' | 'closed';
export type Priority = 'low' | 'medium' | 'high';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface RubricCriterion {
  id: string;
  name: string;
  weight: number;
  description?: string;
  score?: number;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  createdAt: string;
  updatedAt?: string;
  teacherId: string;
  teacherName: string;
  status: AssignmentStatus;
  priority: Priority;
  difficulty: Difficulty;
  attachmentUrl?: string;
  allowLateSubmission: boolean;
  maxAttempts: number;
  rubric?: RubricCriterion[];
}

export interface CreateAssignmentDTO {
  title: string;
  description: string;
  dueDate: string;
  difficulty: Difficulty;
  status?: AssignmentStatus;
  allowLateSubmission?: boolean;
  maxAttempts?: number;
  rubric?: Omit<RubricCriterion, 'id'>[];
  attachmentUrl?: string;
}

export interface UpdateAssignmentDTO {
  title?: string;
  description?: string;
  dueDate?: string;
  status?: AssignmentStatus;
  priority?: Priority;
  difficulty?: Difficulty;
  allowLateSubmission?: boolean;
  maxAttempts?: number;
  rubric?: RubricCriterion[];
  attachmentUrl?: string;
}

// ============ SUBMISSION TYPES ============
export type SubmissionStatus = 'pending' | 'submitted' | 'overdue' | 'late';

export interface SubmissionAttempt {
  attemptNumber: number;
  submittedAt: string;
  fileUrl?: string;
  textContent?: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
  fileUrl?: string;
  textContent?: string;
  status: SubmissionStatus;
  attemptHistory: SubmissionAttempt[];
  currentAttempt: number;
  integrityConfirmed: boolean;
  feedbackId?: string;
  gradeId?: string;
}

export interface CreateSubmissionDTO {
  assignmentId: string;
  textContent?: string;
  fileUrl?: string;
  integrityConfirmed: boolean;
}

// ============ FEEDBACK TYPES ============
export type FeedbackStatus = 'reviewed' | 'needs-improvement' | 'pending';

export interface Feedback {
  id: string;
  submissionId: string;
  teacherId: string;
  teacherName: string;
  content: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateFeedbackDTO {
  submissionId: string;
  content: string;
  status: FeedbackStatus;
}

export interface UpdateFeedbackDTO {
  content?: string;
  status?: FeedbackStatus;
}

// ============ GRADE TYPES ============
export type GradeStatus = 'not-graded' | 'draft' | 'finalized';
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface Grade {
  id: string;
  submissionId: string;
  teacherId: string;
  teacherName: string;
  numericScore?: number;
  letterGrade?: LetterGrade;
  rubricScores?: RubricCriterion[];
  totalScore?: number;
  comments?: string;
  status: GradeStatus;
  gradedAt?: string;
  publishedAt?: string;
}

export interface CreateGradeDTO {
  submissionId: string;
  numericScore?: number;
  letterGrade?: LetterGrade;
  rubricScores?: RubricCriterion[];
  totalScore?: number;
  comments?: string;
  status: GradeStatus;
}

export interface UpdateGradeDTO {
  numericScore?: number;
  letterGrade?: LetterGrade;
  rubricScores?: RubricCriterion[];
  totalScore?: number;
  comments?: string;
  status?: GradeStatus;
}

// ============ GRADE REVIEW REQUEST TYPES ============
export type ReviewRequestStatus = 'pending' | 'accepted' | 'declined';

export interface GradeReviewRequest {
  id: string;
  gradeId: string;
  studentId: string;
  studentName: string;
  assignmentId: string;
  assignmentTitle: string;
  message: string;
  status: ReviewRequestStatus;
  createdAt: string;
  respondedAt?: string;
  responseMessage?: string;
  teacherId: string;
}

export interface CreateGradeReviewRequestDTO {
  gradeId: string;
  message: string;
}

export interface RespondToReviewRequestDTO {
  status: 'accepted' | 'declined';
  message?: string;
}

// ============ ANNOUNCEMENT TYPES ============
export type AnnouncementType = 'global' | 'assignment';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  assignmentId?: string;
  createdAt: string;
  createdBy: string;
  creatorName: string;
  isRead?: boolean;
}

export interface CreateAnnouncementDTO {
  title: string;
  content: string;
  type: AnnouncementType;
  assignmentId?: string;
}

export interface UpdateAnnouncementDTO {
  title?: string;
  content?: string;
}

// ============ FILE UPLOAD TYPES ============
export interface FileUploadResponse {
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

// ============ API RESPONSE TYPES ============
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============ STATS TYPES ============
export interface StudentStats {
  totalAssignments: number;
  submittedCount: number;
  pendingCount: number;
  overdueCount: number;
  averageGrade?: number;
}

export interface TeacherStats {
  totalAssignments: number;
  publishedAssignments: number;
  draftAssignments: number;
  totalSubmissions: number;
  pendingGrades: number;
  gradedSubmissions: number;
}

// ============ AUTH TYPES ============
export interface AuthenticatedRequest extends Express.Request {
  user?: {
    uid: string;
    email?: string;
    role?: UserRole;
  };
}

export interface DecodedIdToken {
  uid: string;
  email?: string;
  role?: UserRole;
  name?: string;
}
