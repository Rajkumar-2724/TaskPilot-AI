import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: { port: 5173 },
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(env.VITE_API_URL || process.env.VITE_API_URL || "http://localhost:5000/api"),
      "import.meta.env.VITE_SOCKET_URL": JSON.stringify(env.VITE_SOCKET_URL || process.env.VITE_SOCKET_URL || "http://localhost:5000"),
      "import.meta.env.VITE_ML_URL": JSON.stringify(env.VITE_ML_URL || process.env.VITE_ML_URL || "http://localhost:8000"),
    },
  };
});

