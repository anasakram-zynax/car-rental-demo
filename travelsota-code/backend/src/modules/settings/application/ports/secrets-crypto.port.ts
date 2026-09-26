export interface SecretsCryptoPort {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}
