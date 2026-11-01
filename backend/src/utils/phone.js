/** Strip formatting, +91 and leading 0 so every phone is stored as a 10-digit Indian mobile number. */
export const normalizePhone = (value) => {
  if (value === undefined || value === null) return value;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};

export const PHONE_REGEX = /^[6-9]\d{9}$/;
export const isValidPhone = (value) => PHONE_REGEX.test(value);
