import { lazy, Suspense } from 'react';
import { BrowserRouter, Outlet, Routes, Route } from 'react-router-dom';
import { CustomerAuthProvider } from './customer/auth/CustomerAuthProvider';
import { CustomerAccountPage } from './pages/CustomerAccountPage';
import { CustomerAuthCallbackPage } from './pages/CustomerAuthCallbackPage';
import { CustomerEmailVerifiedPage } from './pages/CustomerEmailVerifiedPage';
import { CustomerForgotPasswordPage } from './pages/CustomerForgotPasswordPage';
import { CustomerLoginPage } from './pages/CustomerLoginPage';
import { CustomerResetPasswordPage } from './pages/CustomerResetPasswordPage';
import { CustomerOnboardingPage } from './pages/onboarding/CustomerOnboardingPage';
import { LandingPage } from './pages/LandingPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';

const AdminRoutes = lazy(() => import('./admin/AdminRoutes'));
const SecurityRoutes = lazy(() => import('./security/SecurityRoutes'));

// Deliberately NO `fontFamily` on the wrapper below: an inherited font here
// would mask components that never declare one, making them look correct in
// the showcase and wrong in consumer designs. The design system's own
// `index.css` base layer supplies typography; shell chrome sets DS_SHELL_FONT
// on its own elements.
//
// Force the document chain to fill its containing block so per-preview
// pages can use `height: 100%` reliably. This matters specifically for
// scaled iframes: the preview-host stretches `html` to N×100% to host the
// pre-scale viewport, and `100vh` would only cover the visible 1× portion
// (clipping the dotted background and breaking flex centering).
export function App() {
  return (
    <BrowserRouter>
      <style>{`html, body, #root { height: 100%; margin: 0; padding: 0; }`}</style>
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          color: '#111827',
          fontSize: 14,
          lineHeight: '20px'
        }}>
        
        <main
          style={{
            flex: 1,
            height: '100%',
            overflowY: 'auto',
            backgroundColor: '#ffffff'
          }}>
          
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route
              element={
                <CustomerAuthProvider>
                  <Outlet />
                </CustomerAuthProvider>
              }
            >
              <Route path="/get-started" element={<CustomerOnboardingPage />} />
              <Route path="/login" element={<CustomerLoginPage />} />
              <Route path="/signup" element={<CustomerOnboardingPage />} />
              <Route path="/forgot-password" element={<CustomerForgotPasswordPage />} />
              <Route path="/auth/callback" element={<CustomerAuthCallbackPage />} />
              <Route path="/auth/email-verified" element={<CustomerEmailVerifiedPage />} />
              <Route path="/reset-password" element={<CustomerResetPasswordPage />} />
              <Route path="/account" element={<CustomerAccountPage />} />
            </Route>

            <Route
              path="/admin/*"
              element={
                <Suspense fallback={<div className="p-6 text-sm text-text-secondary">Loading…</div>}>
                  <AdminRoutes />
                </Suspense>
              }
            />
            <Route
              path="/security/*"
              element={
                <Suspense fallback={<div className="p-6 text-sm text-text-secondary">Loading…</div>}>
                  <SecurityRoutes />
                </Suspense>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>);

}