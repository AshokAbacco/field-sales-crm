import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  FiHome,
  FiMapPin,
  FiTruck,
  FiUser,
  FiGrid,
  FiUsers,
  FiSettings,
  FiAward,
  FiDatabase,
} from "react-icons/fi";
import { useAuth } from "./context/AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import TopLayout from "./components/TopLayout.jsx";
import { PageLoader } from "./components/ui.jsx";
import { homePath } from "./utils/constants.js";
import Login from "./pages/Login.jsx";

const FieldHome = lazy(() => import("./pages/field/FieldHome.jsx"));
const FieldVisits = lazy(() => import("./pages/field/FieldVisits.jsx"));
const FieldTravel = lazy(() => import("./pages/field/FieldTravel.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const CommandCenter = lazy(() => import("./pages/admin/CommandCenter.jsx"));
const StaffSetup = lazy(() => import("./pages/admin/StaffSetup.jsx"));
const Settings = lazy(() => import("./pages/admin/Settings.jsx"));
const Incentives = lazy(() => import("./pages/admin/Incentives.jsx"));
const Places = lazy(() => import("./pages/Places.jsx"));

// Field employees use the app all day → simple tabs with a mobile bottom bar
const FIELD_NAV = [
  { to: "/field", label: "Today", icon: FiHome, end: true },
  { to: "/field/visits", label: "My Visits", short: "Visits", icon: FiMapPin },
  { to: "/field/places", label: "Places", icon: FiDatabase },
  { to: "/field/travel", label: "Travel Log", short: "Travel", icon: FiTruck },
  { to: "/field/profile", label: "Profile", icon: FiUser },
];
// Admin & Manager: few dense pages + Settings (plans, categories, products)
const ADMIN_NAV = [
  { to: "/admin", label: "Command Center", icon: FiGrid, end: true },
  { to: "/admin/staff", label: "Staff & Setup", icon: FiUsers },
  { to: "/admin/places", label: "Places", icon: FiDatabase },
  { to: "/admin/incentives", label: "Incentives", icon: FiAward },
  { to: "/admin/settings", label: "Settings", icon: FiSettings },
];
const MANAGER_NAV = [
  { to: "/manager", label: "Team Command", icon: FiGrid, end: true },
  { to: "/manager/places", label: "Places", icon: FiDatabase },
  { to: "/manager/incentives", label: "Incentives", icon: FiAward },
  { to: "/manager/settings", label: "Settings", icon: FiSettings },
];

function Guard({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role)
    return <Navigate to={homePath(user)} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          path="/login"
          element={
            loading ? (
              <PageLoader />
            ) : user ? (
              <Navigate to={homePath(user)} replace />
            ) : (
              <Login />
            )
          }
        />
        <Route
          path="/field"
          element={
            <Guard role="FIELD_VISITOR">
              <Layout nav={FIELD_NAV} roleLabel="Field Employee" />
            </Guard>
          }
        >
          <Route index element={<FieldHome />} />
          <Route path="visits" element={<FieldVisits />} />
          <Route path="places" element={<Places />} />
          <Route path="travel" element={<FieldTravel />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route
          path="/manager"
          element={
            <Guard role="MANAGER">
              <TopLayout nav={MANAGER_NAV} />
            </Guard>
          }
        >
          <Route index element={<CommandCenter />} />
          <Route path="places" element={<Places />} />
          <Route path="incentives" element={<Incentives />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route
          path="/admin"
          element={
            <Guard role="ADMIN">
              <TopLayout nav={ADMIN_NAV} />
            </Guard>
          }
        >
          <Route index element={<CommandCenter />} />
          <Route path="staff" element={<StaffSetup />} />
          <Route path="places" element={<Places />} />
          <Route path="incentives" element={<Incentives />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route
          path="*"
          element={<Navigate to={user ? homePath(user) : "/login"} replace />}
        />
      </Routes>
    </Suspense>
  );
}
