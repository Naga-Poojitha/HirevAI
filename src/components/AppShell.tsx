import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { Logo } from "./Logo";
import { ProfileMenu } from "./ProfileMenu";
import { RoleBadge, resolveRole } from "./RoleBadge";
import { useRole } from "@/hooks/use-role";
import {
  LayoutDashboard,
  Users,
  FileText,
  GitCompare,
  Layers,
  BarChart3,
  ShieldCheck,
  History,
  User,
  Mail,
  Home,
} from "lucide-react";

type NavItem = { title: string; url: string; icon: typeof Home; end?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const adminGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
      { title: "Candidates", url: "/admin/candidates", icon: Users },
      { title: "Reports", url: "/admin/reports", icon: FileText },
    ],
  },
  {
    label: "Hiring",
    items: [
      { title: "Bulk Screening", url: "/screen", icon: Layers },
      { title: "Screening History", url: "/admin/screening-history", icon: History },
      { title: "Compare Candidates", url: "/admin/compare", icon: GitCompare },
      { title: "Interview Statistics", url: "/admin/statistics", icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Manage Roles", url: "/admin/roles", icon: ShieldCheck },
      { title: "Profile", url: "/profile", icon: User },
    ],
  },
];

const recruiterGroups: NavGroup[] = [
  {
    label: "Hiring",
    items: [
      { title: "Candidates", url: "/admin/candidates", icon: Users },
      { title: "Reports", url: "/admin/reports", icon: FileText },
      { title: "Bulk Screening", url: "/screen", icon: Layers },
      { title: "Interview Invites", url: "/recruiter/invites", icon: Mail },
      { title: "Screening History", url: "/admin/screening-history", icon: History },
    ],
  },
  {
    label: "Account",
    items: [{ title: "Profile", url: "/profile", icon: User }],
  },
];

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { roles } = useRole();
  const role = resolveRole(roles);
  const groups = role === "admin" ? adminGroups : recruiterGroups;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background grain">
        <Sidebar collapsible="icon" className="border-r border-border/60">
          <SidebarHeader className="border-b border-border/60 py-4">
            <Logo />
          </SidebarHeader>
          <SidebarContent>
            {groups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild tooltip={item.title}>
                          <NavLink
                            to={item.url}
                            end={item.end}
                            className="flex items-center gap-2"
                            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter className="border-t border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <RoleBadge role={role} />
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border/60 backdrop-blur-xl bg-background/60 px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <RoleBadge role={role} className="hidden sm:inline-flex" />
            </div>
            <ProfileMenu />
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};
