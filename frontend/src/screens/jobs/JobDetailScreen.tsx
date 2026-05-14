import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { supabase } from '../../services/supabase/config';
import { AppButton } from '../../components/AppButton';
import { AuthContext } from '../../context/AuthContext';

export const JobDetailScreen = ({ route, navigation }: any) => {
  const { jobId } = route.params;
  const [job, setJob] = useState<any>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    fetchJobDetails();
  }, [jobId]);

  const fetchJobDetails = async () => {
    try {
      // 1. Fetch Job
      const { data, error } = await supabase
        .from('jobs')
        .select('*, companies(*)')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      setJob(data);

      // 2. Check if already applied
      if (user) {
        const { data: appData } = await supabase
          .from('applications')
          .select('id')
          .eq('user_id', user.id)
          .eq('job_id', jobId)
          .maybeSingle();
        
        if (appData) setHasApplied(true);
      }
    } catch (err) {
      console.error('Error fetching job details:', err);
      Alert.alert('Error', 'Could not load job details.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!user) return;
    setApplying(true);
    try {
      // Fix 1.6: Specify onConflict to correctly handle duplicate applications
      // when a unique constraint exists on (user_id, job_id)
      const { error: appError } = await supabase
        .from('applications')
        .upsert({ 
          user_id: user.id, 
          job_id: jobId,
          status: 'applied'
        }, { onConflict: 'user_id,job_id' });

      if (appError) throw appError;

      // 2. Navigate to Interview
      navigation.navigate('InterviewIntro', { jobId });
    } catch (err: any) {
      if (err.code === '23505') { // Unique constraint violation
        // Already applied, just go to interview
        navigation.navigate('InterviewIntro', { jobId });
      } else {
        console.error('Error applying:', err);
        Alert.alert('Error', 'Failed to submit application.');
      }
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!job) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.jobHeader}>
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.company}>{job.companies?.company_name}</Text>
          <View style={styles.tagContainer}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{job.trade}</Text>
            </View>
            <View style={[styles.tag, { backgroundColor: '#f1f5f9' }]}>
              <Text style={[styles.tagText, { color: '#64748b' }]}>{job.location}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{job.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Required Skills</Text>
          <View style={styles.skillsContainer}>
            {job.skills_required?.map((skill: string, index: number) => (
              <View key={index} style={styles.skillBadge}>
                <Text style={styles.skillText}>{skill}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Experience</Text>
            <Text style={styles.infoValue}>{job.experience_required}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Openings</Text>
            <Text style={styles.infoValue}>{job.openings}</Text>
          </View>
        </View>

        <View style={styles.companyCard}>
          <Text style={styles.companyTitle}>About {job.companies?.company_name}</Text>
          <Text style={styles.companyDesc}>{job.companies?.description}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton 
          title={hasApplied ? "Application Submitted" : (applying ? "Applying..." : "Apply & Start Interview")} 
          variant={hasApplied ? "outline" : "primary"}
          onPress={handleApply}
          loading={applying}
          disabled={hasApplied}
        />
      </View>
    </SafeAreaView>
  );
};

// Helper to keep the file working with existing components

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 20,
  },
  jobHeader: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 4,
  },
  company: {
    fontSize: 18,
    color: theme.colors.primary,
    fontWeight: '600',
    marginBottom: 12,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: theme.colors.secondary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  tagText: {
    color: theme.colors.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: theme.colors.textSecondary,
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  skillBadge: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  skillText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  infoBox: {
    flex: 0.48,
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  companyCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 16,
    borderRadius: 16,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  companyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  companyDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
});
