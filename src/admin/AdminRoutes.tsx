import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { DashboardAuthProvider } from '../dashboard/auth/DashboardAuthProvider';
import { PrivilegedLoginPage } from '../dashboard/components/PrivilegedLoginPage';
import { AdminAuthGate, AdminLayout } from './layout/AdminLayout';
import {
  AccountDetailPage,
  AccountsListPage,
  AssetDetailPage,
  AssetsListPage,
  PoliciesListPage,
  PolicyDetailPage,
} from './pages/AdminDataPages';
import { VerificationQueuePage, VerificationReviewPage } from './pages/AdminVerificationPages';
import { PlanEditRoute, PlansListPage } from './pages/AdminPlansPages';

function AccountDetailRoute() {
  const { accountId } = useParams();
  if (!accountId) return <Navigate to="/admin/accounts" replace />;
  return <AccountDetailPage accountId={accountId} />;
}

function PolicyDetailRoute() {
  const { policyId } = useParams();
  if (!policyId) return <Navigate to="/admin/policies" replace />;
  return <PolicyDetailPage policyId={policyId} />;
}

function AssetDetailRoute() {
  const { assetId } = useParams();
  if (!assetId) return <Navigate to="/admin/assets" replace />;
  return <AssetDetailPage assetId={assetId} />;
}

export default function AdminRoutes() {
  return (
    <DashboardAuthProvider config={{ storageKey: 'td-admin-refresh-token', allowedUserType: 'admin' }}>
      <Routes>
        <Route
          path="login"
          element={
            <PrivilegedLoginPage
              title="Admin sign in"
              subtitle="Platform administrator access — MFA required for privileged accounts."
              defaultRedirect="/admin/accounts"
            />
          }
        />
        <Route element={<AdminAuthGate />}>
          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="accounts" replace />} />
            <Route path="accounts" element={<AccountsListPage />} />
            <Route path="accounts/:accountId" element={<AccountDetailRoute />} />
            <Route path="policies" element={<PoliciesListPage />} />
            <Route path="policies/:policyId" element={<PolicyDetailRoute />} />
            <Route path="assets" element={<AssetsListPage />} />
            <Route path="assets/:assetId" element={<AssetDetailRoute />} />
            <Route path="plans" element={<PlansListPage />} />
            <Route path="plans/:planId" element={<PlanEditRoute />} />
            <Route path="verification" element={<VerificationQueuePage />} />
            <Route path="verification/:accountId" element={<VerificationReviewPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </DashboardAuthProvider>
  );
}
