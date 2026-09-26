export class CurrencyResponseDto {
  id!: string;
  code!: string;
  symbol!: string;
  name!: string;
  isDefault!: boolean;
  isActive!: boolean;
  isBase!: boolean;
  exchangeRate!: number;
  decimals!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export class CurrencyListResponseDto {
  currencies!: CurrencyResponseDto[];
}

export class PublicCurrencyDto {
  code!: string;
  symbol!: string;
  name!: string;
  exchangeRate!: number;
  decimals!: number;
  isDefault!: boolean;
}
