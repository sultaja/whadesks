import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { MessageSquare, BarChart2, Users, Settings, LogOut, Zap, UserSquare2, Search, Megaphone, Home, Menu, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/hooks/use-profile';
import { useIsMobile } from '@/hooks/use-mobile';

const DashboardLayout = () => {
  const { signOut } = useAuth();
  const { profile, isAdmin } = useProfile();
  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
  };

  const displayName = profile?.first_name 
    ? `${profile.first_name} ${profile.last_name || ''}`.trim() 
    : (profile?.id ? "Agent" : "Loading...");
    
  const initial = displayName.charAt(0).toUpperCase();

  const NavItems = () => (
    <>
      <p className="px-4 py-3 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] opacity-50">Overview</p>
      <NavLink
        to="/app/dashboard"
        onClick={() => setIsSidebarOpen(false)}
        className={({ isActive }) =>
          `flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
            isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20 translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
          }`
        }
      >
        <Home size={18} />
        <span className="font-bold text-sm">Dashboard</span>
      </NavLink>

      <p className="px-4 py-3 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] opacity-50">Workspace</p>
      <NavLink
        to="/app/inbox"
        onClick={() => setIsSidebarOpen(false)}
        className={({ isActive }) =>
          `flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
            isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20 translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
          }`
        }
      >
        <MessageSquare size={18} />
        <span className="font-bold text-sm">Inbox</span>
      </NavLink>

      <NavLink
        to="/app/search"
        onClick={() => setIsSidebarOpen(false)}
        className={({ isActive }) =>
          `flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
            isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20 translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
          }`
        }
      >
        <Search size={18} />
        <span className="font-bold text-sm">Search</span>
      </NavLink>

      <NavLink
        to="/app/broadcast"
        onClick={() => setIsSidebarOpen(false)}
        className={({ isActive }) =>
          `flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
            isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20 translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
          }`
        }
      >
        <Megaphone size={18} />
        <span className="font-bold text-sm">Broadcasts</span>
      </NavLink>

      <p className="px-4 py-5 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] opacity-50">Management</p>
      
      <NavLink
        to="/app/contacts"
        onClick={() => setIsSidebarOpen(false)}
        className={({ isActive }) =>
          `flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
            isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20 translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
          }`
        }
      >
        <UserSquare2 size={18} />
        <span className="font-bold text-sm">Customers</span>
      </NavLink>

      <NavLink
        to="/app/replies"
        onClick={() => setIsSidebarOpen(false)}
        className={({ isActive }) =>
          `flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
            isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20 translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
          }`
        }
      >
        <Zap size={18} />
        <span className="font-bold text-sm">Library</span>
      </NavLink>

      <NavLink
        to="/app/agents"
        onClick={() => setIsSidebarOpen(false)}
        className={({ isActive }) =>
          `flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
            isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20 translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
          }`
        }
      >
        <Users size={18} />
        <span className="font-bold text-sm">Team</span>
      </NavLink>

      {isAdmin && (
        <NavLink
          to="/app/stats"
          onClick={() => setIsSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
              isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/20 translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
            }`
          }
        >
          <BarChart2 size={18} />
          <span className="font-bold text-sm">Analytics</span>
        </NavLink>
      )}
    </>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-indigo-900 flex items-center justify-between px-4 z-50 shadow-lg">
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
        ${isMobile ? 'fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 ease-in-out' : 'w-64 relative'}
        ${isMobile && !isSidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        bg-indigo-900 text-indigo-50 flex flex-col justify-between rounded-r-[2.5rem] my-2 ml-2 shadow-2xl border border-indigo-800
      `}>
        <div className="overflow-y-auto custom-scrollbar">
          {!isMobile && (
            <div className="p-8 flex items-center space-x-3 mb-4">
              <div className="bg-white text-indigo-900 p-2.5 rounded-2xl shadow-xl shadow-indigo-950/20">
                <MessageSquare size={24} strokeWidth={3} />
              </div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic">WhaDesk</h1>
            </div>
          )}
          
          {isMobile && <div className="h-20" />} {/* Spacer for mobile header */}

          <nav className="px-5 space-y-1.5">
            <NavItems />
          </nav>
        </div>

        <div className="p-5 space-y-2 mb-4">
          <NavLink
            to="/app/settings"
            onClick={() => setIsSidebarOpen(false)}
            className={({ isActive }) =>
              `flex w-full items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                isActive ? 'bg-indigo-600 text-white shadow-lg translate-x-1' : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
              }`
            }
          >
            <Settings size={18} />
            <span className="font-bold text-sm">Settings</span>
          </NavLink>
          
          <div className="bg-indigo-800/40 rounded-[1.75rem] p-4 flex flex-col mt-4 border border-indigo-700/50 backdrop-blur-sm">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-lg uppercase border-2 border-indigo-800">
                {initial}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-white truncate capitalize leading-tight">{displayName}</p>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Active</span>
                </div>
              </div>
              <button onClick={handleLogout} className="text-indigo-400 hover:text-white p-2 rounded-xl hover:bg-indigo-700 transition-all">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main className={`flex-1 flex flex-col h-full overflow-hidden ${isMobile ? 'pt-16' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;