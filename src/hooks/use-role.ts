import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "recruiter" | "user";

export const useRole = () => {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (active) { setRoles([]); setLoading(false); } return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
      if (active) {
        setRoles((data ?? []).map((r) => r.role as AppRole));
        setLoading(false);
      }
    };
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => load());
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return {
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isRecruiter: roles.includes("recruiter") || roles.includes("admin"),
  };
};
