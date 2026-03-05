import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  MessageSquare, BarChart2, Users, Settings, LogOut, Zap, UserSquare2,
  Home, Menu, X, CheckCircle, Clock, Moon, Sun, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/hooks/use-profile';
import { useIsMobile } from '@/hooks/use-mobile';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NavItemDef {
  to: string;
  icon: React.ReactNode;
  label: string;
  adminOnly?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

const DashboardLayout = () => {
  const { signOut } = useAuth();
  const { profile, isAdmin } = useProfile();
  const isMobile = useIsMobile();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);   // mobile drawer
  const [isCollapsed, setIsCollapsed] = useState(() =>         // desktop collapse
    localStorage.getItem('nav-collapsed') === 'true'
  );
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      localStorage.setItem('nav-collapsed', String(!prev));
      return !prev;
    });
  };

  const handleLogout = () => signOut();

  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : (profile?.id ? 'Agent' : 'Loading…');
  const initial = displayName.charAt(0).toUpperCase();

  // ── Nav definitions ──────────────────────────────────────────────────────

  const sections: { heading: string; items: NavItemDef[] }[] = [
    {
      heading: 'Overview',
      items: [
        { to: '/app/dashboard', icon: <Home size={18} />, label: 'Dashboard' },
      ],
    },
    {
      heading: 'Workspace',
      items: [
        { to: '/app/inbox',    icon: <MessageSquare size={18} />, label: 'Inbox' },
        { to: '/app/snoozed',  icon: <Clock size={18} />,         label: 'Snoozed' },
        { to: '/app/resolved', icon: <CheckCircle size={18} />,   label: 'Resolved' },
      ],
    },
    {
      heading: 'Management',
      items: [
        { to: '/app/contacts', icon: <UserSquare2 size={18} />, label: 'Customers' },
        { to: '/app/replies',  icon: <Zap size={18} />,         label: 'Library' },
        { to: '/app/agents',   icon: <Users size={18} />,        label: 'Team' },
        { to: '/app/stats',    icon: <BarChart2 size={18} />,    label: 'Analytics', adminOnly: true },
      ],
    },
  ];

  // ── Single nav link ──────────────────────────────────────────────────────

  const SideNavLink = ({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) => (
    <NavLink
      to={to}
      onClick={() => setIsSidebarOpen(false)}
      title={isCollapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center rounded-2xl transition-all duration-200
         ${isCollapsed ? 'justify-center p-3' : 'space-x-3 px-4 py-3.5'}
         ${isActive
           ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20'
           : 'hover:bg-indigo-800 dark:hover:bg-indigo-900/50 text-indigo-200 hover:text-white'}`
      }
    >
      <span className="shrink-0">{icon}</span>
      {!isCollapsed && <span className="font-bold text-sm truncate">{label}</span>}
    </NavLink>
  );

  // ── Nav tree ─────────────────────────────────────────────────────────────

  const NavTree = () => (
    <>
      {sections.map(section => {
        const visibleItems = section.items.filter(i => !i.adminOnly || isAdmin);
        if (!visibleItems.length) return null;
        return (
          <div key={section.heading}>
            {!isCollapsed && (
              <p className="px-4 py-3 text-[10px] font-bold text-indigo-400 dark:text-indigo-300 uppercase tracking-[0.2em] opacity-50">
                {section.heading}
              </p>
            )}
            {isCollapsed && <div className="my-2 mx-3 border-t border-indigo-800/60 dark:border-slate-700/60" />}
            {visibleItems.map(item => (
              <SideNavLink key={item.to} {...item} />
            ))}
          </div>
        );
      })}
    </>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const sidebarW = isMobile ? 'w-72' : isCollapsed ? 'w-16' : 'w-64';

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-300">

      {/* Mobile header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-indigo-900 dark:bg-slate-900 flex items-center justify-between px-4 z-50 shadow-lg">
          <div className="flex items-center space-x-2">
            <div className="bg-white text-indigo-900 p-1.5 rounded-lg">
              <MessageSquare size={18} strokeWidth={3} />
            </div>
            <h1 className="text-lg font-black text-white tracking-tighter uppercase italic">WhaDesk</h1>
          </div>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-white p-2 hover:bg-indigo-800 rounded-xl transition-colors"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`
        ${isMobile
          ? `fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
          : `relative ${sidebarW} transition-all duration-300 ease-in-out`}
        bg-indigo-900 dark:bg-slate-900 text-indigo-50 flex flex-col justify-between
        rounded-r-[2.5rem] my-2 ml-2 shadow-2xl border border-indigo-800 dark:border-slate-800 overflow-hidden
      `}>

        {/* Top: Logo + collapse toggle */}
        {!isMobile && (
          <div className={`flex items-center ${isCollapsed ? 'justify-center pt-6 pb-2' : 'justify-between p-6 pb-2'}`}>
            {!isCollapsed && (
              <div className="flex items-center space-x-3">
                <div className="bg-white text-indigo-900 p-2 rounded-xl shadow-xl shadow-indigo-950/20">
                  <MessageSquare size={20} strokeWidth={3} />
                </div>
                <h1 className="text-xl font-black tracking-tighter uppercase italic">WhaDesk</h1>
              </div>
            )}
            {isCollapsed && (
              <div className="bg-white text-indigo-900 p-2 rounded-xl shadow-xl shadow-indigo-950/20">
                <MessageSquare size={18} strokeWidth={3} />
              </div>
            )}
            {/* Collapse toggle button */}
            <button
              onClick={toggleCollapse}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`p-1.5 rounded-xl bg-indigo-800/60 hover:bg-indigo-700 text-indigo-300 hover:text-white transition-all ${isCollapsed ? 'mt-3' : ''}`}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        )}

        {/* Mobile spacer */}
        {isMobile && <div className="h-20" />}

        {/* Nav */}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar ${isMobile || !isCollapsed ? 'px-3' : 'px-1.5'} space-y-0.5 mt-2`}>
          <NavTree />
        </div>

        {/* Bottom section */}
        <div className={`${isCollapsed && !isMobile ? 'px-1.5 pb-4 space-y-2' : 'p-4 space-y-2 mb-3'}`}>

          {/* Dark mode toggle */}
          {isCollapsed && !isMobile ? (
            <button
              onClick={() => setIsDark(!isDark)}
              title={isDark ? 'Light mode' : 'Dark mode'}
              className="w-full flex justify-center p-3 bg-indigo-800/40 dark:bg-slate-800/40 rounded-2xl text-indigo-200 hover:text-white hover:bg-indigo-700 transition-all"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          ) : (
            <div className="flex items-center justify-between px-3 py-1.5 mb-1">
              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Appearance</span>
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-2 bg-indigo-800 dark:bg-slate-800 rounded-xl text-indigo-200 hover:text-white transition-all"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
          )}

          {/* Settings link */}
          <NavLink
            to="/app/settings"
            onClick={() => setIsSidebarOpen(false)}
            title={isCollapsed ? 'Settings' : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-2xl transition-all duration-200
               ${isCollapsed && !isMobile ? 'justify-center p-3' : 'space-x-3 px-3 py-3'}
               ${isActive
                 ? 'bg-indigo-600 text-white shadow-lg'
                 : 'hover:bg-indigo-800 dark:hover:bg-indigo-900/50 text-indigo-200 hover:text-white'}`
            }
          >
            <Settings size={18} className="shrink-0" />
            {(!isCollapsed || isMobile) && <span className="font-bold text-sm">Settings</span>}
          </NavLink>

          {/* User card */}
          <div className={`bg-indigo-800/40 dark:bg-slate-800/40 rounded-[1.5rem] border border-indigo-700/50 dark:border-slate-700/50 backdrop-blur-sm
            ${isCollapsed && !isMobile ? 'p-2 flex justify-center' : 'p-3'}`}>
            {isCollapsed && !isMobile ? (
              <button
                onClick={handleLogout}
                title={`Sign out (${displayName})`}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-lg uppercase"
              >
                {initial}
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-lg uppercase border-2 border-indigo-800 dark:border-slate-800 shrink-0">
                  {initial}
                </div>
                <div className="flex-1 overflow-hidden min-w-0">
                  <p className="text-sm font-bold text-white truncate capitalize leading-tight">{displayName}</p>
                  <div className="flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Active</span>
                  </div>
                </div>
                <button onClick={handleLogout} className="text-indigo-400 hover:text-white p-1.5 rounded-xl hover:bg-indigo-700 transition-all shrink-0" title="Sign out">
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobile && isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
      )}

      <main className={`flex-1 flex flex-col h-full overflow-hidden ${isMobile ? 'pt-16' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
