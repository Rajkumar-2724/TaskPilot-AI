import { createContext, useContext, useEffect, useState } from "react";
import api from "../services/api.js";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("tp_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("tp_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem("tp_user", JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem("tp_token");
        localStorage.removeItem("tp_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("tp_token", data.token);
    localStorage.setItem("tp_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.requiresEmailVerification) {
      return { requiresEmailVerification: true, email: data.email, emailDelivered: data.emailDelivered, message: data.message };
    }
    localStorage.setItem("tp_token", data.token);
    localStorage.setItem("tp_user", JSON.stringify(data.user));
    setUser(data.user);
    return { requiresEmailVerification: false, user: data.user };
  };

  const verifyEmail = async (email, code) => {
    const { data } = await api.post("/auth/verify-email", { email, code });
    localStorage.setItem("tp_token", data.token);
    localStorage.setItem("tp_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const resendVerification = async (email) => {
    const { data } = await api.post("/auth/resend-verification", { email });
    return data;
  };

  const logout = () => {
    localStorage.removeItem("tp_token");
    localStorage.removeItem("tp_user");
    setUser(null);
  };

  const updateUser = (updated) => {
    setUser(updated);
    localStorage.setItem("tp_user", JSON.stringify(updated));
  };

  return (
      <AuthContext.Provider value={{ user, loading, login, register, verifyEmail, resendVerification, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
