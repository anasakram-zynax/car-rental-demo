import { apiRequest } from "@/lib/api/client";

export interface CheckRateInput {
  rateKey?: string;
  rateId?: string;
}

export interface CheckRateRate {
  rateKey: string;
  rateId?: string;
  net: string;
  adults?: number;
  children?: number;
  rateType?: string;
  boardCode?: string;
  boardName?: string;
  paymentType?: string;
  cancellationPolicies?: { amount: string; from: string }[];
}

export interface CheckRateRoom {
  code?: string;
  name?: string;
  rates: CheckRateRate[];
}

export interface CheckRateResponse {
  currency: string;
  rooms: CheckRateRoom[];
}

export async function checkRateApi(input: CheckRateInput) {
  return apiRequest<CheckRateResponse>("/hotels/check-rate", {
    method: "POST",
    body: input,
  });
}