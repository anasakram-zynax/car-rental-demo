export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateSearchInput(input: {
  from: string;
  to: string;
  departureDate: string;
}): string | null {
  if (!input.from.trim() || !input.to.trim() || !input.departureDate.trim()) {
    return 'From, To, and Departure Date are required.';
  }
  if (input.from.trim().toUpperCase() === input.to.trim().toUpperCase()) {
    return 'Origin and destination cannot be the same.';
  }
  if (!isIsoDate(input.departureDate)) {
    return 'Departure Date must be YYYY-MM-DD.';
  }
  return null;
}

export function validateTravelerInput(input: {
  givenName: string;
  surname: string;
  birthDate: string;
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;
}): string | null {
  if (!input.givenName.trim() || !input.surname.trim()) {
    return 'Given name and surname are required.';
  }
  if (!isIsoDate(input.birthDate)) {
    return 'Birth date must be YYYY-MM-DD.';
  }
  if (!input.email.trim()) {
    return 'Email is required.';
  }
  if (!input.phoneCountryCode.trim() || !input.phoneNumber.trim()) {
    return 'Phone country code and phone number are required.';
  }
  // Duffel parity (E.164): digits only, 8-15 total digits incl. country
  // code, subscriber >= 6, NANP area code 2-9. Blocks bad numbers before
  // checkout so they never fail post-payment at Duffel order create.
  if (/[a-zA-Z]/.test(input.phoneCountryCode) || /[a-zA-Z]/.test(input.phoneNumber)) {
    return 'Phone number must contain digits only, e.g. +447700900123.';
  }
  const rawPhone = input.phoneNumber.trim();
  const explicitInternational = rawPhone.startsWith('+') || rawPhone.startsWith('00');
  const phone = rawPhone.replace(/[\s\-().]/g, '').replace(/^00/, '').replace(/^\+/, '');
  const cc = input.phoneCountryCode.replace(/\D/g, '');
  if (!/^\d{1,3}$/.test(cc) || !/^\d+$/.test(phone)) {
    return 'Enter a valid country code (1-3 digits) and a digits-only phone number.';
  }
  // Strip a pasted country code only when the user typed an explicit
  // international prefix — a local number may legitimately start with the
  // same digits as the calling code.
  const subscriber =
    explicitInternational && phone.startsWith(cc) && phone.length - cc.length >= 6
      ? phone.slice(cc.length)
      : phone;
  const totalDigits = cc.length + subscriber.length;
  if (totalDigits < 8 || totalDigits > 15 || subscriber.length < 6) {
    return 'Phone number is not valid. Use international format with 8-15 total digits, e.g. +447700900123.';
  }
  if (cc === '1' && /^[01]/.test(subscriber)) {
    return 'Invalid US/Canada number: area code must start with 2-9.';
  }
  return null;
}
