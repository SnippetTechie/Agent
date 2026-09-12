-- ===========================================================================
-- V.A.R.M.A — Supabase Database & Storage Setup
-- Run this script in your Supabase Dashboard: SQL Editor -> New query -> Run
-- ===========================================================================

-- 1. Tasks Table: stores high-level browser tasks and status
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_email TEXT,
    task TEXT NOT NULL,
    mode TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed', 'stopped'
    total_steps INT DEFAULT 0,
    total_latency_ms FLOAT DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Task Steps Table: granular audit log of every browser action
CREATE TABLE IF NOT EXISTS public.task_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    step_number INT NOT NULL,
    action_type TEXT,
    action_payload JSONB DEFAULT '{}'::jsonb,
    thought TEXT,
    screenshot_url TEXT,
    latency_ms FLOAT DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for fast dashboard querying
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON public.task_steps(task_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;

-- Allow service_role (backend server) full access
DROP POLICY IF EXISTS "Service role has full access to tasks" ON public.tasks;
CREATE POLICY "Service role has full access to tasks"
    ON public.tasks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role has full access to task_steps" ON public.task_steps;
CREATE POLICY "Service role has full access to task_steps"
    ON public.task_steps
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow anon / client full access for local agent dev
DROP POLICY IF EXISTS "Anon has access to tasks" ON public.tasks;
CREATE POLICY "Anon has access to tasks"
    ON public.tasks
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anon has access to task_steps" ON public.task_steps;
CREATE POLICY "Anon has access to task_steps"
    ON public.task_steps
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to view only their own tasks
DROP POLICY IF EXISTS "Users can view own tasks" ON public.tasks;
CREATE POLICY "Users can view own tasks"
    ON public.tasks
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own task steps" ON public.task_steps;
CREATE POLICY "Users can view own task steps"
    ON public.task_steps
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks
            WHERE public.tasks.id = public.task_steps.task_id
            AND public.tasks.user_id = auth.uid()
        )
    );

-- 5. Storage Bucket for Redacted Screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('redacted-screens', 'redacted-screens', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow anyone to view public screenshots
DROP POLICY IF EXISTS "Public view for redacted screenshots" ON storage.objects;
CREATE POLICY "Public view for redacted screenshots"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'redacted-screens');

-- Allow service_role to upload screenshots
DROP POLICY IF EXISTS "Service role upload for redacted screenshots" ON storage.objects;
CREATE POLICY "Service role upload for redacted screenshots"
    ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'redacted-screens')
    WITH CHECK (bucket_id = 'redacted-screens');

DROP POLICY IF EXISTS "Anon upload for redacted screenshots" ON storage.objects;
CREATE POLICY "Anon upload for redacted screenshots"
    ON storage.objects
    FOR ALL
    TO anon
    USING (bucket_id = 'redacted-screens')
    WITH CHECK (bucket_id = 'redacted-screens');
