import type { CourseState } from '@krayon/shared';

const KEY = 'krayon.course';

export const saveCourse = (course: CourseState) => {
  localStorage.setItem(KEY, JSON.stringify(course));
};

export const loadCourse = (): CourseState | null => {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CourseState;
  } catch {
    return null;
  }
};
