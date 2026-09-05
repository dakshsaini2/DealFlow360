import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import AppShell from './components/layout/AppShell'
import LandingPage from './pages/LandingPage'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
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
import PortalLayout from './pages/portal/PortalLayout'
import PortalQuotations from './pages/portal/PortalQuotations'
import PortalQuotation from './pages/portal/PortalQuotation'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />


          {/*
            The customer portal is a separate route tree with its own shell,
            not a filtered view of /app — a CUSTOMER has no route into the
            internal workspace at all.
          */}
          <Route element={<ProtectedRoute roles={['CUSTOMER']} redirectTo="/app" />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<PortalQuotations />} />
              <Route path="quotations/:id" element={<PortalQuotation />} />
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
              <Route element={<ProtectedRoute roles={['ADMIN', 'SALES_MANAGER', 'FINANCE']} />}>
                <Route path="approvals" element={<ApprovalsQueue />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
