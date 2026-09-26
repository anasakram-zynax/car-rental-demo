export interface StandardApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
  requestId: string | null;
  data: T;
}
