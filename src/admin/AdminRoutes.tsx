import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { DashboardAuthProvider } from '../dashboard/auth/DashboardAuthProvider';
import { PRIVILEGED_DASHBOARD_CONFIG } from '../dashboard/auth/roleRouting';
import { PrivilegedLoginPage } from '../dashboard/components/PrivilegedLoginPage';
import { AdminAuthGate, AdminLayout } from './layout/AdminLayout';
import { AdminHomePage } from './pages/AdminHomePage';
import {
  AccountDetailPage,
  AssetDetailPage,
  AssetsListPage,
  CustomersListPage,
  PoliciesListPage,
  PolicyDetailPage,
  StaffListPage,
} from './pages/AdminDataPages';
import { VerificationQueuePage, VerificationReviewPage } from './pages/AdminVerificationPages';
import { PlanCreatePage, PlanEditRoute, PlansListPage } from './pages/AdminPlansPages';
import { AdminAnalyticsPage } from './pages/AdminAnalyticsPage';
import { AdminAuditLogPage } from './pages/AdminAuditLogPage';
import { InviteStaffPage } from './pages/InviteStaffPage';
import { ClaimDetailPage, ClaimsQueuePage } from './pages/AdminClaimsPages';
import { PartnerOrganizationScorecardPage, PartnerOrganizationsListPage } from './pages/PartnerOrganizationPages';

function AccountDetailRoute() {
  const { accountId } = useParams();
  if (!accountId) return <Navigate to="/admin/customers" replace />;
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

function ClaimDetailRoute() {
  const { claimId } = useParams();
  if (!claimId) return <Navigate to="/admin/claims" replace />;
  return <ClaimDetailPage />;
}

function PartnerOrganizationScorecardRoute() {
  const { partnerOrganizationId } = useParams();
  if (!partnerOrganizationId) return <Navigate to="/admin/partner-organizations" replace />;
  return <PartnerOrganizationScorecardPage partnerOrganizationId={partnerOrganizationId} />;
}

export default function AdminRoutes() {
  return (
    <DashboardAuthProvider
      config={{ storageKey: PRIVILEGED_DASHBOARD_CONFIG.admin.storageKey, allowedUserType: 'admin' }}
    >
      <Routes>
        <Route
          path="login"
          element={
            <PrivilegedLoginPage
              title="Admin sign in"
              subtitle="Platform administrator access — MFA required for privileged accounts."
              defaultRedirect="/admin/customers"
            />
          }
        />
        <Route element={<AdminAuthGate />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminHomePage />} />
            <Route path="customers" element={<CustomersListPage />} />
            <Route path="staff" element={<StaffListPage />} />
            {/* Backward-compat: the old mixed-list route now redirects to Customers. */}
            <Route path="accounts" element={<Navigate to="/admin/customers" replace />} />
            <Route path="accounts/invite" element={<InviteStaffPage />} />
            <Route path="accounts/:accountId" element={<AccountDetailRoute />} />
            <Route path="policies" element={<PoliciesListPage />} />
            <Route path="policies/:policyId" element={<PolicyDetailRoute />} />
            <Route path="assets" element={<AssetsListPage />} />
            <Route path="assets/:assetId" element={<AssetDetailRoute />} />
            <Route path="plans" element={<PlansListPage />} />
            <Route path="plans/new" element={<PlanCreatePage />} />
            <Route path="plans/:planId" element={<PlanEditRoute />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="verification" element={<VerificationQueuePage />} />
            <Route path="verification/:accountId" element={<VerificationReviewPage />} />
            <Route path="audit-log" element={<AdminAuditLogPage />} />
            <Route path="claims" element={<ClaimsQueuePage />} />
            <Route path="claims/:claimId" element={<ClaimDetailRoute />} />
            <Route path="partner-organizations" element={<PartnerOrganizationsListPage />} />
            <Route
              path="partner-organizations/:partnerOrganizationId/scorecard"
              element={<PartnerOrganizationScorecardRoute />}
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="login" replace />} />
      </Routes>
    </DashboardAuthProvider>
  );
}
