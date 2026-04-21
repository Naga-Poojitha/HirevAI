import { useRole } from "@/hooks/use-role";
import { AppShell } from "./AppShell";
import { CandidateShell } from "./CandidateShell";
import { Loader2 } from "lucide-react";

export const RoleLayout = ({ children }: { children: React.ReactNode }) => {
  const { loading, isAdmin, isRecruiter } = useRole();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAdmin || isRecruiter) return <AppShell>{children}</AppShell>;
  return <CandidateShell>{children}</CandidateShell>;
};
