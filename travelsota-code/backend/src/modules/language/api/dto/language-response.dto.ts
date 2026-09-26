export class LanguageResponseDto {
  id!: string;
  code!: string;
  name!: string;
  direction!: string;
  isDefault!: boolean;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class PublicLanguageDto {
  code!: string;
  name!: string;
  direction!: string;
  isDefault!: boolean;
}
