
import {
  Navigate,
  Route,
  Routes,
} from "react-router";

import AppLayout from "./components/AppLayout";

import {
  AdminOnlyRoute,
  ProtectedRoute,
  PublicOnlyRoute,
} from "./components/ProtectedRoute";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MembersPage from "./pages/MembersPage";
import AddMemberPage from "./pages/AddMemberPage";
import MemberProfilePage from "./pages/MemberProfilePage";
import EditMemberPage from "./pages/EditMemberPage";
import PlansPage from "./pages/PlansPage";
import PlanFormPage from "./pages/PlanFormPage";
import MemberMembershipPage from "./pages/MemberMembershipPage";
import BillingPage from "./pages/BillingPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import PaymentReceiptPage from "./pages/PaymentReceiptPage";

function ModulePlaceholder({
  title,
}: {
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gym-card p-8">
      <h2 className="text-2xl font-black text-white">
        {title}
      </h2>

      <p className="mt-3 text-sm text-gym-muted">
        This module will be implemented in an
        upcoming sprint.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicOnlyRoute />}>
        <Route
          path="/login"
          element={<LoginPage />}
        />
      </Route>

      {/* Authenticated staff routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />

          <Route
            path="/members"
            element={<MembersPage />}
          />

          <Route
            path="/members/new"
            element={<AddMemberPage />}
          />

          <Route
            path="/members/:id"
            element={<MemberProfilePage />}
          />

          <Route
            path="/members/:id/edit"
            element={<EditMemberPage />}
          />
          
          <Route
            path="/members/:id/membership"
            element={<MemberMembershipPage />}
          />

          <Route
            path="/plans"
            element={<PlansPage />}
          />

          <Route
            path="/payments"
            element={<BillingPage />}
          />
          
          <Route
            path="/payments/invoices/:id"
            element={<InvoiceDetailPage />}
          />
          
          <Route
            path="/payments/invoices/:invoiceId/receipts/:paymentId"
            element={<PaymentReceiptPage />}
          />

          <Route
            path="/attendance"
            element={
              <ModulePlaceholder title="Attendance" />
            }
          />

          <Route
            path="/reports"
            element={
              <ModulePlaceholder title="Reports" />
            }
          />

          {/* Admin-only routes */}
          <Route element={<AdminOnlyRoute />}>
            <Route
              path="/settings"
              element={
                <ModulePlaceholder title="System Settings" />
              }
            />

            <Route
              path="/plans/new"
              element={<PlanFormPage />}
            />

            <Route
              path="/plans/:id/edit"
              element={<PlanFormPage />}
            />
          </Route>
        </Route>
      </Route>

      {/* Default routes */}
      <Route
        path="/"
        element={
          <Navigate to="/dashboard" replace />
        }
      />

      <Route
        path="*"
        element={
          <Navigate to="/dashboard" replace />
        }
      />
    </Routes>
  );
}
