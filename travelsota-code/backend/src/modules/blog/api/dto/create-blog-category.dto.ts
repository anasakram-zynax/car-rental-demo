import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateBlogCategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by hyphens',
  })
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;
}
