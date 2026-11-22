import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { PresignRequest } from '@/types';

/** Uploads an image (presign → upload) and resolves to the URL to save. */
export const useUpload = (purpose: PresignRequest['purpose']) => useMutation({ mutationFn: (file: File) => api.files.upload(file, purpose) });
