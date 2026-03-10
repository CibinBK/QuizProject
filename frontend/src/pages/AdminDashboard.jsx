import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Trash2, Users, FileText, Edit2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
});

function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [quizToDelete, setQuizToDelete] = useState(null);
  const [userToEdit, setUserToEdit] = useState(null);
  const [editRole, setEditRole] = useState(false);

  const navigate = useNavigate();
  const token = sessionStorage.getItem('token');
  const userStr = sessionStorage.getItem('user');
  const currentUser = useMemo(() => userStr ? JSON.parse(userStr) : null, [userStr]);

  useEffect(() => {
    if (!token || !currentUser || !currentUser.isAdmin) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const config = { headers: { Authorization: `Bearer ${token}` } };

        const [usersRes, quizzesRes] = await Promise.all([
          axios.get(`${API_URL}/api/admin/users`, config),
          axios.get(`${API_URL}/api/admin/quizzes`, config)
        ]);

        setUsers(usersRes.data);
        setQuizzes(quizzesRes.data);
      } catch (err) {
        console.error('Admin fetch error', err);
        setError('Failed to load admin data. ensure you have admin rights.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, navigate, currentUser]);

  const promptDeleteUser = (u) => {
    if (u.id === currentUser.id) {
      alert("You cannot delete your own admin account.");
      return;
    }
    setUserToDelete(u);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await axios.delete(`${API_URL}/api/admin/users/${userToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(users.filter(u => u.id !== userToDelete.id));
      const quizzesRes = await axios.get(`${API_URL}/api/admin/quizzes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuizzes(quizzesRes.data);
      setUserToDelete(null);
    } catch (err) {
      alert('Failed to delete user.');
    }
  };

  const promptEditUser = (u) => {
    if (u.id === currentUser.id) {
      alert("You cannot edit your own master role here.");
      return;
    }
    setUserToEdit(u);
    setEditRole(u.isAdmin);
  };

  const confirmEditUser = async () => {
    if (!userToEdit) return;
    try {
      const { data } = await axios.put(`${API_URL}/api/admin/users/${userToEdit.id}`,
        { isAdmin: editRole },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers(users.map(u => u.id === data.id ? { ...u, isAdmin: data.isAdmin } : u));
      setUserToEdit(null);
    } catch (err) {
      alert('Failed to update user role.');
    }
  };

  const promptDeleteQuiz = (q) => {
    setQuizToDelete(q);
  };

  const confirmDeleteQuiz = async () => {
    if (!quizToDelete) return;
    try {
      await axios.delete(`${API_URL}/api/admin/quizzes/${quizToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuizzes(quizzes.filter(q => q.id !== quizToDelete.id));

      const usersRes = await axios.get(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(usersRes.data);
      setQuizToDelete(null);
    } catch (err) {
      alert('Failed to delete quiz.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  };

  if (loading) {
    return <div className="main-content flex-col items-center justify-center min-h-screen"><h2 style={{ color: 'white' }}>Loading Admin Portal...</h2></div>;
  }

  return (
    <div className="main-content flex-col min-h-screen" style={{ paddingTop: '4rem', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '2rem' }}>
        <div>
          <h1 className="title-xl" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Admin Dashboard</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.2rem' }}>Welcome, Master {currentUser?.username}</p>
        </div>
        <button onClick={handleLogout} className="btn-primary" style={{ width: 'auto', background: 'white', color: 'var(--color-primary)' }}>
          Logout
        </button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', width: '100%' }}>{error}</div>}

      <div className="glass-card" style={{ width: '100%', maxWidth: '1000px', padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{ flex: 1, padding: '1rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeTab === 'users' ? 'var(--color-primary)' : 'rgba(255,255,255,0.5)', color: activeTab === 'users' ? 'white' : 'var(--text-main)', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <Users size={20} /> Manage Hosts
        </button>
        <button
          onClick={() => setActiveTab('quizzes')}
          style={{ flex: 1, padding: '1rem', borderRadius: 'var(--radius-md)', border: 'none', background: activeTab === 'quizzes' ? 'var(--color-primary)' : 'rgba(255,255,255,0.5)', color: activeTab === 'quizzes' ? 'white' : 'var(--text-main)', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <FileText size={20} /> Manage Quizzes
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="glass-card" style={{ width: '100%', maxWidth: '1000px', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-main)' }}>Registered Users ({users.length})</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>ID</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Username</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Role</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Quizzes Hosted</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Created</th>
                  <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontSize: '0.9rem', color: '#94a3b8' }}>{u.id.substring(0, 8)}...</td>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{u.username}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ background: u.isAdmin ? '#dbeafe' : '#f1f5f9', color: u.isAdmin ? '#1e40af' : '#64748b', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                        {u.isAdmin ? 'Admin' : 'Host'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>{u._count.quizzes}</td>
                    <td style={{ padding: '1rem' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => promptEditUser(u)}
                        disabled={u.id === currentUser.id}
                        style={{ background: '#e0f2fe', color: '#0ea5e9', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: u.id === currentUser.id ? 'not-allowed' : 'pointer', opacity: u.id === currentUser.id ? 0.5 : 1 }}
                        title="Edit Role"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => promptDeleteUser(u)}
                        disabled={u.isAdmin}
                        style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: u.isAdmin ? 'not-allowed' : 'pointer', opacity: u.isAdmin ? 0.5 : 1 }}
                        title="Delete Host"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'quizzes' && (
        <div className="glass-card" style={{ width: '100%', maxWidth: '1000px', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text-main)' }}>All Quizzes ({quizzes.length})</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Quiz ID</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Title</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Host</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Questions</th>
                  <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map(q => (
                  <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontSize: '0.9rem', color: '#94a3b8' }}>{q.id.substring(0, 8)}...</td>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{q.title}</td>
                    <td style={{ padding: '1rem' }}>{q.host.username}</td>
                    <td style={{ padding: '1rem' }}>{q._count.questions}</td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => promptDeleteQuiz(q)}
                        style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}
                        title="Delete Globally"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {userToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="pop-in" style={{ background: 'white', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ background: '#fee2e2', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1.5rem auto' }}>
              <Trash2 size={32} color="#ef4444" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-main)' }}>Delete Host?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
              Are you sure you want to delete host <strong>{userToDelete.username}</strong> and ALL of their quizzes? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setUserToDelete(null)} className="btn-primary" style={{ background: '#f1f5f9', color: 'var(--text-main)', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                Cancel
              </button>
              <button onClick={confirmDeleteUser} className="btn-primary" style={{ background: '#ef4444', color: 'white', border: 'none', boxShadow: '0 4px 0 #b91c1c' }}>
                Delete Host
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {userToEdit && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="pop-in" style={{ background: 'white', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ background: '#e0f2fe', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1.5rem auto' }}>
              <Edit2 size={32} color="#0ea5e9" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-main)' }}>Edit User Role</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Change the role for <strong>{userToEdit.username}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem', textAlign: 'left' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: !editRole ? '#f0fdf4' : '#f8fafc', border: `2px solid ${!editRole ? 'var(--ans-green)' : '#e2e8f0'}`, padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <input type="radio" checked={!editRole} onChange={() => setEditRole(false)} style={{ accentColor: 'var(--ans-green)', width: '1.25rem', height: '1.25rem' }} />
                <div>
                  <div style={{ fontWeight: 700 }}>Host</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Can create and host quizzes</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: editRole ? '#eff6ff' : '#f8fafc', border: `2px solid ${editRole ? 'var(--color-primary)' : '#e2e8f0'}`, padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <input type="radio" checked={editRole} onChange={() => setEditRole(true)} style={{ accentColor: 'var(--color-primary)', width: '1.25rem', height: '1.25rem' }} />
                <div>
                  <div style={{ fontWeight: 700 }}>Admin</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Can manage all users and global quizzes</div>
                </div>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setUserToEdit(null)} className="btn-primary" style={{ background: '#f1f5f9', color: 'var(--text-main)', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                Cancel
              </button>
              <button onClick={confirmEditUser} className="btn-primary" style={{ background: 'var(--color-primary)', color: 'white', border: 'none', boxShadow: '0 4px 0 #0284c7' }}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Quiz Modal */}
      {quizToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="pop-in" style={{ background: 'white', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ background: '#fee2e2', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1.5rem auto' }}>
              <Trash2 size={32} color="#ef4444" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-main)' }}>Delete Quiz?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
              Are you sure you want to forcefully delete the quiz <strong>{quizToDelete.title}</strong> globally?
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setQuizToDelete(null)} className="btn-primary" style={{ background: '#f1f5f9', color: 'var(--text-main)', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                Cancel
              </button>
              <button onClick={confirmDeleteQuiz} className="btn-primary" style={{ background: '#ef4444', color: 'white', border: 'none', boxShadow: '0 4px 0 #b91c1c' }}>
                Delete globally
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
