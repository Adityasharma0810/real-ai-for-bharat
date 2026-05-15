import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { loginUser, loginWithAadhaar } from '../../services/supabase/auth';
import { lookupAadhaar, sendAadhaarOtp, verifyAadhaarOtp, DEMO_OTP } from '../../services/aadhaarService';
import { AuthContext } from '../../context/AuthContext';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

type Mode = 'aadhaar' | 'admin';
type Step = 'aadhaar' | 'otp';

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useContext(AuthContext);

  // ── Mode toggle ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('aadhaar');

  // ── Aadhaar flow state ──────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('aadhaar');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');

  // ── Admin flow state ────────────────────────────────────────────────────────
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError('');
    setStep('aadhaar');
    setAadhaarNumber('');
    setOtp('');
    setAdminEmail('');
    setAdminPassword('');
  };

  // ── Aadhaar: Step 1 — send OTP ──────────────────────────────────────────────
  const handleSendOtp = () => {
    setError('');
    if (!aadhaarNumber || aadhaarNumber.length !== 12) {
      setError(t('aadhaar_invalid'));
      return;
    }
    const record = lookupAadhaar(aadhaarNumber);
    if (!record) {
      setError('Aadhaar number not found. Please sign up first.');
      return;
    }
    const result = sendAadhaarOtp(aadhaarNumber);
    if (result.success) {
      setMaskedPhone(result.maskedPhone);
      setStep('otp');
      Alert.alert(
        t('otp_sent_title'),
        `${t('otp_sent_to')} ${result.maskedPhone}\n\n${t('demo_otp_hint')}: ${DEMO_OTP}`,
        [{ text: 'OK' }]
      );
    } else {
      setError('Failed to send OTP. Please try again.');
    }
  };

  // ── Aadhaar: Step 2 — verify OTP ───────────────────────────────────────────
  const handleVerifyOtp = async () => {
    setError('');
    if (!otp || otp.length < 4) {
      setError(t('enter_otp_error'));
      return;
    }
    if (!verifyAadhaarOtp(aadhaarNumber, otp)) {
      setError(t('otp_invalid'));
      return;
    }
    try {
      setLoading(true);
      await loginWithAadhaar(aadhaarNumber);
    } catch (err: any) {
      if (err.message?.includes('Invalid login credentials')) {
        setError('No account found for this Aadhaar. Please sign up first.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Admin: email + password login ───────────────────────────────────────────
  const handleAdminLogin = async () => {
    setError('');
    if (!adminEmail || !adminPassword) {
      setError(t('filling_fields'));
      return;
    }
    try {
      setLoading(true);
      await loginUser(adminEmail, adminPassword);
      // AuthContext will pick up the session; AppNavigator routes based on role
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('aadhaar');
    setOtp('');
    setError('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>{t('welcome_back')}</Text>
        <Text style={styles.subtitle}>
          {mode === 'admin' ? 'Admin login — email & password' : t('aadhaar_login_subtitle')}
        </Text>

        {/* ── Mode toggle tabs ─────────────────────────────────────────────── */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, mode === 'aadhaar' && styles.tabActive]}
            onPress={() => switchMode('aadhaar')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, mode === 'aadhaar' && styles.tabTextActive]}>
              👤 Aadhaar Login
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'admin' && styles.tabActive]}
            onPress={() => switchMode('admin')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, mode === 'admin' && styles.tabTextActive]}>
              🛡️ Admin Login
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.globalError}>{error}</Text> : null}

        {/* ── Aadhaar flow ─────────────────────────────────────────────────── */}
        {mode === 'aadhaar' && (
          <>
            {step === 'aadhaar' ? (
              <>
                <Input
                  label={t('aadhaar_label')}
                  placeholder={t('enter_aadhaar')}
                  value={aadhaarNumber}
                  onChangeText={(text: string) =>
                    setAadhaarNumber(text.replace(/[^0-9]/g, '').slice(0, 12))
                  }
                  keyboardType="numeric"
                  maxLength={12}
                />
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>{t('aadhaar_otp_info')}</Text>
                </View>
                <Button title={t('send_otp_btn')} onPress={handleSendOtp} loading={loading} />
              </>
            ) : (
              <>
                <View style={styles.otpInfoBox}>
                  <Text style={styles.otpInfoText}>
                    {t('otp_sent_to')} <Text style={styles.otpPhone}>{maskedPhone}</Text>
                  </Text>
                </View>
                <Input
                  label={t('otp_label')}
                  placeholder={t('enter_otp')}
                  value={otp}
                  onChangeText={(text: string) =>
                    setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))
                  }
                  keyboardType="numeric"
                  maxLength={6}
                />
                <View style={styles.demoHint}>
                  <Text style={styles.demoHintText}>
                    🔐 {t('demo_otp_hint')}: <Text style={styles.demoOtp}>{DEMO_OTP}</Text>
                  </Text>
                </View>
                <Button title={t('verify_otp_btn')} onPress={handleVerifyOtp} loading={loading} />
                <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                  <Text style={styles.backButtonText}>{t('change_aadhaar')}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* ── Admin flow ───────────────────────────────────────────────────── */}
        {mode === 'admin' && (
          <>
            <View style={styles.adminBanner}>
              <Text style={styles.adminBannerText}>
                🛡️ This login is for government admins only.
              </Text>
            </View>
            <Input
              label={t('email_label')}
              placeholder={t('enter_email')}
              value={adminEmail}
              onChangeText={setAdminEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label={t('password_label')}
              placeholder={t('enter_password')}
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
            />
            <Button title={t('login_btn')} onPress={handleAdminLogin} loading={loading} />
          </>
        )}

        {/* ── Sign up footer (only on Aadhaar tab) ─────────────────────────── */}
        {mode === 'aadhaar' && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('no_account')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
              <Text style={styles.footerLink}>{t('signup_link')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
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
    marginBottom: 24,
  },
  // Mode tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#111827',
  },
  globalError: {
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
  },
  // Aadhaar flow
  infoBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoText: {
    fontSize: 13,
    color: '#1d4ed8',
    lineHeight: 18,
  },
  otpInfoBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  otpInfoText: {
    fontSize: 14,
    color: '#166534',
  },
  otpPhone: {
    fontWeight: '700',
  },
  demoHint: {
    backgroundColor: '#fefce8',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fde047',
  },
  demoHintText: {
    fontSize: 13,
    color: '#713f12',
  },
  demoOtp: {
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 2,
  },
  backButton: {
    alignSelf: 'center',
    marginTop: 16,
    padding: 8,
  },
  backButtonText: {
    color: '#2563eb',
    fontWeight: '500',
    fontSize: 14,
  },
  // Admin flow
  adminBanner: {
    backgroundColor: '#1e1b4b',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  adminBannerText: {
    color: '#e0e7ff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    color: '#6b7280',
  },
  footerLink: {
    color: '#2563eb',
    fontWeight: '600',
  },
});
