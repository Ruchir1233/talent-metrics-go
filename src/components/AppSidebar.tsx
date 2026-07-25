import { Link, useRouterState } from "@tanstack/react-router";

const workspaceItems = [
  { title: "Dashboard",          url: "/",                   emoji: "📊" },
  { title: "Daily reporting",    url: "/daily-reporting",    emoji: "📈" },
  { title: "Candidate pipeline", url: "/candidate-pipeline", emoji: "👥" },
  { title: "Positions",          url: "/positions",          emoji: "💼" },
  { title: "Position summary",   url: "/position-summary",   emoji: "📋" },
  { title: "Team summary",       url: "/team-summary",       emoji: "🏆" },
];

const outreachItems = [
  { title: "Campaigns",      url: "/outreach/campaigns", emoji: "📧" },
  { title: "Leads",          url: "/outreach/leads",     emoji: "🎯" },
  { title: "Templates",      url: "/outreach/templates", emoji: "📝" },
  { title: "Email Accounts", url: "/outreach/settings",  emoji: "📬" },
];

const toolItems = [
  { title: "Todo & Reminders", url: "/todos", emoji: "✅" },
];

const settingsItems = [
  { title: "Targets & setup", url: "/targets-setup", emoji: "⚙️" },
  { title: "Employees",       url: "/recruiters",    emoji: "👤" },
];

function NavItem({ title, url, emoji, pathname }: { title: string; url: string; emoji: string; pathname: string }) {
  const active = pathname === url;
  return (
    <Link
      to={url}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-medium transition-all ${
        active
          ? "bg-[#eef2ff] text-[#4f46e5]"
          : "text-[#374151] hover:bg-[#f3f4f6]"
      }`}
    >
      <span className="text-[16px] leading-none">{emoji}</span>
      <span className={active ? "font-semibold" : ""}>{title}</span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="w-[220px] shrink-0 flex flex-col h-screen bg-white border-r border-[#e5e7eb] overflow-y-auto">

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-6">
        <div className="w-10 h-10 rounded-xl bg-[#6366f1] flex items-center justify-center shadow-sm">
          <span className="text-white text-lg font-bold">K</span>
        </div>
        <div>
          <div className="text-[16px] font-bold text-[#111827] leading-tight">Kaapro</div>
          <div className="text-[12px] text-[#6b7280]">Recruitment</div>
        </div>
      </div>

      {/* Workspace */}
      <div className="px-3 mb-4">
        <div className="text-[11px] font-semibold text-[#9ca3af] px-2 mb-1.5 tracking-widest uppercase">Workspace</div>
        <nav className="flex flex-col gap-0.5">
          {workspaceItems.map((item) => (
            <NavItem key={item.url} {...item} pathname={pathname} />
          ))}
        </nav>
      </div>

      {/* Outreach */}
      <div className="px-3 mb-4">
        <div className="text-[11px] font-semibold text-[#9ca3af] px-2 mb-1.5 tracking-widest uppercase">Outreach</div>
        <nav className="flex flex-col gap-0.5">
          {outreachItems.map((item) => (
            <NavItem key={item.url} {...item} pathname={pathname} />
          ))}
        </nav>
      </div>

      {/* Tools */}
      <div className="px-3 mb-4">
        <div className="text-[11px] font-semibold text-[#9ca3af] px-2 mb-1.5 tracking-widest uppercase">Tools</div>
        <nav className="flex flex-col gap-0.5">
          {toolItems.map((item) => (
            <NavItem key={item.url} {...item} pathname={pathname} />
          ))}
        </nav>
      </div>

      {/* Settings */}
      <div className="px-3">
        <div className="text-[11px] font-semibold text-[#9ca3af] px-2 mb-1.5 tracking-widest uppercase">Settings</div>
        <nav className="flex flex-col gap-0.5">
          {settingsItems.map((item) => (
            <NavItem key={item.url} {...item} pathname={pathname} />
          ))}
        </nav>
      </div>
      {/* User + Logout */}
      <div className="px-3 mt-auto pt-3 pb-4 border-t border-[#e5e7eb]">
        {(() => {
          const user = getCurrentUser();
          if (!user) return null;
          return (
            <div className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-full bg-[#6366f1] flex items-center justify-center text-white text-[12px] font-bold shrink-0">
                {user.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#111827] truncate">{user.name}</div>
                <div className="text-[11px] text-[#9ca3af] truncate">{user.job_role}</div>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sign out"
                className="p-1.5 rounded-lg hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-colors shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          );
        })()}
      </div>
    </aside>
  );
}
