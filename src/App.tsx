import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Setup from "./pages/Setup.tsx";
import Interview from "./pages/Interview.tsx";
import Report from "./pages/Report.tsx";
import Screen from "./pages/Screen.tsx";
import NotFound from "./pages/NotFound.tsx";
import Profile from "./pages/Profile.tsx";
import CandidateDashboard from "./pages/candidate/CandidateDashboard.tsx";
import MyHistory from "./pages/candidate/MyHistory.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import ManageRoles from "./pages/admin/ManageRoles.tsx";
import ScreeningHistory from "./pages/admin/ScreeningHistory.tsx";
import AdminCandidates from "./pages/admin/AdminCandidates.tsx";
import AdminReports from "./pages/admin/AdminReports.tsx";
import ComingSoon from "./pages/admin/ComingSoon.tsx";
import { RoleGuard } from "./components/RoleGuard.tsx";
import { RoleLayout } from "./components/RoleLayout.tsx";

const queryClient = new QueryClient();

// Wraps a page with role-based layout (sidebar for admin/recruiter, topnav for candidate)
const L = ({ children }: { children: React.ReactNode }) => <RoleLayout>{children}</RoleLayout>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />

          {/* Candidate (any signed-in user) */}
          <Route path="/dashboard" element={<RoleGuard allow={["any"]}><L><CandidateDashboard /></L></RoleGuard>} />
          <Route path="/history" element={<RoleGuard allow={["any"]}><L><MyHistory /></L></RoleGuard>} />
          <Route path="/profile" element={<RoleGuard allow={["any"]}><L><Profile /></L></RoleGuard>} />
          <Route path="/setup" element={<RoleGuard allow={["any"]}><Setup /></RoleGuard>} />
          <Route path="/interview/:id" element={<RoleGuard allow={["any"]}><Interview /></RoleGuard>} />
          <Route path="/report/:id" element={<RoleGuard allow={["any"]}><Report /></RoleGuard>} />

          {/* Recruiter + Admin */}
          <Route path="/screen" element={<RoleGuard allow={["recruiter", "admin"]}><L><Screen /></L></RoleGuard>} />
          <Route path="/recruiter/invites" element={<RoleGuard allow={["recruiter", "admin"]}><L><ComingSoon title="Interview Invites" description="Manage outbound interview invites from one place." /></L></RoleGuard>} />

          {/* Admin-only */}
          <Route path="/admin" element={<RoleGuard allow={["admin"]}><L><AdminDashboard /></L></RoleGuard>} />
          <Route path="/admin/candidates" element={<RoleGuard allow={["admin", "recruiter"]}><L><AdminCandidates /></L></RoleGuard>} />
          <Route path="/admin/reports" element={<RoleGuard allow={["admin", "recruiter"]}><L><AdminReports /></L></RoleGuard>} />
          <Route path="/admin/screening-history" element={<RoleGuard allow={["admin", "recruiter"]}><L><ScreeningHistory /></L></RoleGuard>} />
          <Route path="/admin/roles" element={<RoleGuard allow={["admin"]}><L><ManageRoles /></L></RoleGuard>} />
          <Route path="/admin/compare" element={<RoleGuard allow={["admin"]}><L><ComingSoon title="Compare Candidates" description="Side-by-side comparison of candidate reports." /></L></RoleGuard>} />
          <Route path="/admin/statistics" element={<RoleGuard allow={["admin"]}><L><ComingSoon title="Interview Statistics" description="Charts and aggregated analytics across interviews." /></L></RoleGuard>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
