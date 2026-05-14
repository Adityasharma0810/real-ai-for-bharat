import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../theme';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { AuthContext } from '../../context/AuthContext';
import { compareFaces } from '../../ai_modules/proctoring_ai';

export const InterviewIntroScreen: React.FC<any> = ({ navigation, route }) => {
  const { jobId } = route.params || {};
  const { profile, user } = useContext(AuthContext);
  const [referencePhoto, setReferencePhoto] = useState<string | null>(null);
  const [jobTrade, setJobTrade] = React.useState<string | null>(null);
  const [jobLanguage, setJobLanguage] = React.useState<string | null>(null);
  const [jobDistrict, setJobDistrict] = React.useState<string | null>(null);
  const [verifyingPhoto, setVerifyingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Fix 1.4: Fetch trade, language, and district from jobs so the interview
  // is started with the correct job context
  React.useEffect(() => {
    if (!jobId) return;
    import('../../services/supabase/config').then(({ supabase }) => {
      supabase.from('jobs').select('trade, language, district').eq('id', jobId).single()
        .then(({ data }) => {
          if (data?.trade) setJobTrade(data.trade);
          if (data?.language) setJobLanguage(data.language);
          if (data?.district) setJobDistrict(data.district);
        });
    });
  }, [jobId]);

  const effectiveTrade = jobTrade || profile?.trade || 'General';

  const signUpPhotoUrl = profile?.photo_url;

  /**
   * After a photo is selected, compare it against the sign-up photo.
   * Only runs on web where face-api.js is available.
   */
  const validateAndSetPhoto = async (uri: string) => {
    // If no sign-up photo exists or not on web, skip comparison
    if (!signUpPhotoUrl || Platform.OS !== 'web') {
      console.log('[FaceMatch] Skipping comparison — no sign-up photo or not on web');
      setReferencePhoto(uri);
      setPhotoError(null);
      return;
    }

    setVerifyingPhoto(true);
    setPhotoError(null);
    console.log('[FaceMatch] Comparing selfie against sign-up photo:', signUpPhotoUrl);

    try {
      const result = await compareFaces(signUpPhotoUrl, uri);
      console.log('[FaceMatch] Comparison result:', result);

      if (!result) {
        // Could not detect a face in one or both images
        setPhotoError('Could not detect a face in the photo. Please upload a clear, well-lit photo showing your face.');
        setReferencePhoto(null);
      } else if (!result.match) {
        setPhotoError(`This photo does not match your registered profile picture (confidence: ${Math.round((1 - result.distance) * 100)}%). Please upload your real photo.`);
        setReferencePhoto(null);
      } else {
        // Faces match!
        console.log('[FaceMatch] ✅ Identity verified! Distance:', result.distance);
        setReferencePhoto(uri);
        setPhotoError(null);
      }
    } catch (err) {
      console.error('[FaceMatch] Comparison failed:', err);
      setPhotoError('Face verification failed. Please try again with a clearer photo.');
      setReferencePhoto(null);
    } finally {
      setVerifyingPhoto(false);
    }
  };

  const instructions = [
    {
      icon: 'camera',
      title: 'Upload a Selfie',
      desc: 'Take or upload a clear photo of your face for identity verification.',
      color: '#8b5cf6',
    },
    {
      icon: 'videocam',
      title: 'Stay Visible',
      desc: 'Ensure your face is clearly visible in the camera frame.',
      color: theme.colors.primary,
    },
    {
      icon: 'mic',
      title: 'Speak Clearly',
      desc: 'Talk at a steady pace and normal volume.',
      color: theme.colors.secondary,
    },
    {
      icon: 'volume-mute',
      title: 'Quiet Environment',
      desc: 'Find a place with minimal background noise.',
      color: theme.colors.accent,
    },
  ];
  // Web camera state
  const [showWebCamera, setShowWebCamera] = useState(false);
  const webVideoRef = React.useRef<any>(null);
  const webCanvasRef = React.useRef<any>(null);
  const webStreamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Cleanup web camera on unmount
  React.useEffect(() => {
    return () => {
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startWebCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      webStreamRef.current = stream;
      setShowWebCamera(true);
      // Wait for DOM update then attach stream
      setTimeout(() => {
        if (webVideoRef.current) {
          webVideoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Web camera error:', err);
      Alert.alert('Error', 'Could not access camera. Please check permissions.');
    }
  };

  const captureWebCamera = async () => {
    if (webVideoRef.current && webCanvasRef.current) {
      const video = webVideoRef.current;
      const canvas = webCanvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        stopWebCamera();
        await validateAndSetPhoto(dataUrl);
      }
    }
  };

  const stopWebCamera = () => {
    if (webStreamRef.current) {
      webStreamRef.current.getTracks().forEach(t => t.stop());
      webStreamRef.current = null;
    }
    setShowWebCamera(false);
  };

  const handleWebFileUpload = async (event: any) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) await validateAndSetPhoto(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pickImage = async () => {
    if (Platform.OS === 'web') {
      // On web, trigger hidden file input
      if (fileInputRef.current) {
        fileInputRef.current.click();
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = handleWebFileUpload;
        input.click();
      }
      return;
    }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'We need access to your photo library to upload a reference photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        await validateAndSetPhoto(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Image pick error:', err);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      await startWebCamera();
      return;
    }
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'We need camera access to take a selfie.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });
      if (!result.canceled && result.assets[0]) {
        await validateAndSetPhoto(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AppButton
          variant="ghost"
          title=""
          icon={<Ionicons name="chevron-back" size={24} color={theme.colors.text} />}
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        />
        <Text style={styles.headerTitle}>Interview Prep</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Reference Photo Section */}
        <AppCard style={styles.photoCard} variant="outlined">
          <View style={styles.photoSection}>
            <View style={styles.photoSectionHeader}>
              <View style={[styles.stepBadge, { backgroundColor: '#8b5cf6' }]}>
                <Text style={styles.stepBadgeText}>STEP 1</Text>
              </View>
              <Text style={styles.photoTitle}>Identity Verification</Text>
              <Text style={styles.photoSubtitle}>
                Upload a clear selfie. This will be used to verify your identity throughout the interview.
              </Text>
            </View>

            {verifyingPhoto ? (
              <View style={styles.photoPreviewContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.photoSubtitle, { marginTop: 12, textAlign: 'center' }]}>Verifying identity...</Text>
              </View>
            ) : referencePhoto ? (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: referencePhoto }} style={styles.photoPreview} />
                <View style={styles.photoVerified}>
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                  <Text style={styles.photoVerifiedText}>{signUpPhotoUrl ? 'Identity Verified' : 'Photo uploaded'}</Text>
                </View>
                <TouchableOpacity onPress={() => { setReferencePhoto(null); setPhotoError(null); }} style={styles.changePhotoBtn}>
                  <Text style={styles.changePhotoText}>Change Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {photoError && (
                  <View style={styles.photoErrorBox}>
                    <Ionicons name="alert-circle" size={18} color="#dc2626" />
                    <Text style={styles.photoErrorText}>{photoError}</Text>
                  </View>
                )}
                <View style={styles.photoActions}>
                  <TouchableOpacity style={styles.photoOptionBtn} onPress={takePhoto}>
                    <View style={[styles.photoOptionIcon, { backgroundColor: '#eff6ff' }]}>
                      <Ionicons name="camera" size={28} color={theme.colors.primary} />
                    </View>
                    <Text style={styles.photoOptionLabel}>Take Selfie</Text>
                  </TouchableOpacity>

                  <View style={styles.dividerVertical} />

                  <TouchableOpacity style={styles.photoOptionBtn} onPress={pickImage}>
                    <View style={[styles.photoOptionIcon, { backgroundColor: '#f5f3ff' }]}>
                      <Ionicons name="images" size={28} color="#8b5cf6" />
                    </View>
                    <Text style={styles.photoOptionLabel}>From Gallery</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </AppCard>

        {/* Web Camera Modal */}
        {Platform.OS === 'web' && showWebCamera && (
          <AppCard style={[styles.photoCard, { marginBottom: 16 }]} variant="outlined">
            <View style={{ padding: 16, alignItems: 'center' }}>
              <Text style={[styles.photoTitle, { marginBottom: 12 }]}>Take a Selfie</Text>
              {React.createElement('video', {
                ref: webVideoRef,
                autoPlay: true,
                playsInline: true,
                muted: true,
                style: { width: '100%', maxWidth: 400, height: 300, backgroundColor: '#000', borderRadius: 12, objectFit: 'cover' },
              })}
              {React.createElement('canvas', { ref: webCanvasRef, style: { display: 'none' } })}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <TouchableOpacity
                  style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
                  onPress={captureWebCamera}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Capture Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ backgroundColor: '#6b7280', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
                  onPress={stopWebCamera}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </AppCard>
        )}

        {/* Hidden file input for web gallery upload */}
        {Platform.OS === 'web' && React.createElement('input', {
          ref: fileInputRef,
          type: 'file',
          accept: 'image/*',
          onChange: handleWebFileUpload,
          style: { display: 'none' },
        })}
        {/* Instructions */}
        <View style={styles.instructionsHeader}>
          <View style={[styles.stepBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.stepBadgeText}>STEP 2</Text>
          </View>
          <Text style={styles.title}>Get Ready</Text>
          <Text style={styles.subtitle}>
            Follow these simple steps for the best AI interview experience.
          </Text>
        </View>

        <View style={styles.instructionsContainer}>
          {instructions.map((item, index) => (
            <AppCard key={index} style={styles.instructionCard} variant="outlined">
              <View style={[styles.iconBox, { backgroundColor: `${item.color}15` }]}>
                <Ionicons name={item.icon as any} size={24} color={item.color} />
              </View>
              <View style={styles.instructionText}>
                <Text style={styles.instructionTitle}>{item.title}</Text>
                <Text style={styles.instructionDesc}>{item.desc}</Text>
              </View>
            </AppCard>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          title={referencePhoto ? "Begin Interview" : "Upload Photo First"}
          onPress={() => {
            if (!referencePhoto) {
              Alert.alert('Photo Required', 'Please upload or take a reference photo before starting the interview.');
              return;
            }
            navigation.navigate('Interview', {
              jobId,
              userId: user?.id ?? '',
              referencePhoto,
              signUpPhotoUrl: signUpPhotoUrl || null,
              candidateName: profile?.full_name ?? 'Candidate',
              trade: effectiveTrade,
              language: jobLanguage || profile?.language_preference || 'en',
              district: jobDistrict || profile?.district || '',
              phoneNumber: profile?.phone ?? '',
              email: user?.email ?? '',
            });
          }}
          style={styles.beginBtn}
          disabled={!referencePhoto}
          icon={referencePhoto ? <Ionicons name="arrow-forward" size={20} color="#fff" /> : undefined}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.md, height: 56,
  },
  backBtn: { width: 40, paddingHorizontal: 0 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text, marginLeft: theme.spacing.sm },
  content: { padding: theme.spacing.lg },

  photoCard: { padding: 0, overflow: 'hidden', marginBottom: 32 },
  photoSection: { padding: 20 },
  photoSectionHeader: { marginBottom: 20 },
  stepBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 12 },
  stepBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  photoTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  photoSubtitle: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },

  photoActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  photoOptionBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  photoOptionIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  photoOptionLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  dividerVertical: { width: 1, height: 60, backgroundColor: theme.colors.border },

  photoPreviewContainer: { alignItems: 'center' },
  photoPreview: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#22c55e', marginBottom: 12 },
  photoVerified: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  photoVerifiedText: { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  changePhotoBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  changePhotoText: { fontSize: 13, color: theme.colors.primary, fontWeight: '600' },

  photoErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  photoErrorText: { flex: 1, fontSize: 13, color: '#dc2626', lineHeight: 18 },

  instructionsHeader: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },
  instructionsContainer: { width: '100%' },
  instructionCard: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md, padding: theme.spacing.md },
  iconBox: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  instructionText: { flex: 1 },
  instructionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  instructionDesc: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },

  footer: { padding: theme.spacing.lg, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: theme.colors.border },
  beginBtn: { width: '100%' },
});
