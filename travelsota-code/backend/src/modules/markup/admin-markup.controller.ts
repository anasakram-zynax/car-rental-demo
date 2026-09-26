import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  MarkupService,
  type MarkupRuleEntity,
  type MarkupRuleInput,
  type PricePreviewInput,
  type PricePreviewResult,
} from './markup.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { SetMetadata } from '@nestjs/common';
const RequirePermission = (...permissions: string[]) =>
  SetMetadata('required_permissions', permissions);
const PermissionCode = {
  CUSTOMER_MARKUP_READ: 'customer_markup:read',
  CUSTOMER_MARKUP_WRITE: 'customer_markup:write',
} as const;
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import {
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  IsBoolean,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── DTOs ──────────────────────────────────────────────────────────

class CreateMarkupRuleDto implements MarkupRuleInput {
  @IsString() name: string;
  @IsString() @IsIn(['global', 'agent', 'supplier', 'product', 'route']) type:
    | 'global'
    | 'agent'
    | 'supplier'
    | 'product'
    | 'route';
  @IsString() @IsIn(['flights', 'hotels', 'packages', 'all']) applyTo:
    | 'flights'
    | 'hotels'
    | 'packages'
    | 'all';
  @IsString() @IsIn(['percentage', 'fixed']) markupType: 'percentage' | 'fixed';
  @IsNumber() @Min(0) markupValue: number;
  /** Only meaningful for markupType 'fixed' — the currency markupValue is denominated in. */
  @IsOptional() @IsString() currency?: string | null;
  @IsOptional() @IsNumber() @Min(0) priority?: number;
  @IsOptional() @IsString() agentId?: string | null;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @IsString() routeFrom?: string | null;
  @IsOptional() @IsString() routeTo?: string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() endDate?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateMarkupRuleDto implements Partial<MarkupRuleInput> {
  @IsOptional() @IsString() name?: string;
  @IsOptional()
  @IsString()
  @IsIn(['global', 'agent', 'supplier', 'product', 'route'])
  type?: 'global' | 'agent' | 'supplier' | 'product' | 'route';
  @IsOptional()
  @IsString()
  @IsIn(['flights', 'hotels', 'packages', 'all'])
  applyTo?: 'flights' | 'hotels' | 'packages' | 'all';
  @IsOptional() @IsString() @IsIn(['percentage', 'fixed']) markupType?:
    | 'percentage'
    | 'fixed';
  @IsOptional() @IsNumber() @Min(0) markupValue?: number;
  @IsOptional() @IsString() currency?: string | null;
  @IsOptional() @IsNumber() @Min(0) priority?: number;
  @IsOptional() @IsString() agentId?: string | null;
  @IsOptional() @IsString() supplierId?: string | null;
  @IsOptional() @IsString() routeFrom?: string | null;
  @IsOptional() @IsString() routeTo?: string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() endDate?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class ReorderDto {
  @Type(() => ReorderItem)
  items: { id: string; priority: number }[];
}

class ReorderItem {
  @IsString() id: string;
  @IsNumber() @Min(0) priority: number;
}

class TemplateRuleDto {
  @IsString() name: string;
  @IsString() @IsIn(['flights', 'hotels', 'packages', 'all']) applyTo:
    | 'flights'
    | 'hotels'
    | 'packages'
    | 'all';
  @IsString() @IsIn(['percentage', 'fixed']) markupType: 'percentage' | 'fixed';
  @IsNumber() @Min(0) markupValue: number;
  @IsOptional() @IsString() currency?: string | null;
  @IsOptional() @IsNumber() @Min(0) priority?: number;
  @IsOptional() @IsString() routeFrom?: string;
  @IsOptional() @IsString() routeTo?: string;
}

class CreateTemplateDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsArray()
  @Type(() => TemplateRuleDto)
  @ValidateNested({ each: true })
  rules?: TemplateRuleDto[];
}

class ApplyTemplateDto {
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsString() applyTo?: string;
}

class PreviewQueryDto implements PricePreviewInput {
  @Type(() => Number) @IsNumber() @Min(0) basePrice: number;
  @IsString() @IsIn(['flights', 'hotels', 'packages']) productType:
    | 'flights'
    | 'hotels'
    | 'packages';
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() routeFrom?: string;
  @IsOptional() @IsString() routeTo?: string;
  @IsOptional() @IsString() targetCurrency?: string;
}

// ── Controller (static routes before :id) ─────────────────────────

@Controller('admin/markups')
@UserTypes('admin')
export class AdminMarkupController {
  constructor(private readonly markupService: MarkupService) {}

  @Get()
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_READ)
  @ResponseMessage('Markup rules listed.')
  async findAll(): Promise<MarkupRuleEntity[]> {
    return this.markupService.findAll();
  }

  @Get('preview')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_READ)
  @ResponseMessage('Price preview calculated.')
  async preview(@Query() query: PreviewQueryDto): Promise<PricePreviewResult> {
    return this.markupService.preview(query);
  }

  @Post('calculate')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_READ)
  @ResponseMessage('Price calculated.')
  async calculate(@Body() body: PreviewQueryDto): Promise<PricePreviewResult> {
    return this.markupService.preview(body);
  }

  @Get('effective/:productType')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_READ)
  @ResponseMessage('Effective markup retrieved.')
  async getEffectiveMarkup(
    @Param('productType') productType: string,
    @Query('agentId') agentId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('routeFrom') routeFrom?: string,
    @Query('routeTo') routeTo?: string,
  ): Promise<{ totalPercent: number; rules: any[] }> {
    return this.markupService.getEffectiveMarkup(
      productType as 'flights' | 'hotels' | 'packages',
      agentId,
      supplierId,
      routeFrom,
      routeTo,
    );
  }

  // ── Template endpoints ────────────────────────────────────────

  @Get('templates')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_READ)
  @ResponseMessage('Templates listed.')
  async listTemplates() {
    return this.markupService.listTemplates();
  }

  @Post('templates')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Template created.')
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.markupService.createTemplate({
      name: dto.name,
      description: dto.description,
      rules: dto.rules ?? [],
    });
  }

  @Put('templates/:id')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Template updated.')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: Partial<CreateTemplateDto>,
  ) {
    return this.markupService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Template deleted.')
  async deleteTemplate(@Param('id') id: string) {
    await this.markupService.deleteTemplate(id);
    return { success: true };
  }

  @Post('templates/:id/apply')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Template applied.')
  async applyTemplate(@Param('id') id: string, @Body() dto: ApplyTemplateDto) {
    return this.markupService.applyTemplate(id, {
      supplierId: dto.supplierId,
      agentId: dto.agentId,
      applyTo: dto.applyTo,
    });
  }

  @Get(':id')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_READ)
  @ResponseMessage('Markup rule retrieved.')
  async findById(@Param('id') id: string): Promise<MarkupRuleEntity | null> {
    return this.markupService.findById(id);
  }

  @Post()
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Markup rule created.')
  async create(@Body() dto: CreateMarkupRuleDto): Promise<MarkupRuleEntity> {
    return this.markupService.create(dto);
  }

  @Put(':id')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Markup rule updated.')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMarkupRuleDto,
  ): Promise<MarkupRuleEntity> {
    return this.markupService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Markup rule deleted.')
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.markupService.delete(id);
    return { success: true };
  }

  @Post(':id/toggle')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Markup rule toggled.')
  async toggleActive(@Param('id') id: string): Promise<MarkupRuleEntity> {
    return this.markupService.toggleActive(id);
  }

  @Post('reorder')
  @RequirePermission(PermissionCode.CUSTOMER_MARKUP_WRITE)
  @ResponseMessage('Markup rules reordered.')
  async reorder(@Body() dto: ReorderDto): Promise<{ success: boolean }> {
    await this.markupService.reorder(dto.items);
    return { success: true };
  }
}
