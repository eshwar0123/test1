import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { GoogleOAuthProvider } from "@react-oauth/google";

import "@coreui/coreui/dist/css/coreui.min.css";
import "core-js";

import App from "./App";
import store from "./store";
import { UserProvider } from "./context/UserContext";

/* ---------------- GOOGLE CLIENT ID ---------------- */
const GOOGLE_CLIENT_ID =
  "750790396638-1a597lnsvodada022jrch4jrb1cjfpvi.apps.googleusercontent.com";

/* ---------------- ROOT RENDER ---------------- */
const root = createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <UserProvider>
          <App />
        </UserProvider>
      </GoogleOAuthProvider>
    </Provider>
  </React.StrictMode>
);
