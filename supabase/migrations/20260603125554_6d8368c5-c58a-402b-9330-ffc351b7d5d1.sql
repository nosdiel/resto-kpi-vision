
-- 1. Admin read policy on profiles
CREATE POLICY "profiles admin read"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- 2. Restrict audit_log inserts: drop permissive auth insert, keep server-side only
DROP POLICY IF EXISTS "audit: any auth insert" ON public.audit_log;

-- 3. Revoke EXECUTE on is_super_admin from anon/public (keep authenticated + service_role for RLS use)
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
