import { Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { SocketProvider } from "./context/SocketContext.jsx";
import { DashboardProvider } from "./context/DashboardContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";

import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import NotFound from "./pages/NotFound.jsx";
import Unauthorized from "./pages/Unauthorized.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import RecentActivity from "./pages/RecentActivity.jsx";
import Projects from "./pages/Projects.jsx";
import ProjectHistory from "./pages/ProjectHistory.jsx";
import ProjectDetails from "./pages/ProjectDetails.jsx";
import Tasks from "./pages/Tasks.jsx";
import TaskDetails from "./pages/TaskDetails.jsx";
import TaskHistory from "./pages/TaskHistory.jsx";
import Overdue from "./pages/Overdue.jsx";
import Kanban from "./pages/Kanban.jsx";
import Calendar from "./pages/Calendar.jsx";
import Gantt from "./pages/Gantt.jsx";
import Chat from "./pages/Chat.jsx";
import AIAssistant from "./pages/AIAssistant.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import Profile from "./pages/Profile.jsx";
import Admin from "./pages/Admin.jsx";
import MonitoringDashboard from "./pages/MonitoringDashboard.jsx";
import CostPredictionPage from "./pages/CostPredictionPage.jsx";
import TimePredictionPage from "./pages/TimePredictionPage.jsx";
import RiskScoringPage from "./pages/RiskScoringPage.jsx";
import AlertsPage from "./pages/AlertsPage.jsx";
import BenchmarkingPage from "./pages/BenchmarkingPage.jsx";
import SimulationPage from "./pages/SimulationPage.jsx";
import ProjectAnalysis from "./pages/ProjectAnalysis.jsx";
import DataSufficiency from "./pages/DataSufficiency.jsx";
import ModelEvaluation from "./pages/ModelEvaluation.jsx";
import ProjectImport from "./pages/ProjectImport.jsx";


function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <DashboardProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/unauthorized" element={<Unauthorized />} />

              <Route path="/app" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="recent" element={<RecentActivity />} />
                <Route path="monitoring" element={<MonitoringDashboard />} />
                <Route path="import" element={<ProjectImport />} />
                <Route path="data-sufficiency" element={<DataSufficiency />} />
                <Route path="model-evaluation" element={<ModelEvaluation />} />
                <Route path="cost-prediction" element={<CostPredictionPage />} />
                <Route path="time-prediction" element={<TimePredictionPage />} />
                <Route path="risk-scoring" element={<RiskScoringPage />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="benchmarking" element={<BenchmarkingPage />} />
                <Route path="simulation" element={<SimulationPage />} />
                <Route path="ai-assistant" element={<AIAssistant />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/history" element={<ProjectHistory />} />
                <Route path="projects/:id" element={<ProjectDetails />} />
                <Route path="projects/:id/analysis" element={<ProjectAnalysis />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="tasks/history" element={<TaskHistory />} />
                <Route path="tasks/:id" element={<TaskDetails />} />
                <Route path="overdue" element={<Overdue />} />
                <Route path="kanban" element={<Kanban />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="gantt" element={<Gantt />} />
                <Route path="chat" element={<Chat />} />
                                <Route path="leaderboard" element={<Leaderboard />} />
                <Route path="profile" element={<Profile />} />
                <Route path="admin" element={<ProtectedRoute roles={["Admin"]}><Admin /></ProtectedRoute>} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            <ToastContainer position="top-right" autoClose={3000} theme="colored" />
          </DashboardProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;