export type CarLocationType = 'airport' | 'city' | 'area';

export interface CarLocationEntity {
  id: string;
  identity: string;
  label: string;
  name: string;
  city: string;
  region: string | null;
  country: string;
  type: CarLocationType;
  code: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCarLocationInput = Omit<
  CarLocationEntity,
  'id' | 'createdAt' | 'updatedAt'
>;
