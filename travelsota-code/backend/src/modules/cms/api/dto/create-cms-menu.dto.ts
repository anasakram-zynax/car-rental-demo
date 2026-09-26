import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCmsMenuDto {
  @IsString()
  @MaxLength(100)
  label!: string;

  @IsOptional()
  @IsIn(['PAGE', 'EXTERNAL'])
  linkType?: 'PAGE' | 'EXTERNAL';

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsIn(['SELF', 'BLANK'])
  target?: 'SELF' | 'BLANK';

  @IsOptional()
  @IsIn(['HEADER', 'FOOTER', 'BOTH'])
  position?: 'HEADER' | 'FOOTER' | 'BOTH';

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  footerCategoryId?: string;
}
