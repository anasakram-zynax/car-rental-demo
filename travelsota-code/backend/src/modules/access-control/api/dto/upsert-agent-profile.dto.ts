import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';

export class UpsertAgentProfileDto {
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) flightMarkup?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) hotelMarkup?: number;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() companyPhone?: string;
  @IsOptional() @IsString() companyAddress?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsBoolean() isApproved?: boolean;

  // Sub-agent limits
  @IsOptional() @IsNumber() @Min(0) maxSubAgents?: number;
  @IsOptional() @IsNumber() @Min(0) maxCreditPerSub?: number;
  @IsOptional() @IsBoolean() inheritMarkups?: boolean;
  @IsOptional() @IsBoolean() inheritCommission?: boolean;
  @IsOptional() @IsString() subAgentDefaultRoleId?: string;
  @IsOptional() @IsBoolean() canManageSubAgents?: boolean;
  @IsOptional() @IsBoolean() segregatedCredit?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) allowedSubAgentRoleIds?: string[];

  // Admin control surface: null/empty = all allowed.
  @IsOptional() @IsArray() @IsString({ each: true }) allowedFlightProviders?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowedHotelProviders?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowedGateways?: string[];
}
