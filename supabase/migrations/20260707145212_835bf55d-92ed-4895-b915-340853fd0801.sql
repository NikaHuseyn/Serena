
CREATE TABLE public.oracle_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oracle_conversations TO authenticated;
GRANT ALL ON public.oracle_conversations TO service_role;

ALTER TABLE public.oracle_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own oracle conversations"
  ON public.oracle_conversations
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.oracle_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.oracle_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  outfit_options jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oracle_messages_conversation_id_idx ON public.oracle_messages(conversation_id, created_at);
CREATE INDEX oracle_conversations_user_id_idx ON public.oracle_conversations(user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oracle_messages TO authenticated;
GRANT ALL ON public.oracle_messages TO service_role;

ALTER TABLE public.oracle_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage messages in own conversations"
  ON public.oracle_messages
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.oracle_conversations c
    WHERE c.id = oracle_messages.conversation_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.oracle_conversations c
    WHERE c.id = oracle_messages.conversation_id AND c.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_oracle_conversations_updated_at
  BEFORE UPDATE ON public.oracle_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
