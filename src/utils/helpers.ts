// Utility functions for the backend

import { Priority } from '../types/index.js';

/**
 * Calculate priority based on deadline
 */
export function calculatePriorityFromDeadline(dueDate: string): Priority {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 2) return 'high';
  if (diffDays <= 5) return 'medium';
  return 'low';
}

/**
 * Check if a date is in the past
 */
export function isOverdue(dueDate: string): boolean {
  const now = new Date();
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  return now > due;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format date to ISO string
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/<[^>]*>/g, '');
}

/**
 * Calculate letter grade from numeric score
 */
export function calculateLetterGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Calculate total score from rubric scores
 */
export function calculateTotalFromRubric(rubricScores: { weight: number; score?: number }[]): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const criterion of rubricScores) {
    if (criterion.score !== undefined) {
      totalWeight += criterion.weight;
      weightedScore += (criterion.score * criterion.weight) / 100;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedScore / totalWeight) * 100);
}

/**
 * Pagination helper
 */
export function getPaginationParams(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build paginated response
 */
export function buildPaginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
