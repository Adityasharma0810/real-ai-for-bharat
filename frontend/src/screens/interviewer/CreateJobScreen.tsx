import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { AuthContext } from '../../context/AuthContext';
import { AppButton } from '../../components/AppButton';
import { supabase } from '../../services/supabase/config';

export const CreateJobScreen = ({ navigation }: any) => {
  const { user, profile } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    trade: '',
    experience: '',
    location: '',
    skills: '',
    openings: '1',
    companyName: '',
    companyDesc: '',
  });

  useEffect(() => {
    fetchCompanyInfo();
  }, []);

  const fetchCompanyInfo = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('created_by', user.id)
        .limit(1)
        .single();
      
      if (data) {
        setFormData(prev => ({
          ...prev,
          companyName: data.company_name,
          companyDesc: data.description || '',
        }));
      } else if (profile?.full_name) {
        setFormData(prev => ({
          ...prev,
          companyName: `${profile.full_name}'s Company`,
        }));
      }
    } catch (err) {
      console.log('No company found yet');
    }
  };

  const handleCreate = async () => {
    // Validation
    if (!formData.title || !formData.description || !formData.trade || !formData.location || !formData.companyName) {
      Alert.alert('Missing Fields', 'Please fill in all required fields including Company Name.');
      return;
    }

    setLoading(true);
    try {
      // 1. Check if company exists (may return empty if RLS blocks it — that's OK)
      let companyId: string | undefined;
      try {
        const { data: companies } = await supabase
          .from('companies')
          .select('id')
          .eq('created_by', user?.id)
          .limit(1);
        companyId = companies?.[0]?.id;
      } catch {
        // RLS may block the read — will create a new company below
        companyId = undefined;
      }

      // 2. Create or update company
      if (!companyId) {
        const { data: newCompany, error: compError } = await supabase
          .from('companies')
          .insert({
            company_name: formData.companyName,
            description: formData.companyDesc,
            created_by: user?.id,
          })
          .select('id')
          .single();
        if (compError) throw compError;
        companyId = newCompany.id;
      } else {
        await supabase
          .from('companies')
          .update({ company_name: formData.companyName, description: formData.companyDesc })
          .eq('id', companyId);
      }

      const { error } = await supabase.from('jobs').insert({
        company_id: companyId,
        title: formData.title,
        description: formData.description,
        trade: formData.trade,
        experience_required: formData.experience,
        location: formData.location,
        skills_required: formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        openings: parseInt(formData.openings) || 1,
        status: 'open',
        created_by: user?.id,
      });

      if (error) throw error;

      Alert.alert('Success', 'Job posted successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('Error creating job:', err);
      Alert.alert('Error', err.message || 'Failed to post job.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post New Job</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Company Details</Text>
          <Text style={styles.sectionSubtitle}>These will apply to all your job posts</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Company Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Acme Corp"
            value={formData.companyName}
            onChangeText={(text) => setFormData({ ...formData, companyName: text })}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Company Description</Text>
          <TextInput
            style={[styles.input, styles.textAreaSmall]}
            placeholder="Tell candidates about your company..."
            multiline
            numberOfLines={3}
            value={formData.companyDesc}
            onChangeText={(text) => setFormData({ ...formData, companyDesc: text })}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Job Details</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Job Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Senior Electrician"
            value={formData.title}
            onChangeText={(text) => setFormData({ ...formData, title: text })}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Job details and responsibilities..."
            multiline
            numberOfLines={4}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Trade *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Electrician"
              value={formData.trade}
              onChangeText={(text) => setFormData({ ...formData, trade: text })}
            />
          </View>
          <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
            <Text style={styles.label}>Location (District) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Bangalore"
              value={formData.location}
              onChangeText={(text) => setFormData({ ...formData, location: text })}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Experience</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2-5 Years"
              value={formData.experience}
              onChangeText={(text) => setFormData({ ...formData, experience: text })}
            />
          </View>
          <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
            <Text style={styles.label}>Openings</Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              keyboardType="numeric"
              value={formData.openings}
              onChangeText={(text) => setFormData({ ...formData, openings: text })}
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Skills (comma separated)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Wiring, Repair, Safety"
            value={formData.skills}
            onChangeText={(text) => setFormData({ ...formData, skills: text })}
          />
        </View>

        <AppButton
          title="Post Job"
          variant="primary"
          onPress={handleCreate}
          loading={loading}
          style={styles.submitBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  content: {
    padding: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: '#f8fafc',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    height: 80,
    textAlignVertical: 'top',
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 24,
  },
  row: {
    flexDirection: 'row',
  },
  submitBtn: {
    marginTop: 20,
    marginBottom: 40,
  },
});
