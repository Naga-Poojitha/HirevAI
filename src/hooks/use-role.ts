import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "recruiter" | "user";

export const useRole = () => {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let lastUserId: string | null = null;

    const fetchRoles = async (userId: string) => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (!active) return;
      setRoles((data ?? []).map((r) => r.role as AppRole));
      setLoading(false);
    };

    // Initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (!session) { setRoles([]); setLoading(false); return; }
      lastUserId = session.user.id;
      fetchRoles(session.user.id);
    });

    // IMPORTANT: never call other supabase methods synchronously inside
    // onAuthStateChange — it holds the auth lock and will deadlock subsequent
    // calls (e.g. table inserts hang forever). Defer with setTimeout, and only
    // refetch when the user identity actually changes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      if (uid === lastUserId) return;
      lastUserId = uid;
      setTimeout(() => {
        if (!active) return;
        if (!uid) { setRoles([]); setLoading(false); return; }
        fetchRoles(uid);
      }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return {
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isRecruiter: roles.includes("recruiter") || roles.includes("admin"),
  };
};
