import { Navigate } from 'react-router-dom';

/** Legacy `/account` URL — send customers to the dashboard account settings. */
export function CustomerAccountPage() {
  return <Navigate to="/dashboard/account" replace />;
}
