import { apiRequest } from '@/lib/api/client';

export interface PublicLanguageDto {
  code: string;
  name: string;
  direction: string;
  isDefault: boolean;
}

export function fetchActiveLanguages(): Promise<PublicLanguageDto[]> {
  return apiRequest<PublicLanguageDto[]>('/languages');
}
