/**
 * Aadhaar Service — Mock implementation for prototype.
 *
 * In production this would call the government UIDAI API.
 * For now it reads from a local JSON file that simulates the government database.
 *
 * OTP flow: A fixed OTP "123456" is used for all accounts (prototype only).
 */

import aadhaarDatabase from '../data/aadhaarDatabase.json';

export interface AadhaarRecord {
  aadhaar_number: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  district: string;
  gender: string;
  dob: string;
  age: string;
}

// The fixed OTP used for all logins in this prototype
export const DEMO_OTP = '123456';

/**
 * Look up an Aadhaar number in the mock government database.
 * Returns the record if found, null otherwise.
 */
export const lookupAadhaar = (aadhaarNumber: string): AadhaarRecord | null => {
  const record = (aadhaarDatabase as AadhaarRecord[]).find(
    (entry) => entry.aadhaar_number === aadhaarNumber
  );
  return record || null;
};

/**
 * Simulate sending an OTP to the mobile number linked to the Aadhaar.
 * In production this would trigger an SMS via UIDAI.
 * Returns the masked phone number for display.
 */
export const sendAadhaarOtp = (aadhaarNumber: string): { success: boolean; maskedPhone: string } => {
  const record = lookupAadhaar(aadhaarNumber);
  if (!record) {
    return { success: false, maskedPhone: '' };
  }
  // Mask the phone: show only last 4 digits
  const masked = 'XXXXXX' + record.phone.slice(-4);
  // In a real app: call SMS gateway here
  console.log(`[DEMO] OTP sent to ${masked}. Use OTP: ${DEMO_OTP}`);
  return { success: true, maskedPhone: masked };
};

/**
 * Verify the OTP entered by the user.
 * In this prototype, any Aadhaar with a valid record accepts OTP "123456".
 */
export const verifyAadhaarOtp = (aadhaarNumber: string, otp: string): boolean => {
  const record = lookupAadhaar(aadhaarNumber);
  if (!record) return false;
  return otp === DEMO_OTP;
};
