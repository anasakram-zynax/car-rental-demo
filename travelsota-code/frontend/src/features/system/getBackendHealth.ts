import { apiRequest } from "@/lib/api/client";

export interface HealthResponse {
    status : string;
}

export async function getBackendHealth() {
    return apiRequest<HealthResponse>(
        '/health'
    );
}