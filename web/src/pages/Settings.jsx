import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';

export default function Settings() {
  const location = useLocation();

  if (location.pathname === '/settings') {
    return <Navigate to="/settings/ai-models" replace />;
  }

  const sidebarLinks = [
    { to: '/settings/ai-models', label: 'AI Models' },
    { to: '/settings/integrations', label: 'Integrations' },
    { to: '/settings/automation', label: 'Automation' },
  ];

  const linkClass = ({ isActive }) =>
    `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-gray-900 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <div className="flex flex-1">
      <aside className="w-56 border-r border-gray-200 bg-white p-4">
        <h1 className="text-lg font-bold mb-4 px-3">Settings</h1>
        <nav className="space-y-1">
          {sidebarLinks.map(link => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1 p-6">
        <Outlet />
      </div>
    </div>
  );
}
