import React, { useState, useContext, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Image, Modal, ActionSheetIOS, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { registerUser, checkDuplicateAadhaar, checkDuplicatePhone } from '../../services/supabase/auth';
import { AuthContext } from '../../context/AuthContext';

// Only import image picker on native
let ImagePicker: any = null;
if (Platform.OS !== 'web') {
  ImagePicker = require('expo-image-picker');
}


type SignUpScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

interface Props {
  navigation: SignUpScreenNavigationProp;
}

const WebCameraView = ({ onCapture, onClose }: { onCapture: (uri: string) => void, onClose: () => void }) => {
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setHasPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Camera access denied:', err);
        setHasPermission(false);
      }
    };
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        onCapture(dataUrl);
      }
    }
  };

  if (hasPermission === false) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: 'red', marginBottom: 16 }}>Camera access denied or not available.</Text>
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      {Platform.OS === 'web' && React.createElement('video', {
        ref: videoRef,
        autoPlay: true,
        playsInline: true,
        style: { width: '100%', height: 300, backgroundColor: 'black', borderRadius: 8, objectFit: 'cover' }
      })}
      {Platform.OS === 'web' && React.createElement('canvas', {
        ref: canvasRef,
        style: { display: 'none' }
      })}
      <View style={styles.webCamButtonRow}>
        <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Capture Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useContext(AuthContext);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [district, setDistrict] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showWebCamera, setShowWebCamera] = useState(false);

  // Web file input refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Web: use native file input ──────────────────────
  const handleWebFileChange = useCallback((event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUri(reader.result as string);
    };
    reader.readAsDataURL(file);
    setShowPhotoOptions(false);
  }, []);

  // ── Pick Image Functions ────────────────────────────
  const pickImageFromGallery = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
      setShowPhotoOptions(false);
      return;
    }

    if (!ImagePicker) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      setShowPhotoOptions(false);
      setShowWebCamera(true);
      return;
    }

    if (!ImagePicker) return;
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Please allow access to your camera.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handlePickPhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', t('take_photo'), t('choose_gallery')],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) takePhoto();
          else if (buttonIndex === 2) pickImageFromGallery();
        }
      );
    } else if (Platform.OS === 'android') {
      Alert.alert(
        t('upload_photo'),
        '',
        [
          { text: t('take_photo'), onPress: takePhoto },
          { text: t('choose_gallery'), onPress: pickImageFromGallery },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } else {
      setShowPhotoOptions(true);
    }
  };

  const handleAadhaarBlur = async () => {
    if (aadhaarNumber.length === 12) {
      const isDuplicate = await checkDuplicateAadhaar(aadhaarNumber);
      if (isDuplicate) {
        setValidationErrors(prev => ({ ...prev, aadhaar: t('aadhaar_duplicate_error') || 'Aadhaar already registered' }));
      } else {
        setValidationErrors(prev => { const { aadhaar, ...rest } = prev; return rest; });
      }
    }
  };

  const handlePhoneBlur = async () => {
    if (phoneNumber.length === 10) {
      const isDuplicate = await checkDuplicatePhone(phoneNumber);
      if (isDuplicate) {
        setValidationErrors(prev => ({ ...prev, phone: 'Phone number already registered' }));
      } else {
        setValidationErrors(prev => { const { phone, ...rest } = prev; return rest; });
      }
    }
  };

  const autofillLocation = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data && data.city) {
        setDistrict(data.city);
        setValidationErrors(prev => { const { district, ...rest } = prev; return rest; });
      } else {
        Alert.alert('Error', 'Could not detect location. Please enter manually.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not detect location. Please enter manually.');
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!name) errors.name = t('filling_fields');
    if (!email) {
      errors.email = t('filling_fields');
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = 'Email is invalid';
    }
    
    if (!password) {
      errors.password = t('filling_fields');
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // Aadhaar validation — exactly 12 digits
    if (!aadhaarNumber) {
      errors.aadhaar = t('filling_fields');
    } else if (!/^\d{12}$/.test(aadhaarNumber)) {
      errors.aadhaar = t('aadhaar_invalid');
    }

    // Phone validation — exactly 10 digits
    if (!phoneNumber) {
      errors.phone = t('filling_fields');
    } else if (!/^\d{10}$/.test(phoneNumber)) {
      errors.phone = t('phone_invalid');
    }

    // Photo validation
    if (!photoUri) {
      errors.photo = t('filling_fields');
    }

    if (!district.trim()) {
      errors.district = t('filling_fields');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const { refreshProfile } = useContext(AuthContext);

  const handleSignUp = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      setError('');
      const newUser = await registerUser(name, email, password, aadhaarNumber, phoneNumber, photoUri || undefined, district);
      // Fetch the updated profile immediately so photo_url is loaded
      if (newUser?.id) {
        await refreshProfile(newUser.id);
      }
    } catch (err: any) {
      if (err.message === 'AADHAAR_DUPLICATE') {
        setError(t('aadhaar_duplicate_error'));
      } else {
        setError(err.message || 'Failed to create an account');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('create_account')}</Text>
          <Text style={styles.subtitle}>{t('join_skillfit')}</Text>
        </View>

        {error ? <Text style={styles.globalError}>{error}</Text> : null}

        {/* ── Photo Upload ─────────────────────────────────── */}
        <View style={styles.photoSection}>
          <Text style={styles.photoLabel}>{t('upload_photo')}</Text>
          {/* Hidden file input for web gallery */}
          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef as any}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleWebFileChange}
            />
          )}
          <TouchableOpacity style={styles.photoPickerButton} onPress={handlePickPhoto} activeOpacity={0.7}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderIcon}>📷</Text>
                <Text style={styles.photoPlaceholderText}>{t('upload_photo')}</Text>
              </View>
            )}
          </TouchableOpacity>
          {validationErrors.photo ? <Text style={styles.errorText}>{validationErrors.photo}</Text> : null}
        </View>

        {/* Photo Options Modal for Web */}
        {Platform.OS === 'web' && (
          <Modal transparent visible={showPhotoOptions} animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{t('upload_photo')}</Text>
                <TouchableOpacity style={styles.modalButton} onPress={takePhoto}>
                  <Text style={styles.modalButtonText}>{t('take_photo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButton} onPress={pickImageFromGallery}>
                  <Text style={styles.modalButtonText}>{t('choose_gallery')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setShowPhotoOptions(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* Web Camera Modal */}
        {Platform.OS === 'web' && showWebCamera && (
          <Modal transparent visible={showWebCamera} animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.webCameraContainer}>
                <WebCameraView 
                  onCapture={(uri) => {
                    setPhotoUri(uri);
                    setShowWebCamera(false);
                  }}
                  onClose={() => setShowWebCamera(false)}
                />
              </View>
            </View>
          </Modal>
        )}

        <Input
          label={t('full_name_label')}
          placeholder={t('enter_full_name')}
          value={name}
          onChangeText={setName}
          error={validationErrors.name}
        />

        <Input
          label={t('email_label')}
          placeholder={t('enter_email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={validationErrors.email}
        />

        {/* ── Aadhaar Number ──────────────────────────────── */}
        <Input
          label={t('aadhaar_label')}
          placeholder={t('enter_aadhaar')}
          value={aadhaarNumber}
          onChangeText={(text: string) => setAadhaarNumber(text.replace(/[^0-9]/g, '').slice(0, 12))}
          onBlur={handleAadhaarBlur}
          keyboardType="numeric"
          maxLength={12}
          error={validationErrors.aadhaar}
        />

        {/* ── Phone Number ────────────────────────────────── */}
        <Input
          label={t('phone_label_signup')}
          placeholder={t('enter_phone_signup')}
          value={phoneNumber}
          onChangeText={(text: string) => setPhoneNumber(text.replace(/[^0-9]/g, '').slice(0, 10))}
          onBlur={handlePhoneBlur}
          keyboardType="phone-pad"
          maxLength={10}
          error={validationErrors.phone}
        />

        {/* ── Location ────────────────────────────────────── */}
        <View style={styles.locationContainer}>
          <View style={styles.locationInputWrapper}>
            <Input
              label="Location (City/District)"
              placeholder="e.g. Mumbai"
              value={district}
              onChangeText={setDistrict}
              error={validationErrors.district}
            />
          </View>
          <TouchableOpacity 
            style={styles.autofillButton}
            onPress={autofillLocation}
          >
            <Text style={styles.autofillText}>Autofill</Text>
          </TouchableOpacity>
        </View>

        <Input
          label={t('password_label')}
          placeholder={t('enter_password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={validationErrors.password}
        />

        <Input
          label={t('password_label')}
          placeholder={t('enter_password')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          error={validationErrors.confirmPassword}
        />

        <View style={styles.buttonContainer}>
          <Button 
            title={t('signup_btn')} 
            onPress={handleSignUp} 
            loading={loading} 
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('have_account')} </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>{t('login_link')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  globalError: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
  },
  // ── Photo styles ──────────────────────────────────────
  photoSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  photoLabel: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 10,
    fontWeight: '500',
    alignSelf: 'flex-start',
  },
  photoPickerButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  photoPreview: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  photoPlaceholderText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  // ── Web Modal Styles ──────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 300,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    color: '#111827',
  },
  modalButton: {
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    color: '#2563eb',
  },
  modalCancelButton: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '600',
  },
  webCameraContainer: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 16,
  },
  webCamButtonRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
    justifyContent: 'center',
  },
  captureButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#6b7280',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  // ── Original styles ───────────────────────────────────
  buttonContainer: {
    marginTop: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationInputWrapper: {
    flex: 1,
  },
  autofillButton: {
    marginTop: 26,
    marginLeft: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    height: 48,
  },
  autofillText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 14,
  },
  footerText: {
    color: '#6b7280',
  },
  footerLink: {
    color: '#2563eb',
    fontWeight: '600',
  },
});

