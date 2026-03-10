import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
});

export default function Login() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLoginView ? '/auth/login' : '/auth/register';
      const { data } = await api.post(endpoint, { username, password });
      sessionStorage.setItem('token', data.token);
      sessionStorage.setItem('user', JSON.stringify(data.user));

      if (data.user.isAdmin) {
        navigate('/admin/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed. Please check your credentials.');
      // clear error after 5s
      setTimeout(() => setError(''), 5000);
    }
  };

  return (
    <div className="main-content flex-col items-center justify-center min-h-screen text-center slide-up-fade" style={{ paddingTop: '100px' }}>
      <div className="glass-card" style={{ maxWidth: '400px', width: '100%', margin: '0 auto' }}>
        <h2 className="title-xl">{isLoginView ? 'Host Login' : 'Host Register'}</h2>

        {error && (
          <div className="pop-in" style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginTop: '1rem', fontSize: '0.9rem', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ marginTop: '1.5rem' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            className="input-field"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary" style={{ marginBottom: '1rem' }}>
            {isLoginView ? 'Login' : 'Register'}
          </button>
        </form>
        <p style={{ textAlign: 'center', cursor: 'pointer', color: 'var(--color-secondary)' }} onClick={() => setIsLoginView(!isLoginView)}>
          {isLoginView ? 'Need an account? Register' : 'Have an account? Login'}
        </p>
      </div>
    </div>
  );
}
