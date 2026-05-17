import { Outlet, Navigate, useLocation } from 'react-router-dom';

export default function Settings() {
  const location = useLocation();

  if (location.pathname === '/settings') {
    return <Navigate to="/settings/ai-models" replace />;
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <Outlet />
    </div>
  );
}
