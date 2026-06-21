import { Link, useRouterState } from "@tanstack/react-router";

const workspaceItems = [
  { title: "Dashboard",          url: "/",                   emoji: "📊" },
  { title: "Daily reporting",    url: "/daily-reporting",    emoji: "📈" },
  { title: "Candidate pipeline", url: "/candidate-pipeline", emoji: "👥" },
  { title: "Positions",          url: "/positions",          emoji: "💼" },
  { title: "Position summary",   url: "/position-summary",   emoji: "📋" },
  { title: "Team summary",       url: "/team-summary",       emoji: "🏆" },
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
    </aside>
  );
}
