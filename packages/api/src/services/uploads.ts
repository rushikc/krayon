import { httpError } from '../errors.js';

export type UploadPart = { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> };

/** Empty and size checks shared by course files and loose uploads. */
export const readUpload = async (file: UploadPart, maxBytes: number) => {
  const data = await file.toBuffer();
  if (!data.length) throw httpError(400, 'The uploaded file is empty.');
  if (data.length > maxBytes) throw httpError(413, 'File is larger than 20 MB.');
  const name = file.filename || 'upload';
  const type = file.mimetype || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  return { name, type, data };
};

export const assertCourseFile = (type: string) => {
  if (type !== 'application/pdf' && !type.startsWith('image/')) throw httpError(400, 'Upload a PDF or a photo.');
};
