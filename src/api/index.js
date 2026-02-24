/**
 * Main API Module Export
 * Provides centralized access to all API services and utilities
 */

// Export all services
export * from './services';

// Export API client and utilities
export { default as apiClient } from './client';
export { get, post, put, del, handleApiError } from './client';
