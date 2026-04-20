-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'recruiter', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Screening jobs
CREATE TABLE public.screening_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  job_description text NOT NULL,
  top_x integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.screening_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters view own jobs" ON public.screening_jobs
  FOR SELECT USING (auth.uid() = user_id AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Recruiters insert own jobs" ON public.screening_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Recruiters update own jobs" ON public.screening_jobs
  FOR UPDATE USING (auth.uid() = user_id AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Recruiters delete own jobs" ON public.screening_jobs
  FOR DELETE USING (auth.uid() = user_id AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin')));

-- Candidates
CREATE TABLE public.screening_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.screening_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  candidate_name text,
  candidate_email text,
  resume_path text NOT NULL,
  resume_text text,
  parse_status text NOT NULL DEFAULT 'pending',
  score numeric,
  rank integer,
  reasons jsonb,
  strengths jsonb,
  gaps jsonb,
  shortlisted boolean NOT NULL DEFAULT false,
  interview_id uuid,
  invite_status text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.screening_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters view own candidates" ON public.screening_candidates
  FOR SELECT USING (auth.uid() = user_id AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Recruiters insert own candidates" ON public.screening_candidates
  FOR INSERT WITH CHECK (auth.uid() = user_id AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Recruiters update own candidates" ON public.screening_candidates
  FOR UPDATE USING (auth.uid() = user_id AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Recruiters delete own candidates" ON public.screening_candidates
  FOR DELETE USING (auth.uid() = user_id AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin')));

-- Triggers for updated_at
CREATE TRIGGER trg_screening_jobs_updated BEFORE UPDATE ON public.screening_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_screening_candidates_updated BEFORE UPDATE ON public.screening_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow interviews to link back to a screening candidate
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS screening_candidate_id uuid;

-- Storage bucket for screening resumes (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('screening-resumes', 'screening-resumes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Recruiters read own screening resumes" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'screening-resumes'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin'))
  );
CREATE POLICY "Recruiters upload own screening resumes" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'screening-resumes'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin'))
  );
CREATE POLICY "Recruiters delete own screening resumes" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'screening-resumes'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (public.has_role(auth.uid(),'recruiter') OR public.has_role(auth.uid(),'admin'))
  );