
CREATE TABLE public.symptoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  symptoms TEXT[] NOT NULL DEFAULT '{}',
  triggers TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.symptoms TO authenticated;
GRANT ALL ON public.symptoms TO service_role;

ALTER TABLE public.symptoms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own symptoms" ON public.symptoms
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own symptoms" ON public.symptoms
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own symptoms" ON public.symptoms
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own symptoms" ON public.symptoms
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX symptoms_user_logged_idx ON public.symptoms(user_id, logged_at DESC);

CREATE OR REPLACE FUNCTION public.tg_symptoms_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER symptoms_updated_at
  BEFORE UPDATE ON public.symptoms
  FOR EACH ROW EXECUTE FUNCTION public.tg_symptoms_updated_at();
