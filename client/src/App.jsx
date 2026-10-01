import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { FiHome, FiMapPin, FiTruck, FiUser, FiUsers, FiGrid, FiNavigation, FiLayers } from 'react-icons/fi';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { PageLoader } from './components/ui.jsx';
import { MapsProvider } from './components/Maps.jsx';
import Login from './pages/Login.jsx';

const FieldHome = lazy(() => import('./pages/field/FieldHome.jsx'));
const FieldVisits = lazy(() => import('./pages/field/FieldVisits.jsx'));
const FieldTravel = lazy(() => import('./pages/field/FieldTravel.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const Employees = lazy(() => import('./pages/admin/Employees.jsx'));
const AdminVisits = lazy(() => import('./pages/admin/AdminVisits.jsx'));
const Travel = lazy(() => import('./pages/admin/Travel.jsx'));
const LiveTracking = lazy(() => import('./pages/admin/LiveTracking.jsx'));
const Organization = lazy(() => import('./pages/admin/Organization.jsx'));

const FIELD_NAV = [
  { to: '/field', label: 'Today', icon: FiHome, end: true },
  { to: '/field/visits', label: 'My Visits', short: 'Visits', icon: FiMapPin },
  { to: '/field/travel', label: 'Travel Log', short: 'Travel', icon: FiTruck },
  { to: '/field/profile', label: 'Profile', icon: FiUser },
];
const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: FiGrid, end: true },
  { to: '/admin/live', label: 'Live Tracking', short: 'Live', icon: FiNavigation },
  { to: '/admin/visits', label: 'Visits & Deals', short: 'Visits', icon: FiMapPin },
  { to: '/admin/travel', label: 'Travel & KM', short: 'Travel', icon: FiTruck },
  { to: '/admin/employees', label: 'Employees', short: 'Staff', icon: FiUsers },
  { to: '/admin/organization', label: 'Teams & Zones', icon: FiLayers },
  { to: '/admin/profile', label: 'My Account', icon: FiUser },
];

const home = (u) => (u?.role === 'ADMIN' ? '/admin' : '/field');

function Guard({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={home(user)} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <MapsProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={loading ? <PageLoader /> : user ? <Navigate to={home(user)} replace /> : <Login />} />
          <Route
            path="/field"
            element={
              <Guard role="FIELD_VISITOR">
                <Layout nav={FIELD_NAV} roleLabel="Field Visitor" />
              </Guard>
            }
          >
            <Route index element={<FieldHome />} />
            <Route path="visits" element={<FieldVisits />} />
            <Route path="travel" element={<FieldTravel />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route
            path="/admin"
            element={
              <Guard role="ADMIN">
                <Layout nav={ADMIN_NAV} roleLabel="Administrator" />
              </Guard>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="live" element={<LiveTracking />} />
            <Route path="visits" element={<AdminVisits />} />
            <Route path="travel" element={<Travel />} />
            <Route path="employees" element={<Employees />} />
            <Route path="organization" element={<Organization />} />
            <Route path="profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to={user ? home(user) : '/login'} replace />} />
        </Routes>
      </Suspense>
    </MapsProvider>
  );
}
