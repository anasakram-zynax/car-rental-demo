import { PartialType } from '@nestjs/mapped-types';
import { CreateCmsMenuDto } from './create-cms-menu.dto';

export class UpdateCmsMenuDto extends PartialType(CreateCmsMenuDto) {}
