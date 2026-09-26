import type { AgentProfileEntity, KycStatusType } from '../../domain/agent-profile.entity';

export interface AgentProfileFilters {
  kycStatus?: KycStatusType;
  isApproved?: boolean;
  isSuspended?: boolean;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AgentProfileStorePort {
  findByUserId(userId: string): Promise<AgentProfileEntity | null>;
  findAll(filters?: AgentProfileFilters): Promise<AgentProfileEntity[]>;
  findByParentId(parentUserId: string): Promise<AgentProfileEntity[]>;
  countByParentId(parentUserId: string): Promise<number>;
  upsert(userId: string, data: Partial<Omit<AgentProfileEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<AgentProfileEntity>;
  update(userId: string, data: Partial<Omit<AgentProfileEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<AgentProfileEntity>;
}
