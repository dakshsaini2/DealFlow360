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

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Everything under /app requires a session. Feature modules are
              added here as they land. */}
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="customers" element={<CustomersList />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="products" element={<ProductsList />} />
              <Route path="products/:id" element={<ProductDetail />} />
              <Route path="quotations" element={<QuotationsList />} />
              <Route path="quotations/:id" element={<QuotationBuilder />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
