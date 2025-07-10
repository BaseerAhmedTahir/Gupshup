import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginForm from './components/Auth/LoginForm';
import SignUpForm from './components/Auth/SignUpForm';
import Layout from './components/Layout/Layout';

const AuthWrapper: React.FC = () => {
  const { user, loading } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        {showSignUp ? (
          <SignUpForm onToggleForm={() => setShowSignUp(false)} />
        ) : (
          <LoginForm onToggleForm={() => setShowSignUp(true)} />
        )}
      </div>
    );
  }

  return <Layout />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AuthWrapper />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
        }}
      />
    </AuthProvider>
  );
};

export default App;