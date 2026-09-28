export const CAR_SERVICE_TYPES = ['rental', 'transfer'] as const;

export type CarServiceType = (typeof CAR_SERVICE_TYPES)[number];
