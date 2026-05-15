import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
  TrendingUp,
  Award,
  ShieldAlert,
  BarChart2,
} from 'lucide-react';
import { AdminPortfolioViewer } from './components/AdminPortfolioViewer';
import departmentAccess from './data/departmentAccess.json';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { supabase } from './lib/supabase';
import { getInterviewResults } from './lib/backend';

// ── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'candidate' | 'employer' | 'admin' | null;
};

type DepartmentAccessConfig = {
  superAdmins: string[];
  departments: { label: string; email: string; trades: string[] }[];
};

type Interview = {
  id: string;
  user_id: string | null;
  job_id: string | null;
  candidate_name: string | null;
  phone_number: string | null;
  trade: string | null;
  language: string | null;
  district: string | null;
  category: string | null;
  fitment: string | null;
  average_score: number | null;
  confidence_score: number | null;
  integrity_flag: boolean | null;
  scores: number[] | null;
  weak_topics: string[] | null;
  feedback: { strengths: string[]; improvements: string[] } | null;
  transcript: { role: string; content: string }[] | null;
  created_at: string;
  // joined from profiles
  full_name?: string | null;
  email?: string | null;
  profile_district?: string | null;
  experience_level?: string | null;
};

const DEPARTMENT_ACCESS = departmentAccess as DepartmentAccessConfig;

function normalizeValue(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function resolveDepartmentAccess(email?: string | null) {
  const normalized = normalizeValue(email);
  if (!normalized) return { label: null, allowedTrades: null, isSuperAdmin: false };
  if ((DEPARTMENT_ACCESS.superAdmins || []).some((admin) => normalizeValue(admin) === normalized)) {
    return { label: null, allowedTrades: null, isSuperAdmin: true };
  }
  const department = (DEPARTMENT_ACCESS.departments || []).find((d) => normalizeValue(d.email) === normalized);
  if (!department) return { label: null, allowedTrades: null, isSuperAdmin: false };
  return { label: department.label, allowedTrades: department.trades || [], isSuperAdmin: false };
}

type JobForm = {
  id?: string;
  title: string;
  description: string;
  trade: string;
  experience_required: string;
  location: string;
  skills_required: string;
  openings: string;
  company_name: string;
  company_description: string;
};

const emptyJobForm: JobForm = {
  title: '', description: '', trade: '', experience_required: '',
  location: '', skills_required: '', openings: '1',
  company_name: '', company_description: '',
};

// ── Fitment helpers ──────────────────────────────────────────────────────────

const FITMENT_COLORS: Record<string, string> = {
  'Job-Ready': '#10b981',
  'Requires Training': '#f59e0b',
  'Low Confidence': '#ef4444',
  'Requires Significant Upskilling': '#8b5cf6',
};

const FITMENT_BADGE: Record<string, string> = {
  'Job-Ready': 'badge-success',
  'Requires Training': 'badge-warning',
  'Low Confidence': 'badge-danger',
  'Requires Significant Upskilling': 'badge-purple',
};

const CATEGORY_BADGE: Record<string, string> = {
  'Blue-collar Trades': 'badge-info',
  'Polytechnic-Skilled Roles': 'badge-purple',
  'Semi-Skilled Workforce': 'badge-gray',
};

function scoreColor(score: number): string {
  if (score >= 7.5) return '#10b981';
  if (score >= 5) return '#f59e0b';
  return '#ef4444';
}

function fitmentBadge(fitment: string | null) {
  if (!fitment) return <span className="badge badge-gray">—</span>;
  return <span className={`badge ${FITMENT_BADGE[fitment] ?? 'badge-gray'}`}>{fitment}</span>;
}

// ── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="score-bar-wrap">
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: `${pct}%`, background: scoreColor(score) }}
        />
      </div>
      <span className="score-label" style={{ color: scoreColor(score) }}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const departmentAccessInfo = useMemo(
    () => resolveDepartmentAccess(sessionUser?.email ?? profile?.email ?? null),
    [sessionUser?.email, profile?.email]
  );

  useEffect(() => {
    bootstrap();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
      if (session?.user) loadProfileAndData(session.user.id);
      else { setProfile(null); setJobs([]); setCandidates([]); setInterviews([]); setLoading(false); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function bootstrap() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    setSessionUser(user);
    if (user) await loadProfileAndData(user.id);
    else setLoading(false);
  }

  async function loadProfileAndData(userId: string) {
    setLoading(true);
    const { data: profileData, error } = await supabase
      .from('profiles').select('id, full_name, email, role').eq('id', userId).maybeSingle();
    if (error) { setMessage(error.message); setLoading(false); return; }
    if (!profileData) { setMessage('Profile not found. Please log out and contact admin.'); setLoading(false); return; }
    setProfile(profileData);
    if (profileData?.role === 'admin' || profileData?.role === 'employer') {
      await fetchData(userId, profileData.role);
    }
    setLoading(false);
  }

  const fetchData = useCallback(async (userId = sessionUser?.id, role = profile?.role) => {
    if (!userId) return;
    const isAdmin = role === 'admin';
    const allowedTrades = departmentAccessInfo.allowedTrades || [];
    const hasTradeRestriction = allowedTrades.length > 0;
    const allowedTradeSet = new Set(allowedTrades.map((trade) => normalizeValue(trade)));

    // Jobs
    const jobsQuery = supabase
      .from('jobs')
      .select('*, companies(id, company_name, description), applications(count)')
      .order('created_at', { ascending: false });
    if (!isAdmin) jobsQuery.eq('created_by', userId);
    const { data: jobsData, error: jobsError } = await jobsQuery;
    if (jobsError) { setMessage(jobsError.message); return; }

    const jobIds = (jobsData || []).map((j: any) => j.id);
    let appsData: any[] = [];

    if (jobIds.length > 0) {
      const { data: applications, error: appsError } = await supabase
        .from('applications')
        .select('*, profiles(full_name, email, phone, trade, district, experience_level, education, work_preference, skills, age, gender), jobs(title, company_id)')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false });
      if (appsError) { setMessage(appsError.message); return; }
      appsData = applications || [];
    }

    let interviewData = await getInterviewResults();
    if (!isAdmin && jobIds.length > 0) {
      interviewData = interviewData.filter((item: any) => jobIds.includes(item.job_id));
    }
    if (hasTradeRestriction) {
      interviewData = interviewData.filter((item: any) =>
        allowedTradeSet.has(normalizeValue(item.trade))
      );
    }

    setJobs(jobsData || []);
    setInterviews((interviewData || []) as Interview[]);

    // Build candidates list: start with application-based candidates
    const appCandidates = appsData.map((app: any) => ({
      ...app,
      interview: (interviewData || []).find(
        (item: any) => item.user_id === app.user_id && item.job_id === app.job_id
      ) ?? null,
    }));

    const combinedCandidates = isAdmin
      ? (() => {
          const appUserJobKeys = new Set(appsData.map((a: any) => `${a.user_id}__${a.job_id}`));
          const interviewOnlyCandidates = (interviewData || [])
            .filter((iv: any) => {
              const key = `${iv.user_id}__${iv.job_id}`;
              return !appUserJobKeys.has(key);
            })
            .map((iv: any) => ({
              id: `iv_${iv.id}`,
              user_id: iv.user_id,
              job_id: iv.job_id,
              status: 'not_applied',
              created_at: iv.created_at,
              profiles: null,
              jobs: null,
              interview: iv,
            }));
          return [...appCandidates, ...interviewOnlyCandidates];
        })()
      : appCandidates;

    const tradeFilteredCandidates = hasTradeRestriction
      ? combinedCandidates.filter((candidate: any) => {
          const trade = candidate.profiles?.trade ?? candidate.interview?.trade ?? '';
          return allowedTradeSet.has(normalizeValue(trade));
        })
      : combinedCandidates;

    setCandidates(tradeFilteredCandidates);
  }, [sessionUser?.id, profile?.role, departmentAccessInfo]);

  async function signOut() { await supabase.auth.signOut(); }

  if (loading) return <div className="center-screen"><p>Loading dashboard...</p></div>;
  if (!sessionUser) return <AuthView />;
  if (profile?.role !== 'admin' && profile?.role !== 'employer') {
    return (
      <div className="center-screen">
        <div className="card auth-card">
          <h1>Admin access required</h1>
          <p className="muted">Your account role is `{profile?.role || 'none'}`. Set it to `admin` or `employer` in Supabase.</p>
          <button className="btn btn-primary" onClick={signOut}>Logout</button>
        </div>
      </div>
    );
  }

  const isAdmin = profile.role === 'admin';

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)' }}>AI SkillFit</h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isAdmin ? (departmentAccessInfo.label || 'Admin Portal') : 'Employer Portal'}
          </p>
        </div>
        <nav style={{ flex: 1 }}>
          <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Users size={18} />} label="Candidates" active={activeTab === 'candidates'} onClick={() => setActiveTab('candidates')} />
          {isAdmin && <NavItem icon={<ShieldAlert size={18} />} label="Flagged Cases" active={activeTab === 'flagged'} onClick={() => setActiveTab('flagged')} badge={interviews.filter(i => i.integrity_flag === true).length} />}
          <NavItem icon={<Briefcase size={18} />} label="Job Management" active={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} />
        </nav>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '0.5rem 1rem', marginBottom: '0.5rem' }}>
            {profile.full_name || profile.email}
          </div>
          <NavItem icon={<LogOut size={18} />} label="Logout" active={false} onClick={signOut} />
        </div>
      </aside>

      <main className="main-content">
        {message && <div className="notice error">{message}<button className="link-btn" style={{ marginLeft: '1rem' }} onClick={() => setMessage('')}>Dismiss</button></div>}
        {activeTab === 'dashboard' && <DashboardView jobs={jobs} candidates={candidates} interviews={interviews} />}
        {activeTab === 'candidates' && (
          <CandidatesView
            candidates={candidates}
            interviews={interviews}
            onRefresh={() => fetchData()}
            setMessage={setMessage}
            departmentLabel={departmentAccessInfo.label}
          />
        )}
        {activeTab === 'flagged' && <FlaggedView interviews={interviews} />}
        {activeTab === 'jobs' && <JobsView jobs={jobs} userId={sessionUser.id} onRefresh={() => fetchData()} setMessage={setMessage} />}
      </main>
    </div>
  );
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function AuthView() {
  const [isSignup, setIsSignup] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    const result = isSignup
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
    setLoading(false);
  }

  return (
    <div className="center-screen">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{isSignup ? 'Create admin account' : 'Admin sign in'}</h1>
        <p className="muted">Profile role must be `admin` or `employer`.</p>
        {error && <div className="notice error">{error}</div>}
        {isSignup && <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name" required />}
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" minLength={8} required />
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Please wait...' : isSignup ? 'Sign up' : 'Sign in'}</button>
        <button className="link-btn" type="button" onClick={() => setIsSignup(!isSignup)}>
          {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
      </form>
    </div>
  );
}

// ── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({ icon, label, active, onClick, badge }: any) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{ background: 'var(--danger)', color: 'white', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Dashboard view ────────────────────────────────────────────────────────────

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function DashboardView({ jobs, candidates, interviews }: { jobs: any[]; candidates: any[]; interviews: Interview[] }) {
  const interviewed = interviews.length;
  const jobReady = interviews.filter(i => i.fitment === 'Job-Ready').length;
  const flagged = interviews.filter(i => i.integrity_flag).length;
  const avgScore = interviewed > 0
    ? (interviews.reduce((s, i) => s + (i.average_score ?? 0), 0) / interviewed).toFixed(1)
    : '—';

  // Fitment distribution for pie chart
  const fitmentData = useMemo(() => {
    const counts: Record<string, number> = {};
    interviews.forEach(i => {
      const f = i.fitment ?? 'Unknown';
      counts[f] = (counts[f] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [interviews]);

  // Category breakdown — always show all 3 categories, even if count is 0
  const categoryData = useMemo(() => {
    const BLUE_COLLAR = new Set([
      'electrician', 'plumber', 'welder', 'carpenter', 'mason', 'painter',
      'hvac technician', 'mechanic / automobile technician', 'mechanic',
      'automobile technician', 'fitter', 'turner',
      'machinist', 'cnc operator', 'lathe operator', 'sheet metal worker',
      'fabricator', 'construction worker', 'construction', 'civil site technician',
      'heavy equipment operator', 'crane operator', 'forklift operator',
      'truck driver', 'driver', 'delivery driver', 'railway technician',
      'solar panel installer', 'wind turbine technician',
      'fire safety technician', 'refrigeration technician', 'boiler operator',
      'mining technician', 'industrial maintenance technician',
    ]);
    const POLYTECHNIC = new Set([
      'diploma mechanical engineer', 'mechanical engineer',
      'diploma civil engineer', 'civil engineer',
      'diploma electrical engineer', 'electrical engineer',
      'diploma electronics engineer', 'electronics engineer',
      'diploma computer science engineer', 'computer science engineer',
      'diploma automobile engineer', 'automobile engineer',
      'diploma mechatronics engineer', 'mechatronics engineer',
      'production supervisor',
      'quality control engineer', 'qc engineer',
      'cad designer', 'autocad technician',
      'network technician', 'embedded systems technician',
      'robotics technician', 'instrumentation technician', 'plant operator',
      'process technician', 'manufacturing technician', 'telecom technician',
      'biomedical equipment technician', 'surveyor', 'lab technician',
      'safety officer', 'junior site engineer', 'maintenance engineer',
      'service engineer', 'electrical design technician', 'tool and die maker',
      'water treatment technician', 'industrial automation technician',
    ]);
    const SEMI_SKILLED = new Set([
      'data entry operator', 'office assistant', 'warehouse assistant',
      'store keeper', 'sales associate', 'retail executive',
      'customer support executive', 'bpo executive', 'delivery executive',
      'packing staff', 'machine helper', 'production line worker',
      'security guard', 'housekeeping staff', 'hospital ward assistant',
      'nursing assistant', 'caregiver', 'receptionist', 'field executive',
      'inventory assistant', 'helper technician', 'loading/unloading staff',
      'food delivery executive', 'kitchen assistant', 'driver assistant',
      'assembly line worker', 'courier staff', 'printing machine assistant',
      'office support staff', 'dispatch assistant',
    ]);

    const counts: Record<string, number> = {
      'Blue-collar Trades': 0,
      'Polytechnic-Skilled Roles': 0,
      'Semi-Skilled Workforce': 0,
    };

    interviews.forEach(i => {
      const trade = (i.trade ?? '').toLowerCase().trim();
      // Always derive from trade name — most reliable source
      if (BLUE_COLLAR.has(trade)) { counts['Blue-collar Trades']++; return; }
      if (POLYTECHNIC.has(trade)) { counts['Polytechnic-Skilled Roles']++; return; }
      if (SEMI_SKILLED.has(trade)) { counts['Semi-Skilled Workforce']++; return; }
      // Fall back to stored category only if trade didn't match
      const stored = i.category;
      if (stored && stored in counts) counts[stored]++;
      // Unknown / unrecognised trades are intentionally excluded from the chart
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [interviews]);

  // Score distribution histogram (buckets: 0-2, 2-4, 4-6, 6-8, 8-10)
  const scoreHistogram = useMemo(() => {
    const buckets = [
      { name: '0–2', count: 0 },
      { name: '2–4', count: 0 },
      { name: '4–6', count: 0 },
      { name: '6–8', count: 0 },
      { name: '8–10', count: 0 },
    ];
    interviews.forEach(i => {
      const s = i.average_score ?? 0;
      if (s < 2) buckets[0].count++;
      else if (s < 4) buckets[1].count++;
      else if (s < 6) buckets[2].count++;
      else if (s < 8) buckets[3].count++;
      else buckets[4].count++;
    });
    return buckets;
  }, [interviews]);

  // Applications over time (last 7 days)
  const trendData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map((name, index) => ({
      name,
      interviews: interviews.filter(i => new Date(i.created_at).getDay() === index).length,
      applications: candidates.filter((c: any) => new Date(c.created_at).getDay() === index).length,
    }));
  }, [interviews, candidates]);

  // Language breakdown
  const languageData = useMemo(() => {
    const counts: Record<string, number> = {};
    interviews.forEach(i => {
      const l = i.language ?? 'Unknown';
      counts[l] = (counts[l] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));
  }, [interviews]);

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Live overview of interviews, candidates, and assessments.</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard title="Total Interviews" value={interviewed} sub="All time" color="var(--primary)" icon={<BarChart2 size={40} />} />
        <StatCard title="Job-Ready" value={jobReady} sub={`${interviewed > 0 ? Math.round((jobReady / interviewed) * 100) : 0}% of interviewed`} color="var(--secondary)" icon={<CheckCircle size={40} />} />
        <StatCard title="Avg Score" value={avgScore} sub="Out of 10" color="var(--accent)" icon={<TrendingUp size={40} />} />
        <StatCard title="Active Jobs" value={jobs.filter(j => j.status === 'open').length} sub="Open positions" color="var(--purple)" icon={<Briefcase size={40} />} />
        <StatCard title="Total Applicants" value={candidates.length} sub="Across all jobs" color="var(--primary)" icon={<Users size={40} />} />
        <StatCard title="Flagged Cases" value={flagged} sub="Needs review" color="var(--danger)" icon={<ShieldAlert size={40} />} />
      </div>

      {/* Charts row 1 */}
      <div className="chart-grid">
        <div className="card">
          <h3>Activity Trends (by day of week)</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="interviews" stroke="var(--primary)" strokeWidth={2.5} dot={false} name="Interviews" />
                <Line type="monotone" dataKey="applications" stroke="var(--secondary)" strokeWidth={2.5} dot={false} name="Applications" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3>Fitment Distribution</h3>
          {fitmentData.length === 0 ? (
            <div className="empty-state"><p>No interview data yet.</p></div>
          ) : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={fitmentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name = '', percent = 0 }) => `${String(name).split(' ')[0]} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {fitmentData.map((entry, i) => (
                      <Cell key={i} fill={FITMENT_COLORS[entry.name] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="chart-grid-3">
        <div className="card">
          <h3>Score Distribution</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreHistogram}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Candidates" radius={[4, 4, 0, 0]}>
                  {scoreHistogram.map((_, i) => (
                    <Cell key={i} fill={['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981'][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3>Category Breakdown</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                <Tooltip />
                <Bar dataKey="value" name="Interviews" fill="var(--purple)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3>Language Breakdown</h3>
          {languageData.length === 0 ? (
            <div className="empty-state"><p>No data yet.</p></div>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={languageData} layout="vertical">
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="value" name="Interviews" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Recent interviews */}
      <div className="card">
        <h3>Recent Interviews</h3>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Trade</th>
                <th>Category</th>
                <th>Score</th>
                <th>Confidence</th>
                <th>Fitment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {interviews.slice(0, 8).map(i => (
                <tr key={i.id} className={i.integrity_flag ? 'flag-row' : ''}>
                  <td style={{ fontWeight: 600 }}>
                    {i.candidate_name || i.full_name || 'Unknown'}
                    {i.integrity_flag && <span title="Flagged" style={{ marginLeft: '0.4rem', color: 'var(--danger)' }}>⚑</span>}
                  </td>
                  <td>{i.trade || '—'}</td>
                  <td><span className={`badge ${CATEGORY_BADGE[i.category ?? ''] ?? 'badge-gray'}`}>{i.category ?? '—'}</span></td>
                  <td>{i.average_score != null ? <ScoreBar score={i.average_score} /> : '—'}</td>
                  <td>{i.confidence_score != null ? `${i.confidence_score.toFixed(0)}%` : '—'}</td>
                  <td>{fitmentBadge(i.fitment)}</td>
                  <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{new Date(i.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {interviews.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>No interviews yet. Run the voice bot to see results here.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, color, icon }: any) {
  return (
    <div className="card stat-card">
      <div className="stat-icon" style={{ color }}>{icon}</div>
      <div className="stat-label">{title}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── Candidates view ───────────────────────────────────────────────────────────

const FITMENT_OPTIONS = ['All', 'Job-Ready', 'Requires Training', 'Low Confidence', 'Requires Significant Upskilling'];
const CATEGORY_OPTIONS = ['All', 'Blue-collar Trades', 'Polytechnic-Skilled Roles', 'Semi-Skilled Workforce'];
const LANGUAGE_OPTIONS = ['All', 'English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Bengali', 'Gujarati', 'Malayalam', 'Punjabi', 'Odia'];

function CandidatesView({ candidates, interviews, onRefresh, setMessage, departmentLabel }: {
  candidates: any[];
  interviews: Interview[];
  onRefresh: () => void;
  setMessage: (m: string) => void;
  departmentLabel?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [filterFitment, setFilterFitment] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterLanguage, setFilterLanguage] = useState('All');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterMinScore, setFilterMinScore] = useState('');
  const [filterMaxScore, setFilterMaxScore] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);

  // Unique districts from interviews
  const districts = useMemo(() => {
    const set = new Set<string>();
    interviews.forEach(i => { if (i.district) set.add(i.district); });
    return Array.from(set).sort();
  }, [interviews]);

  // Merge candidates with their interview data
  const enriched = useMemo(() => {
    return candidates.map(c => ({
      ...c,
      interview: interviews.find(i => i.user_id === c.user_id && i.job_id === c.job_id) ?? c.interview ?? null,
    }));
  }, [candidates, interviews]);

  const filtered = useMemo(() => {
    return enriched.filter(c => {
      const iv: Interview | null = c.interview;
      const name = (c.profiles?.full_name ?? iv?.candidate_name ?? '').toLowerCase();
      const trade = (c.profiles?.trade ?? iv?.trade ?? '').toLowerCase();
      const district = (c.profiles?.district ?? iv?.district ?? '').toLowerCase();

      if (query && !name.includes(query.toLowerCase()) && !trade.includes(query.toLowerCase())) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (filterFitment !== 'All' && iv?.fitment !== filterFitment) return false;
      if (filterCategory !== 'All' && iv?.category !== filterCategory) return false;
      if (filterLanguage !== 'All' && iv?.language !== filterLanguage) return false;
      if (filterDistrict && !district.includes(filterDistrict.toLowerCase())) return false;
      if (filterMinScore && iv?.average_score != null && iv.average_score < parseFloat(filterMinScore)) return false;
      if (filterMaxScore && iv?.average_score != null && iv.average_score > parseFloat(filterMaxScore)) return false;
      return true;
    });
  }, [enriched, query, filterStatus, filterFitment, filterCategory, filterLanguage, filterDistrict, filterMinScore, filterMaxScore]);

  async function updateStatus(candidate: any, status: string) {
    if (candidate.status === 'not_applied') {
      // Fix 1.10: Interview-only candidate — look up the real application id before updating.
      // candidate.id is a synthetic iv_<uuid> string and will match zero rows if used directly.
      if (candidate.user_id && candidate.job_id) {
        const { data: existing } = await supabase
          .from('applications')
          .select('id')
          .eq('user_id', candidate.user_id)
          .eq('job_id', candidate.job_id)
          .maybeSingle();
        if (existing) {
          // Use the real application id returned from Supabase
          const { error } = await supabase.from('applications').update({ status }).eq('id', existing.id);
          if (error) setMessage(error.message);
        } else {
          // No application exists yet — insert one and capture the real id
          const { error } = await supabase
            .from('applications')
            .insert({ user_id: candidate.user_id, job_id: candidate.job_id, status });
          if (error) setMessage(error.message);
        }
      } else {
        setMessage('Cannot update status: candidate has no job application context.');
        return;
      }
    } else {
      // Regular application candidate — candidate.id is the real applications.id UUID
      const { error } = await supabase.from('applications').update({ status }).eq('id', candidate.id);
      if (error) setMessage(error.message);
    }
    await onRefresh();
  }

  return (
    <div>
      <div className="page-header">
        <h2>Candidates</h2>
        <p>Filter, review, and shortlist candidates based on interview results.</p>
      <div>
        <div className="section-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1>Candidates</h1>
            {departmentLabel && <span className="badge badge-info">{departmentLabel}</span>}
          </div>
          <p>Filter, review, and shortlist candidates based on interview results.</p>
          {departmentLabel && (
            <p className="muted" style={{ marginTop: '0.35rem' }}>
              Showing candidates for {departmentLabel}.
            </p>
          )}
        </div>
          <Search size={16} color="var(--muted)" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or trade..." />
        </div>

        <div className="filter-group">
          <label>Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="applied">Applied</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="rejected">Rejected</option>
            <option value="marked_for_training">For Training</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Fitment</label>
          <select value={filterFitment} onChange={e => setFilterFitment(e.target.value)}>
            {FITMENT_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>Category</label>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>Language</label>
          <select value={filterLanguage} onChange={e => setFilterLanguage(e.target.value)}>
            {LANGUAGE_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>District</label>
          <select value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)}>
            <option value="">All</option>
            {districts.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        <div className="filter-group" style={{ minWidth: '90px' }}>
          <label>Min Score</label>
          <input type="number" min="0" max="10" step="0.5" value={filterMinScore} onChange={e => setFilterMinScore(e.target.value)} placeholder="0" />
        </div>

        <div className="filter-group" style={{ minWidth: '90px' }}>
          <label>Max Score</label>
          <input type="number" min="0" max="10" step="0.5" value={filterMaxScore} onChange={e => setFilterMaxScore(e.target.value)} placeholder="10" />
        </div>

        <button className="btn btn-outline btn-sm" onClick={() => {
          setQuery(''); setFilterFitment('All'); setFilterCategory('All');
          setFilterLanguage('All'); setFilterDistrict(''); setFilterMinScore(''); setFilterMaxScore(''); setFilterStatus('all');
        }}>
          <X size={14} /> Clear
        </button>
      </div>

      <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        Showing {filtered.length} of {enriched.length} candidates
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Trade</th>
                <th>Category</th>
                <th>Language</th>
                <th>District</th>
                <th>Score</th>
                <th>Confidence</th>
                <th>Fitment</th>
                <th>App Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const iv: Interview | null = c.interview;
                const name = c.profiles?.full_name ?? iv?.candidate_name ?? 'Unknown';
                const trade = c.profiles?.trade ?? iv?.trade ?? '—';
                const district = c.profiles?.district ?? iv?.district ?? '—';
                const language = iv?.language ?? '—';
                const category = iv?.category ?? '—';
                return (
                  <tr key={c.id} className={iv?.integrity_flag ? 'flag-row' : ''}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {name}
                        {iv?.integrity_flag && <span title="Flagged for review" style={{ marginLeft: '0.4rem', color: 'var(--danger)' }}>⚑</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{c.profiles?.email ?? iv?.phone_number ?? ''}</div>
                    </td>
                    <td>{trade}</td>
                    <td><span className={`badge ${CATEGORY_BADGE[category] ?? 'badge-gray'}`}>{category}</span></td>
                    <td>{language}</td>
                    <td>{district}</td>
                    <td>{iv?.average_score != null ? <ScoreBar score={iv.average_score} /> : <span className="muted">—</span>}</td>
                    <td>{iv?.confidence_score != null ? `${iv.confidence_score.toFixed(0)}%` : '—'}</td>
                    <td>{fitmentBadge(iv?.fitment ?? null)}</td>
                    <td>
                      <span className={`badge ${
                        c.status === 'rejected' ? 'badge-danger' :
                        c.status === 'shortlisted' ? 'badge-success' :
                        c.status === 'marked_for_training' ? 'badge-purple' :
                        c.status === 'applied' ? 'badge-warning' :
                        'badge-gray'
                      }`}>
                        {c.status === 'not_applied' ? 'interviewed' : c.status}
                      </span>
                    </td>
                    <td className="actions-cell">
                      {iv && (
                        <button className="btn btn-outline btn-sm" onClick={() => setSelectedInterview(iv)}>
                          <ChevronRight size={14} /> View
                        </button>
                      )}
                      <button className="success-btn" title="Shortlist" onClick={() => updateStatus(c, 'shortlisted')}><CheckCircle size={16} /></button>
                      <button className="btn btn-sm" style={{ background: 'var(--purple-light)', color: 'var(--purple)', border: 'none' }} onClick={() => updateStatus(c, 'marked_for_training')} title="Mark for training">
                        <Award size={14} />
                      </button>
                      <button className="danger-inline-btn" title="Reject" onClick={() => updateStatus(c, 'rejected')}><XCircle size={16} /></button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2.5rem' }}>No candidates match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedInterview && (
        <CandidateDetailModal interview={selectedInterview} onClose={() => setSelectedInterview(null)} />
      )}
    </div>
  );
}

// ── Candidate detail modal ────────────────────────────────────────────────────

function CandidateDetailModal({ interview, onClose }: { interview: Interview; onClose: () => void }) {
  const scores = interview.scores ?? [];
  const weakTopics = interview.weak_topics ?? [];
  const feedback = interview.feedback;
  const transcript = interview.transcript ?? [];

  // Build per-question topic rows if we have scores
  // scores array is ordered by question index; we don't have topic names here
  // so we label them Q1, Q2, etc.
  const scoreRows = scores.map((s, i) => ({
    label: `Q${i + 1}`,
    score: s,
  }));

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
              {interview.candidate_name ?? interview.full_name ?? 'Candidate'}
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              {interview.trade && <span className="badge badge-info">{interview.trade}</span>}
              {interview.category && <span className={`badge ${CATEGORY_BADGE[interview.category] ?? 'badge-gray'}`}>{interview.category}</span>}
              {interview.language && <span className="badge badge-gray">{interview.language}</span>}
              {interview.district && <span className="badge badge-gray">📍 {interview.district}</span>}
              {interview.integrity_flag && <span className="badge badge-danger">⚑ Flagged</span>}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          {/* Score summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Avg Score</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: scoreColor(interview.average_score ?? 0) }}>
                {interview.average_score?.toFixed(1) ?? '—'}<span style={{ fontSize: '1rem', fontWeight: 400 }}>/10</span>
              </div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Confidence</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary)' }}>
                {interview.confidence_score?.toFixed(0) ?? '—'}<span style={{ fontSize: '1rem', fontWeight: 400 }}>%</span>
              </div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Fitment</div>
              <div style={{ marginTop: '0.4rem' }}>{fitmentBadge(interview.fitment)}</div>
            </div>
          </div>

          {/* Per-question scores */}
          {scoreRows.length > 0 && (
            <>
              <div className="section-title">Per-Question Scores</div>
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <div className="topic-scores">
                  {scoreRows.map(row => (
                    <div key={row.label} className="topic-row">
                      <span className="topic-name">{row.label}</span>
                      <div style={{ flex: 2 }}>
                        <ScoreBar score={row.score} />
                      </div>
                      <span className="topic-score-num" style={{ color: scoreColor(row.score) }}>{row.score}/10</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Weak topics */}
          {weakTopics.length > 0 && (
            <>
              <div className="section-title">Weak Topics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {weakTopics.map(t => (
                  <span key={t} className="badge badge-danger" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>{t}</span>
                ))}
              </div>
            </>
          )}

          {/* Feedback */}
          {feedback && (
            <>
              <div className="section-title">Feedback</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--secondary)', marginBottom: '0.5rem' }}>✓ Strengths</div>
                  <div className="feedback-list">
                    {(feedback.strengths ?? []).map((s, i) => (
                      <div key={i} className="feedback-item strength">
                        <CheckCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '0.5rem' }}>↑ Areas to Improve</div>
                  <div className="feedback-list">
                    {(feedback.improvements ?? []).map((s, i) => (
                      <div key={i} className="feedback-item improvement">
                        <TrendingUp size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Integrity warning */}
          {interview.integrity_flag && (
            <div className="notice warning" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} />
              <strong>Integrity Flag:</strong> This interview was automatically flagged for suspicious patterns (e.g. identical scores, extreme variance, or suspiciously perfect results). Manual review recommended.
            </div>
          )}

          {/* Transcript */}
          {transcript.length > 0 && (
            <>
              <div className="section-title">Interview Transcript</div>
              <div className="card" style={{ maxHeight: '280px', overflowY: 'auto', padding: '1rem' }}>
                {transcript.map((msg, i) => (
                  <div key={i} style={{
                    marginBottom: '0.75rem',
                    display: 'flex',
                    flexDirection: msg.role === 'assistant' ? 'row' : 'row-reverse',
                    gap: '0.5rem',
                    alignItems: 'flex-start',
                  }}>
                    <div style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: msg.role === 'assistant' ? 'var(--primary)' : 'var(--secondary)',
                      minWidth: '50px',
                      textAlign: msg.role === 'assistant' ? 'left' : 'right',
                      paddingTop: '0.2rem',
                    }}>
                      {msg.role === 'assistant' ? 'Priya' : 'Candidate'}
                    </div>
                    <div style={{
                      background: msg.role === 'assistant' ? 'var(--primary-light)' : 'var(--secondary-light)',
                      borderRadius: '10px',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.85rem',
                      maxWidth: '80%',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Work Portfolio — visible to admins (Requirement 7.1) */}
          {interview.user_id && (
            <AdminPortfolioViewer candidateUserId={interview.user_id} />
          )}

          <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Interview date: {new Date(interview.created_at).toLocaleString()}
            {interview.phone_number && ` · Phone: ${interview.phone_number}`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Flagged cases view ────────────────────────────────────────────────────────

function FlaggedView({ interviews }: { interviews: Interview[] }) {
  const flagged = interviews.filter(i => i.integrity_flag === true);
  const [selected, setSelected] = useState<Interview | null>(null);

  return (
    <div>
      <div className="page-header">
        <h2>Flagged Cases</h2>
        <p>Interviews automatically flagged for suspicious patterns. Review before shortlisting.</p>
      </div>

      {flagged.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ShieldAlert size={48} />
            <p>No flagged interviews. All clear.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Trade</th>
                  <th>Score</th>
                  <th>Confidence</th>
                  <th>Fitment</th>
                  <th>Reason</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map(i => {
                  const scores = i.scores ?? [];
                  let reason = 'Suspicious pattern detected';
                  if (scores.length > 0 && new Set(scores).size === 1) reason = 'All scores identical';
                  else if ((i.average_score ?? 0) >= 9.5) reason = 'Suspiciously perfect score';
                  else {
                    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
                    const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
                    if (std > 3.5) reason = 'Extreme score variance';
                  }
                  return (
                    <tr key={i.id} className="flag-row">
                      <td style={{ fontWeight: 600 }}>{i.candidate_name ?? i.full_name ?? 'Unknown'}</td>
                      <td>{i.trade ?? '—'}</td>
                      <td>{i.average_score != null ? <ScoreBar score={i.average_score} /> : '—'}</td>
                      <td>{i.confidence_score != null ? `${i.confidence_score.toFixed(0)}%` : '—'}</td>
                      <td>{fitmentBadge(i.fitment)}</td>
                      <td><span className="badge badge-danger">{reason}</span></td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{new Date(i.created_at).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => setSelected(i)}>
                          <ChevronRight size={14} /> Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <CandidateDetailModal interview={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Jobs view ─────────────────────────────────────────────────────────────────

function JobsView({ jobs, userId, onRefresh, setMessage }: any) {
  const [form, setForm] = useState<JobForm>(emptyJobForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  function openCreate() { setForm(emptyJobForm); setShowForm(true); }
  function openEdit(job: any) {
    setForm({
      id: job.id, title: job.title || '', description: job.description || '',
      trade: job.trade || '', experience_required: job.experience_required || '',
      location: job.location || '', skills_required: (job.skills_required || []).join(', '),
      openings: String(job.openings || 1), company_name: job.companies?.company_name || '',
      company_description: job.companies?.description || '',
    });
    setShowForm(true);
  }

  async function saveJob(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('');
    try {
      let companyId = jobs.find((j: any) => j.companies?.company_name === form.company_name)?.company_id;
      if (!companyId) {
        const { data: company, error: companyError } = await supabase
          .from('companies').insert({ company_name: form.company_name, description: form.company_description, created_by: userId })
          .select('id').single();
        if (companyError) throw companyError;
        companyId = company.id;
      }
      const payload = {
        company_id: companyId, title: form.title, description: form.description,
        trade: form.trade, experience_required: form.experience_required, location: form.location,
        skills_required: form.skills_required.split(',').map(s => s.trim()).filter(Boolean),
        openings: Number(form.openings || 1), created_by: userId, status: 'open',
      };
      const result = form.id
        ? await supabase.from('jobs').update(payload).eq('id', form.id)
        : await supabase.from('jobs').insert(payload);
      if (result.error) throw result.error;
      setShowForm(false);
      await onRefresh();
    } catch (err: any) {
      setMessage(err.message || 'Failed to save job.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(job: any) {
    const { error } = await supabase.from('jobs').update({ status: job.status === 'open' ? 'closed' : 'open' }).eq('id', job.id);
    if (error) setMessage(error.message);
    await onRefresh();
  }

  async function deleteJob(jobId: string) {
    if (!confirm('Delete this job and all its applications?')) return;
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) setMessage(error.message);
    await onRefresh();
  }

  return (
    <div>
      <div className="page-row">
        <h2>Job Management</h2>
        <button className="btn btn-primary icon-btn" onClick={openCreate}><Plus size={18} /> Post New Job</button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={saveJob}>
          <h3>{form.id ? 'Edit Job' : 'Post New Job'}</h3>
          <div className="form-grid">
            <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} placeholder="Company name" required />
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Job title" required />
            <input value={form.trade} onChange={e => setForm({ ...form, trade: e.target.value })} placeholder="Trade (e.g. Electrician)" required />
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Location / District" required />
            <input value={form.experience_required} onChange={e => setForm({ ...form, experience_required: e.target.value })} placeholder="Experience required" />
            <input value={form.openings} onChange={e => setForm({ ...form, openings: e.target.value })} placeholder="Openings" type="number" min="1" />
          </div>
          <textarea value={form.company_description} onChange={e => setForm({ ...form, company_description: e.target.value })} placeholder="Company description" />
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Job description" required />
          <input value={form.skills_required} onChange={e => setForm({ ...form, skills_required: e.target.value })} placeholder="Skills required, comma separated" />
          <div className="form-actions">
            <button className="btn" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Job'}</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Job Title</th><th>Company</th><th>Trade</th><th>Location</th>
                <th>Applicants</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: any) => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 600 }}>{job.title}</td>
                  <td>{job.companies?.company_name || '—'}</td>
                  <td>{job.trade}</td>
                  <td>{job.location}</td>
                  <td>{job.applications?.[0]?.count || 0}</td>
                  <td><span className={`badge ${job.status === 'open' ? 'badge-success' : 'badge-danger'}`}>{job.status}</span></td>
                  <td className="actions-cell">
                    <button className="link-btn" onClick={() => openEdit(job)}>Edit</button>
                    <button className="link-btn" onClick={() => toggleStatus(job)}>{job.status === 'open' ? 'Close' : 'Open'}</button>
                    <button className="danger-btn" onClick={() => deleteJob(job.id)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>No jobs posted yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
