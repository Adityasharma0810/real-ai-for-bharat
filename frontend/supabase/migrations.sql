-- 1. Update profiles table to include role
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'candidate' CHECK (role IN ('candidate', 'employer', 'admin'));

-- 2. Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  trade TEXT NOT NULL,
  experience_required TEXT,
  location TEXT, -- District
  skills_required TEXT[],
  openings INTEGER DEFAULT 1,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 4. Create applications table
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'applied' CHECK (status IN ('applied', 'shortlisted', 'rejected', 'marked_for_training')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, job_id) -- Prevent duplicate applications
);

-- 5. Create interviews table (linked to jobs)
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  score INTEGER,
  classification TEXT, -- Job-Ready, Training Required, etc.
  confidence_score INTEGER,
  integrity_flag BOOLEAN DEFAULT FALSE,
  transcript JSONB, -- Optional: store the full conversation
  feedback JSONB, -- Strengths/Improvements
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security) - Basic Setup
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- Simple Policies (Expand as needed)
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Companies are viewable by everyone." ON companies FOR SELECT USING (true);
CREATE POLICY "Users can create their own company." ON companies FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own company." ON companies FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Jobs are viewable by everyone." ON jobs FOR SELECT USING (true);
CREATE POLICY "Employers can manage their jobs." ON jobs FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('employer', 'admin')
  )
);

CREATE POLICY "Candidates can view their applications." ON applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Candidates can apply to jobs." ON applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Employers can view applications for their jobs." ON applications FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM jobs 
    JOIN companies ON jobs.company_id = companies.id
    WHERE jobs.id = applications.job_id 
    AND companies.created_by = auth.uid()
  )
);

-- Insert some mock data
DO $$
DECLARE
    comp_id UUID;
BEGIN
    -- Create a mock company if not exists
    INSERT INTO companies (company_name, description)
    VALUES ('Bharat Tech Solutions', 'Leading industrial technology provider')
    RETURNING id INTO comp_id;

    -- Create mock jobs
    INSERT INTO jobs (company_id, title, description, trade, experience_required, location, skills_required, openings)
    VALUES 
    (comp_id, 'Electrician', 'Maintain industrial machinery and wiring.', 'Electrician', '2-3 Years', 'Mumbai', ARRAY['Wiring', 'Troubleshooting'], 5),
    (comp_id, 'Heavy Vehicle Driver', 'Drive logistics trucks across states.', 'Driver', '5+ Years', 'Pune', ARRAY['Navigation', 'Safety'], 10);
END $$;

-- 6. Create blocked_candidates table
CREATE TABLE IF NOT EXISTS blocked_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

ALTER TABLE blocked_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employers can manage blocked candidates." ON blocked_candidates FOR ALL USING (
  EXISTS (
    SELECT 1 FROM companies 
    WHERE companies.id = blocked_candidates.company_id 
    AND companies.created_by = auth.uid()
  )
);

CREATE POLICY "Candidates can see if they are blocked (for filtering)." ON blocked_candidates FOR SELECT USING (auth.uid() = user_id);
