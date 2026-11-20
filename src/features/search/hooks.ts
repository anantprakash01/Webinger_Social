import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CreatorSearchQuery } from '@/types';

export const searchKeys = {
  all: ['creators', 'search'] as const,
  query: (q: CreatorSearchQuery) => ['creators', 'search', q] as const,
};

/** Creator search (FR-20 – FR-24). Keeps the previous page on screen while the next one loads. */
export const useCreatorSearch = (query: CreatorSearchQuery) =>
  useQuery({
    queryKey: searchKeys.query(query),
    queryFn: () => api.creators.search(query),
    placeholderData: keepPreviousData,
  });
