import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class MenuStructureItemDto {
  @IsString()
  id!: string;

  @IsIn(['HEADER', 'FOOTER', 'BOTH'])
  position!: 'HEADER' | 'FOOTER' | 'BOTH';

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class SaveMenuStructureDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => MenuStructureItemDto)
  items!: MenuStructureItemDto[];
}
