import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Briefcase, User } from "lucide-react";
import type { AppRole } from "@/hooks/use-role";
import { cn } from "@/lib/utils";

type Role = AppRole | "candidate";

export const resolveRole = (roles: AppRole[]): Role => {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("recruiter")) return "recruiter";
  return "candidate";
};

const META: Record<Role, { label: string; icon: typeof User; classes: string }> = {
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    classes: "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20",
  },
  recruiter: {
    label: "Recruiter",
    icon: Briefcase,
    classes: "bg-accent text-accent-foreground border-border hover:bg-accent/80",
  },
  candidate: {
    label: "Candidate",
    icon: User,
    classes: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
  },
  user: {
    label: "Candidate",
    icon: User,
    classes: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
  },
};

interface RoleBadgeProps {
  role: Role;
  className?: string;
  showIcon?: boolean;
}

export const RoleBadge = ({ role, className, showIcon = true }: RoleBadgeProps) => {
  const meta = META[role];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", meta.classes, className)}>
      {showIcon && <Icon className="h-3 w-3" />}
      {meta.label}
    </Badge>
  );
};
