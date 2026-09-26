import { PartialType } from '@nestjs/mapped-types';
import { CreateCmsFooterCategoryDto } from './create-footer-category.dto';

export class UpdateCmsFooterCategoryDto extends PartialType(CreateCmsFooterCategoryDto) {}
