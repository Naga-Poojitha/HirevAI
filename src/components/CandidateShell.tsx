import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { ProfileMenu } from "./ProfileMenu";
import { RoleBadge } from "./RoleBadge";
import { NavLink } from "@/components/NavLink";

const links = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/setup", label: "Start Interview" },
  { to: "/history", label: "My History" },
];

export const CandidateShell = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background grain">
      <header className="sticky top-0 z-50 w-full">
        <div className="absolute inset-0 backdrop-blur-xl bg-background/60 border-b border-border/60" />
        <div className="container relative flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden md:flex items-center gap-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className="px-3 py-1.5 text-sm text-muted-foreground rounded-md hover:text-foreground hover:bg-accent transition-colors"
                  activeClassName="text-foreground bg-accent"
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <RoleBadge role="candidate" className="hidden sm:inline-flex" />
            <ProfileMenu />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
};
