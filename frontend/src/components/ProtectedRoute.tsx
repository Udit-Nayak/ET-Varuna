import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { isProfileReady, useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isProfileReady(profile) && location.pathname !== "/profile") {
    return <Navigate to="/profile?setup=1" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
