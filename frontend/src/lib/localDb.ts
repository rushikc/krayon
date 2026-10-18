import type { CourseState } from '@krayon/shared';

const KEY = 'krayon.course.v2';

export const saveCourse = (course: CourseState) => {
  const json = JSON.stringify(course);
  try {
    localStorage.setItem(KEY, json);
  } catch (error) {
    const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
    if (!quota) {
      console.warn('Could not save the course locally.', error);
      return;
    }
    localStorage.removeItem(KEY);
    try {
      localStorage.setItem(KEY, json);
    } catch (again) {
      console.warn('Could not save the course locally after clearing the oldest copy.', again);
    }
  }
};

export const clearSavedCourse = () => localStorage.removeItem(KEY);

export const loadCourse = (): CourseState | null => {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const course = JSON.parse(raw) as CourseState;
    return typeof course.id === 'string' && Array.isArray(course.chapters) ? course : null;
  } catch {
    return null;
  }
};
