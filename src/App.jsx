import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ReactKeycloakProvider } from "@react-keycloak/web";
import keycloak from "./lib/keycloak";

// Eager load critical public routes (Shortlink resolver & Landing) for instant first paint
import SmartLink from "./Page/SmartLink";
import Landing from "./Page/Landing";
import CallbackSSO from "./Page/CallbackSSO";
import Callback from "./Page/Callback";
import NotFoundRoute from "./Page/NotFoundRoute";
import ProtectedRoute from "./Components/ProtectedRoute";

// Lazy load heavy authenticated pages (Charts, GeoMap, QR Studio, SweetAlert)
const Template = lazy(() => import("./Template/Template"));
const Dashboard = lazy(() => import("./Page/Dashboard"));
const LinkPage = lazy(() => import("./Page/LinkPage"));

import { ToastProvider } from "./Providers/ToastProvider";
import { AuthProvider } from "./Providers/AuthProvider";
import { SidebarProvider } from "./Providers/SidebarProvider";

function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-9 h-9 border-4 border-[#49318f]/20 border-t-[#49318f] rounded-full animate-spin"></div>
    </div>
  );
}

export default function App() {
  const savedToken = localStorage.getItem("token");
  const savedRefresh = localStorage.getItem("refresh");
  const savedIdToken = localStorage.getItem("idToken");

  const initOptions = {
    checkLoginIframe: false,
    pkceMethod: "S256",
    ...(savedToken && savedRefresh
      ? {
          token: savedToken,
          refreshToken: savedRefresh,
          idToken: savedIdToken || undefined,
        }
      : {}),
  };

  return (
    <ReactKeycloakProvider
      authClient={keycloak}
      initOptions={initOptions}
      onTokens={(tokens) => {
        if (tokens?.token) {
          localStorage.setItem("token", tokens.token);
        }
        if (tokens?.idToken) {
          localStorage.setItem("idToken", tokens.idToken);
        }
        if (tokens?.refreshToken) {
          localStorage.setItem("refresh", tokens.refreshToken);
        }
      }}
    >
      <SidebarProvider>
        <AuthProvider>
          <ToastProvider>
            <Router>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Landing />} />

                  <Route path="/callback" element={<Callback />} />
                  <Route path="/callback_sso" element={<CallbackSSO />} />
                  <Route path="/:shorturl" element={<SmartLink />} />

                  <Route element={<ProtectedRoute />}>
                    <Route element={<Template />}>
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/link" element={<LinkPage />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFoundRoute />} />
                </Routes>
              </Suspense>
            </Router>
          </ToastProvider>
        </AuthProvider>
      </SidebarProvider>
    </ReactKeycloakProvider>
  );
}
