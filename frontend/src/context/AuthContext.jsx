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

  const persistSession = (data) => {
    if (!data || data.success === false || !data.token || !data.user) {
      const message = (data && data.message) || "Authentication failed. Please try again.";
      const error = new Error(message);
      error.response = { data: { message, code: data && data.code } };
      throw error;
    }
    localStorage.setItem("tp_token", data.token);
    localStorage.setItem("tp_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    // Login is a two-step flow: credentials are checked, then an emailed OTP
    // confirms the session. No token is issued until the OTP is verified.
    if (!data?.requiresOtp || !data.challenge) {
      const message = data?.message || "Login did not return a verification step. Please try again.";
      const error = new Error(message);
      error.response = { data: { message, code: data?.code } };
      throw error;
    }
    return {
      requiresOtp: true,
      challenge: data.challenge,
      email: data.email,
      expiresInSeconds: data.expiresInSeconds,
      message: data.message,
    };
  };

  const verifyLoginOtp = async (challenge, otp) => {
    const { data } = await api.post("/auth/verify-login-otp", { challenge, otp });
    return persistSession(data);
  };

  const resendLoginOtp = async (challenge) => {
    const { data } = await api.post("/auth/resend-login-otp", { challenge });
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.requiresEmailVerification) {
      return { requiresEmailVerification: true, email: data.email, emailDelivered: data.emailDelivered, message: data.message };
    }
    return { requiresEmailVerification: false, user: persistSession(data) };
  };

  const verifyEmail = async (email, code) => {
    const { data } = await api.post("/auth/verify-email", { email, code });
    return persistSession(data);
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
      <AuthContext.Provider value={{ user, loading, login, verifyLoginOtp, resendLoginOtp, register, verifyEmail, resendVerification, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
