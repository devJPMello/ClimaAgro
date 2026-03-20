import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import InteractiveMap from './components/InteractiveMap';
import ProductivityMap from './components/ProductivityMap';
import TimeSeriesPage from './components/TimeSeriesPage';
import WeatherAlerts from './components/WeatherAlerts';
import ClimateAlerts from './components/ClimateAlerts';
import ExportReport from './components/ExportReport';
import Profile from './components/Profile';
import EditProfile from './components/EditProfile';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/map" 
              element={
                <ProtectedRoute>
                  <InteractiveMap />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/productivity-map" 
              element={
                <ProtectedRoute>
                  <ProductivityMap />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/time-series" 
              element={
                <ProtectedRoute>
                  <TimeSeriesPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/alerts" 
              element={
                <ProtectedRoute>
                  <ClimateAlerts alerts={[]} />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/export" 
              element={
                <ProtectedRoute>
                  <ExportReport />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/edit-profile" 
              element={
                <ProtectedRoute>
                  <EditProfile />
                </ProtectedRoute>
              } 
            />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;
