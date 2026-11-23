// Callback.jsx

import keycloak from "@/lib/keycloak";
import { useEffect } from "react";

export default function Callback() {
  useEffect(() => {
    document.title = "Autentikasi SSO — UnpakLink";
    keycloak.login({
      redirectUri: window.location.origin + "/callback_sso",
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      Processing SSO Login...
    </div>
  );
}
