import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentUser, logout } from "@/lib/auth";

const workspaceItems = [
  { title: "Dashboard",          url: "/",                   emoji: "📊" },
  { title: "Daily reporting",    url: "/daily-reporting",    emoji: "📈" },
  { title: "Candidate pipeline", url: "/candidate-pipeline", emoji: "👥" },
  { title: "Positions",          url: "/positions",          emoji: "💼" },
  { title: "Position summary",   url: "/position-summary",   emoji: "📋" },
  { title: "Team summary",       url: "/team-summary",       emoji: "🏆" },
  { title: "Applications",       url: "/job-applications",   emoji: "📨" },
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

function NavItem({
  title, url, emoji, pathname, onNavigate,
}: { title: string; url: string; emoji: string; pathname: string; onNavigate?: () => void }) {
  const active = pathname === url;
  return (
    <Link
      to={url}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-medium transition-all ${
        active
          ? "bg-[#eef2ff] text-[#4f46e5]"
          : "text-[#374151] hover:bg-[#f3f4f6] active:bg-[#f3f4f6]"
      }`}
    >
      <span className="text-[16px] leading-none">{emoji}</span>
      <span className={active ? "font-semibold" : ""}>{title}</span>
    </Link>
  );
}

function NavSection({
  label, items, pathname, onNavigate,
}: { label: string; items: typeof workspaceItems; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="px-3 mb-4">
      <div className="text-[11px] font-semibold text-[#9ca3af] px-2 mb-1.5 tracking-widest uppercase">{label}</div>
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavItem key={item.url} {...item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

/** Shared inner content used by both the desktop rail and the mobile drawer. */
function SidebarInner({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const user = getCurrentUser();
  return (
    <>
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

      <NavSection label="Workspace" items={workspaceItems} pathname={pathname} onNavigate={onNavigate} />
      <NavSection label="Outreach"  items={outreachItems}  pathname={pathname} onNavigate={onNavigate} />
      <NavSection label="Tools"     items={toolItems}      pathname={pathname} onNavigate={onNavigate} />
      <NavSection label="Settings"  items={settingsItems}  pathname={pathname} onNavigate={onNavigate} />

      {/* User + Logout */}
      <div className="px-3 mt-auto pt-3 pb-4 border-t border-[#e5e7eb]">
        {user && (
          <div className="flex items-center gap-2">
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
              aria-label="Sign out"
              className="p-1.5 rounded-lg hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Desktop rail — hidden on mobile. */
export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col h-screen sticky top-0 bg-white border-r border-[#e5e7eb] overflow-y-auto">
      <SidebarInner pathname={pathname} />
    </aside>
  );
}

/** Mobile top bar + slide-in drawer — hidden on desktop. */
export function MobileTopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-3 bg-white/90 backdrop-blur border-b border-[#e5e7eb]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -ml-1 rounded-lg text-[#374151] hover:bg-[#f3f4f6] active:bg-[#e5e7eb] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#6366f1] flex items-center justify-center shadow-sm">
            <span className="text-white text-[15px] font-bold">K</span>
          </div>
          <span className="text-[15px] font-bold text-[#111827]">Kaapro</span>
        </div>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[264px] max-w-[82%] flex flex-col bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200">
            <SidebarInner pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
