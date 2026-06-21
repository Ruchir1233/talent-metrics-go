import { Link, useRouterState } from "@tanstack/react-router";

const workspaceItems = [
  { title: "Dashboard",          url: "/",                  emoji: "📊" },
  { title: "Daily reporting",    url: "/daily-reporting",   emoji: "📈" },
  { title: "Candidate pipeline", url: "/candidate-pipeline",emoji: "👥" },
  { title: "Positions",          url: "/positions",         emoji: "💼" },
  { title: "Position summary",   url: "/position-summary",  emoji: "📋" },
  { title: "Team summary",       url: "/team-summary",      emoji: "👨‍💼" },
  { title: "Todo & Reminders",   url: "/todos",             emoji: "✅" },
];

const settingsItems = [
  { title: "Targets & setup", url: "/targets-setup", emoji: "⚙️" },
  { title: "Employees",       url: "/recruiters",    emoji: "👤" },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="w-[240px] shrink-0 flex flex-col h-screen bg-white border-r border-[#e5e7eb]">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-7">
        <div className="w-12 h-12 rounded-xl bg-[#6366f1] flex items-center justify-center shadow-sm">
          <span className="text-white text-xl font-bold">K</span>
        </div>
        <div>
          <div className="text-[17px] font-bold text-[#111827] leading-tight">Kaapro</div>
          <div className="text-[13px] text-[#6b7280]">Recruitment</div>
        </div>
      </div>

      {/* Workspace section */}
      <div className="px-3 mb-2">
        <div className="text-[11px] font-semibold text-[#9ca3af] px-3 mb-2 tracking-widest uppercase">Workspace</div>
        <nav className="flex flex-col gap-0.5">
          {workspaceItems.map((item) => {
            const active = pathname === item.url;
            return (
              <Link
                key={item.url}
                to={item.url}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all ${
                  active
                    ? "bg-[#eef2ff] text-[#4f46e5]"
                    : "text-[#374151] hover:bg-[#f3f4f6]"
                }`}
              >
                <span className="text-[18px] leading-none">{item.emoji}</span>
                <span className={active ? "font-semibold" : ""}>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Settings section */}
      <div className="px-3 mt-4">
        <div className="text-[11px] font-semibold text-[#9ca3af] px-3 mb-2 tracking-widest uppercase">Settings</div>
        <nav className="flex flex-col gap-0.5">
          {settingsItems.map((item) => {
            const active = pathname === item.url;
            return (
              <Link
                key={item.url}
                to={item.url}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all ${
                  active
                    ? "bg-[#eef2ff] text-[#4f46e5]"
                    : "text-[#374151] hover:bg-[#f3f4f6]"
                }`}
              >
                <span className="text-[18px] leading-none">{item.emoji}</span>
                <span className={active ? "font-semibold" : ""}>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
