import axios from "axios";

const configuredBase = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/+$/, "");

export const API_BASE_URL = configuredBase.endsWith("/api") ? configuredBase : `${configuredBase}/api`;
export const SERVER_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("tp_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("tp_token");
      localStorage.removeItem("tp_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const mlApi = axios.create({
  baseURL: import.meta.env.VITE_ML_URL || "http://localhost:8000",
});

export default api;
