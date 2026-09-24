import { createContext, useContext, useState, useCallback } from "react";

const DashboardContext = createContext();

export const DashboardProvider = ({ children }) => {
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <DashboardContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboardRefresh = () => useContext(DashboardContext);