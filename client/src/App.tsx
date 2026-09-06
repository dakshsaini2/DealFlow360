import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import PublicOnlyRoute from './components/layout/PublicOnlyRoute'
import AppShell from './components/layout/AppShell'
import LandingPage from './pages/LandingPage'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import AcceptInvite from './pages/auth/AcceptInvite'
import VerifyEmail from './pages/auth/VerifyEmail'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import Dashboard from './pages/app/Dashboard'
import CustomersList from './pages/app/customers/CustomersList'
import CustomerDetail from './pages/app/customers/CustomerDetail'
import ProductsList from './pages/app/catalog/ProductsList'
import ProductDetail from './pages/app/catalog/ProductDetail'
import QuotationsList from './pages/app/quotations/QuotationsList'
import QuotationBuilder from './pages/app/quotations/QuotationBuilder'
import ApprovalsQueue from './pages/app/approvals/ApprovalsQueue'
import OrdersList from './pages/app/orders/OrdersList'
import OrderDetail from './pages/app/orders/OrderDetail'
import InvoicesList from './pages/app/billing/InvoicesList'
import InvoiceDetail from './pages/app/billing/InvoiceDetail'
import DealHealth from './pages/app/health/DealHealth'
import Reports from './pages/app/reports/Reports'
import Backend from './pages/app/admin/Backend'
import PortalLayout from './pages/portal/PortalLayout'
import PortalQuotations from './pages/portal/PortalQuotations'
import PortalStore from './pages/portal/PortalStore'
import PortalOrders from './pages/portal/PortalOrders'
import PortalOrder from './pages/portal/PortalOrder'
import PortalQuotation from './pages/portal/PortalQuotation'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          {/*
            A stored session means these pages are a dead end, so an already
            signed-in visitor is sent to whichever surface is theirs.
          */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
          </Route>

          {/*
            These two are reached *with* a session as often as without, so they
            sit outside the signed-out-only guard:

            - verification: a new signup already has one;
            - an invitation: it is addressed to a named person, and whoever
              happens to be logged in on that browser is usually the rep who
              sent it. Bouncing them to /app would make the link look broken.
          */}
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />


          {/*
            The customer portal is a separate route tree with its own shell,
            not a filtered view of /app — a CUSTOMER has no route into the
            internal workspace at all.
          */}
          <Route element={<ProtectedRoute roles={['CUSTOMER']} redirectTo="/app" />}>
            <Route path="/portal" element={<PortalLayout />}>
              {/*
                A customer's job here starts with choosing what to buy, so the
                store is the landing page and their quotations sit alongside it.
              */}
              <Route index element={<PortalStore />} />
              <Route path="quotations" element={<PortalQuotations />} />
              <Route path="quotations/:id" element={<PortalQuotation />} />
              <Route path="orders" element={<PortalOrders />} />
              <Route path="orders/:id" element={<PortalOrder />} />
            </Route>
          </Route>

          <Route
            element={
              <ProtectedRoute
                roles={['ADMIN', 'SALES_MANAGER', 'FINANCE', 'SALES_REP']}
                redirectTo="/portal"
              />
            }
          >
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="customers" element={<CustomersList />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="products" element={<ProductsList />} />
              <Route path="products/:id" element={<ProductDetail />} />
              <Route path="quotations" element={<QuotationsList />} />
              <Route path="quotations/:id" element={<QuotationBuilder />} />
              <Route path="orders" element={<OrdersList />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="invoices" element={<InvoicesList />} />
              <Route path="invoices/:id" element={<InvoiceDetail />} />
              <Route path="deal-health" element={<DealHealth />} />
              <Route element={<ProtectedRoute roles={['ADMIN', 'SALES_MANAGER', 'FINANCE', 'SALES_REP']} />}>
                <Route path="reports" element={<Reports />} />
              </Route>
              <Route element={<ProtectedRoute roles={['ADMIN', 'SALES_MANAGER', 'FINANCE']} />}>
                <Route path="approvals" element={<ApprovalsQueue />} />
              </Route>
              <Route element={<ProtectedRoute roles={['ADMIN', 'SALES_MANAGER']} />}>
                <Route path="backend" element={<Backend />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
