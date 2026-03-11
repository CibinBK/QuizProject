import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Features from './pages/Features';
import About from './pages/About';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import GameHost from './pages/GameHost';
import GamePlayer from './pages/GamePlayer';
import './index.css';

// Simple Route Protection Wrapper
const ProtectedRoute = ({ children }) => {
  const token = sessionStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main className="main-content-wrapper">
          <Routes>
            {/* Player enters PIN here */}
            <Route path="/" element={<Home />} />
            <Route path="/join" element={<Home />} />

            <Route path="/features" element={<Features />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />

            {/* Host Dashboard to create/launch quizzes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* Host view of an active game session */}
            <Route
              path="/host/:pin"
              element={
                <ProtectedRoute>
                  <GameHost />
                </ProtectedRoute>
              }
            />

            {/* Player view of an active game session */}
            <Route path="/play/:pin" element={<GamePlayer />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
