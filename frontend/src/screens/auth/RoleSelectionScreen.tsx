import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AuthContext } from '../../context/AuthContext';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';

export const RoleSelectionScreen = () => {
  const { updateProfile, t } = useContext(AuthContext);
  const [selectedRole, setSelectedRole] = React.useState<'candidate' | 'employer' | null>(null);
  const [fullName, setFullName] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const roles = [
    {
      id: 'candidate',
      title: 'Job Seeker',
      desc: 'Take AI interviews and get matched to jobs',
      icon: 'person',
      color: theme.colors.primary,
    },
    {
      id: 'employer',
      title: 'Employer / Interviewer',
      desc: 'Post jobs and review candidate assessments',
      icon: 'business',
      color: theme.colors.secondary,
    },
  ];

  const handleContinue = async () => {
    if (!selectedRole || !fullName.trim()) {
      Alert.alert('Missing Info', 'Please provide your full name and select a role.');
      return;
    }
    setLoading(true);
    try {
      await updateProfile({ 
        role: selectedRole,
        full_name: fullName.trim() 
      });
    } catch (error) {
      console.error('Error setting role:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>Tell us who you are and how you'll use AI SkillFit</Text>

        <View style={styles.inputSection}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. John Doe"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <Text style={[styles.label, { marginBottom: 16 }]}>I am a...</Text>

        <View style={styles.rolesContainer}>
          {roles.map((role) => (
            <TouchableOpacity
              key={role.id}
              activeOpacity={0.8}
              onPress={() => setSelectedRole(role.id as any)}
              style={styles.roleCardWrapper}
            >
              <AppCard
                style={[
                  styles.roleCard,
                  ...(selectedRole === role.id ? [{ borderColor: role.color, borderWidth: 2 }] : [])
                ]}
                variant="outlined"
              >
                <View style={[styles.iconContainer, { backgroundColor: `${role.color}15` }]}>
                  <Ionicons name={role.icon as any} size={32} color={role.color} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.roleTitle}>{role.title}</Text>
                  <Text style={styles.roleDesc}>{role.desc}</Text>
                </View>
                {selectedRole === role.id && (
                  <View style={[styles.checkCircle, { backgroundColor: role.color }]}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </View>
                )}
              </AppCard>
            </TouchableOpacity>
          ))}
        </View>

        <AppButton
          title="Continue"
          variant="primary"
          onPress={handleContinue}
          disabled={!selectedRole}
          loading={loading}
          style={styles.continueBtn}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  rolesContainer: {
    marginBottom: 48,
  },
  roleCardWrapper: {
    width: '100%',
    marginBottom: 16,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    position: 'relative',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  roleDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  checkCircle: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  continueBtn: {
    marginTop: 8,
  },
});
