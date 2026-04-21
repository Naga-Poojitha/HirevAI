import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole, type AppRole } from "@/hooks/use-role";
import { Loader2 } from "lucide-react";

interface RoleGuardProps {
  allow: Array<AppRole | "any">; // "any" = any signed-in user
  children: React.ReactNode;
}

export const RoleGuard = ({ allow, children }: RoleGuardProps) => {
  const { roles, loading } = useRole();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthed(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setAuthed(!!session));
    return () => subscription.unsubscribe();
  }, []);

  if (loading || authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  if (allow.includes("any")) return <>{children}</>;

  const hasAny = allow.some((r) => r !== "any" && roles.includes(r));
  if (!hasAny) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};
