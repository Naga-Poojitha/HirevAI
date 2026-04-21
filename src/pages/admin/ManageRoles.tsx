import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, ShieldCheck, Briefcase, User as UserIcon, Plus, X } from "lucide-react";

type AppRole = "admin" | "recruiter" | "user";
const ALL_ROLES: AppRole[] = ["admin", "recruiter", "user"];

type FoundUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  roles: AppRole[];
};

const ManageRoles = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<FoundUser | null>(null);

  const lookup = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setUser(null);
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_id, email, full_name")
      .ilike("email", email.trim())
      .maybeSingle();

    if (error || !profile) {
      toast.error("No user found with that email");
      setLoading(false);
      return;
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.user_id);

    setUser({
      user_id: profile.user_id,
      email: profile.email,
      full_name: profile.full_name,
      roles: (roleRows ?? []).map((r) => r.role as AppRole),
    });
    setLoading(false);
  };

  const toggleRole = async (role: AppRole) => {
    if (!user) return;
    const has = user.roles.includes(role);
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", user.user_id).eq("role", role);
      if (error) return toast.error(error.message);
      setUser({ ...user, roles: user.roles.filter((r) => r !== role) });
      toast.success(`Removed ${role} role`);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: user.user_id, role });
      if (error) return toast.error(error.message);
      setUser({ ...user, roles: [...user.roles, role] });
      toast.success(`Granted ${role} role`);
    }
  };

  const icon = (r: AppRole) => (r === "admin" ? ShieldCheck : r === "recruiter" ? Briefcase : UserIcon);

  return (
    <div className="container py-8 max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Manage Roles</h1>
        <p className="text-sm text-muted-foreground mt-1">Look up a user by email and assign admin, recruiter, or user roles.</p>
      </div>

      <Card className="p-6 glass">
        <Label htmlFor="email" className="text-sm">User email</Label>
        <div className="flex gap-2 mt-2">
          <Input
            id="email"
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
          <Button onClick={lookup} disabled={loading}>
            <Search className="h-4 w-4" />
            {loading ? "Searching…" : "Find user"}
          </Button>
        </div>
      </Card>

      {user && (
        <Card className="p-6 glass space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{user.full_name || "Unnamed user"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{user.user_id}</p>
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
              {user.roles.length === 0 && <Badge variant="secondary">No roles</Badge>}
              {user.roles.map((r) => <Badge key={r} className="capitalize">{r}</Badge>)}
            </div>
          </div>

          <div className="pt-4 border-t border-border/60">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Toggle roles</p>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map((r) => {
                const Icon = icon(r);
                const has = user.roles.includes(r);
                return (
                  <Button
                    key={r}
                    variant={has ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleRole(r)}
                    className="capitalize"
                  >
                    {has ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    <Icon className="h-3 w-3" />
                    {r}
                  </Button>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ManageRoles;
