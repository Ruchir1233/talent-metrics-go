import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  UserSquare2,
  FolderOpen,
  Briefcase,
  BarChart3,
  Target,
  Users,
  Sparkles,
  CheckSquare,
} from "lucide-react";

const workspaceItems = [
  { title: "Dashboard",          url: "/",                  icon: LayoutDashboard },
  { title: "Daily reporting",    url: "/daily-reporting",   icon: ClipboardList },
  { title: "Candidate pipeline", url: "/candidate-pipeline",icon: UserSquare2 },
  { title: "Positions",          url: "/positions",         icon: FolderOpen },
  { title: "Position summary",   url: "/position-summary",  icon: Briefcase },
  { title: "Team summary",       url: "/team-summary",      icon: BarChart3 },
  { title: "Todo & Reminders",  url: "/todos",             icon: CheckSquare },
];

const settingsItems = [
  { title: "Targets & setup", url: "/targets-setup", icon: Target },
  { title: "Employees",      url: "/employees",    icon: Users },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="w-[240px] shrink-0 flex flex-col h-screen bg-[#f0f2ff] border-r border-[#e2e5f0]">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-7">
        <div className="w-12 h-12 rounded-xl bg-[#6366f1] flex items-center justify-center shadow-sm">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div>
          <div className="text-[16px] font-bold text-[#111827] leading-tight">Kaapro</div>
          <div className="text-[13px] text-[#6b7280]">Recruitment</div>
        </div>
      </div>

      {/* Workspace section */}
      <div className="px-4 mb-1">
        <div className="text-[12px] font-medium text-[#9ca3af] px-2 mb-2 tracking-wide">Workspace</div>
        <nav className="flex flex-col gap-0.5">
          {workspaceItems.map((item) => {
            const active = pathname === item.url;
            return (
              <Link
                key={item.url}
                to={item.url}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all ${
                  active
                    ? "bg-[#e0e3ff] text-[#4f46e5] font-semibold"
                    : "text-[#374151] hover:bg-[#e8eaff] hover:text-[#4f46e5]"
                }`}
              >
                <item.icon className={`h-[20px] w-[20px] shrink-0 ${active ? "text-[#4f46e5]" : "text-[#6b7280]"}`} />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Settings section */}
      <div className="px-4 mt-6">
        <div className="text-[12px] font-medium text-[#9ca3af] px-2 mb-2 tracking-wide">Settings</div>
        <nav className="flex flex-col gap-0.5">
          {settingsItems.map((item) => {
            const active = pathname === item.url;
            return (
              <Link
                key={item.url}
                to={item.url}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all ${
                  active
                    ? "bg-[#e0e3ff] text-[#4f46e5] font-semibold"
                    : "text-[#374151] hover:bg-[#e8eaff] hover:text-[#4f46e5]"
                }`}
              >
                <item.icon className={`h-[20px] w-[20px] shrink-0 ${active ? "text-[#4f46e5]" : "text-[#6b7280]"}`} />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
