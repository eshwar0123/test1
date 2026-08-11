import axios from "axios";

/* =========================
   AXIOS INSTANCE
   ========================= */
const api = axios.create({
  baseURL: "/api",
  withCredentials: false,
});

/* =========================
   REQUEST INTERCEPTOR
   Attach JWT automatically
   ========================= */
api.interceptors.request.use(
  (config) => {
    try {
      const auth = JSON.parse(localStorage.getItem("auth"));

      if (auth?.token) {
        config.headers.Authorization = `Bearer ${auth.token}`;
      }
    } catch {}

    // IMPORTANT: let browser set multipart boundary
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    } else {
      config.headers["Content-Type"] = "application/json";
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/* =========================
   RESPONSE INTERCEPTOR
   Smart auto logout
   ========================= */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";

    // logout ONLY if auth APIs fail
    const isAuthRequest =
      url.includes("/login") ||
      url.includes("/me") ||
      url.includes("/profile");

    if (status === 401 && isAuthRequest) {
      console.warn("Session expired — redirecting to login");

      localStorage.clear();
      window.location.href = "/login";
    }

    // otherwise just reject error (viewer can handle)
    return Promise.reject(error);
  }
);

export default api;
