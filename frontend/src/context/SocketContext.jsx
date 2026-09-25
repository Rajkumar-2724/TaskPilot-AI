import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext.jsx";
import { toast } from "react-toastify";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?._id || null;
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem("tp_token");
    if (!userId || !token) {
      setSocket(null);
      setConnected(false);
      return;
    }

    console.log(`[Socket:client] Connecting to ${SOCKET_URL} as ${userId}`);

    const instance = io(SOCKET_URL, {
      auth: { token },
      withCredentials: true,
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });

    setSocket(instance);

    instance.on("connect", () => {
      console.log(`[Socket:client] Connected id=${instance.id} transport=${instance.io.engine.transport.name}`);
      setConnected(true);
    });

    instance.on("disconnect", (reason) => {
      console.warn(`[Socket:client] Disconnected reason=${reason}`);
      setConnected(false);
    });

    instance.on("connect_error", (err) => {
      console.error(`[Socket:client] Connection error: ${err.message}`);
    });

    instance.io.on("reconnect_attempt", (n) => {
      console.warn(`[Socket:client] Reconnect attempt ${n}`);
    });

    instance.on("notification:new", (n) => {
      setNotifications((prev) => [n, ...prev]);
      toast.info(n.message);
    });

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket, connected, notifications, setNotifications }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
