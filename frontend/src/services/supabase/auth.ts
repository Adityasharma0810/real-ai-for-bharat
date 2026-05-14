import { supabase } from './config';
import { Platform } from 'react-native';

export const loginUser = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.user;
};

export const checkDuplicateAadhaar = async (aadhaarNumber: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('aadhaar_number', aadhaarNumber)
      .limit(1);

    if (error) {
      console.error('Error checking duplicate Aadhaar:', error);
      return false;
    }
    return (data && data.length > 0);
  } catch (err: any) {
    console.error('Network or unexpected error checking duplicate Aadhaar:', err);
    throw new Error('Network error connecting to the database. Please try again in a few seconds.');
  }
};

export const checkDuplicatePhone = async (phone: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .limit(1);

    if (error) {
      console.error('Error checking duplicate phone:', error);
      return false;
    }
    return (data && data.length > 0);
  } catch (err: any) {
    console.error('Network or unexpected error checking duplicate phone:', err);
    throw new Error('Network error connecting to the database. Please try again in a few seconds.');
  }
};

const uploadProfilePhoto = async (userId: string, photoUri: string): Promise<string | null> => {
  // Try Supabase Storage first
  try {
    const fileName = `${userId}-${Date.now()}.jpg`;
    const filePath = `${fileName}`;

    // Fetch the image as a blob for web compatibility
    const response = await fetch(photoUri);
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from('profile-photos')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.warn('Storage upload failed, falling back to base64:', uploadError.message);
      // Fall through to base64 fallback below
    } else {
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);
      if (urlData?.publicUrl) return urlData.publicUrl;
    }
  } catch (err) {
    console.warn('Storage upload exception, falling back to base64:', err);
  }

  // Fallback: store as base64 data URL directly (works without storage bucket)
  try {
    if (photoUri.startsWith('data:')) {
      // Already a data URL — use it directly
      return photoUri;
    }
    // Convert blob/file URI to data URL
    const response = await fetch(photoUri);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Base64 fallback also failed:', err);
    return null;
  }
};

export const registerUser = async (
  name: string,
  email: string,
  password: string,
  aadhaarNumber?: string,
  phoneNumber?: string,
  photoUri?: string,
  district?: string,
) => {
  // 1. Check for duplicate Aadhaar BEFORE creating the auth user
  if (aadhaarNumber) {
    const isDuplicate = await checkDuplicateAadhaar(aadhaarNumber);
    if (isDuplicate) {
      throw new Error('AADHAAR_DUPLICATE');
    }
  }

  if (phoneNumber) {
    const isDuplicate = await checkDuplicatePhone(phoneNumber);
    if (isDuplicate) {
      throw new Error('PHONE_DUPLICATE');
    }
  }

  // 2. Create the auth user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
      },
    },
  });
  
  if (error) throw error;

  // 3. Store user details in the profiles table
  if (data.user) {
    // Upload photo if provided
    let photoUrl: string | null = null;
    if (photoUri) {
      photoUrl = await uploadProfilePhoto(data.user.id, photoUri);
    }

    // Fix 1.8: Include role: 'candidate' so new users are not rejected by the admin dashboard
    const profileData: Record<string, any> = {
      id: data.user.id,
      full_name: name,
      email: email,
      role: 'candidate',
      updated_at: new Date(),
    };

    if (aadhaarNumber) {
      profileData.aadhaar_number = aadhaarNumber;
    }
    if (phoneNumber) {
      profileData.phone = phoneNumber;
    }
    if (photoUrl) {
      profileData.photo_url = photoUrl;
    }
    if (district) {
      profileData.district = district;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profileData);
    
    if (profileError) {
      console.error('Error creating profile:', profileError);
    }
  }

  return data.user;
};

export const updateUserProfile = async (updates: { 
  full_name?: string; 
  trade?: string; 
  experience?: string;
  phone?: string;
  age?: string;
  gender?: string;
  district?: string;
  experience_level?: string;
  skills?: string[];
  education?: string;
  work_preference?: string;
}) => {
  // 1. Update Auth User Metadata
  const { data: authData, error: authError } = await supabase.auth.updateUser({
    data: { 
      full_name: updates.full_name,
      trade: updates.trade,
    }
  });

  if (authError) throw authError;

  // 2. Update profiles Table with ALL fields
  if (authData.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: authData.user.email,
        ...updates,
        updated_at: new Date(),
      });

    if (profileError) {
      console.error('Error updating profiles table:', profileError);
    }
  }

  return authData.user;
};

export const logoutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
};
