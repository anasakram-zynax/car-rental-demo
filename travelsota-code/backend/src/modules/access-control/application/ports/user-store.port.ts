import type { UserEntity, UserWithRole, UserDetail, UserType } from '../../domain/user.entity';
import type { AgentProfileEntity } from '../../domain/agent-profile.entity';
import type { AgentProfileFilters } from './agent-profile-store.port';

export interface UserPageFilters {
  userTypes?: UserType[];
  search?: string;
  page: number;
  limit: number;
  sortBy?: 'email' | 'firstName' | 'createdAt' | 'lastLoginAt';
  sortDir?: 'asc' | 'desc';
}

export interface UserStorePort {
  findAll(): Promise<UserEntity[]>;
  findStaff(): Promise<UserEntity[]>;
  findByUserTypes(userTypes: UserType[]): Promise<UserEntity[]>;
  findPaged(filters: UserPageFilters): Promise<{ items: UserEntity[]; total: number }>;
  findAgents(filters?: AgentProfileFilters): Promise<(UserDetail & { agentProfile: AgentProfileEntity | null })[]>;
  findById(id: string): Promise<UserDetail | null>;
  findByEmail(email: string): Promise<UserWithRole | null>;
  create(data: { email: string; passwordHash: string; firstName?: string; lastName?: string; phone?: string; userType?: UserType; status?: string; roleId?: string; createdById?: string }): Promise<UserDetail>;
  update(id: string, data: { firstName?: string; lastName?: string; phone?: string; status?: string; userType?: UserType; roleId?: string; deletedAt?: Date | null }): Promise<UserDetail>;
  updateLastLogin(id: string): Promise<void>;
}
