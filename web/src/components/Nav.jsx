import { NavLink } from 'react-router-dom';

export default function Nav() {
  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-gray-900 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-6">
        <span className="text-lg font-bold tracking-tight">Clumo</span>
        <div className="flex gap-1">
          <NavLink to="/call" className={linkClass}>Call</NavLink>
          <NavLink to="/sessions" className={linkClass}>Sessions</NavLink>
          <NavLink to="/kb" className={linkClass}>Knowledge Base</NavLink>
          <NavLink to="/settings" className={linkClass}>Settings</NavLink>
        </div>
      </div>
    </nav>
  );
}
