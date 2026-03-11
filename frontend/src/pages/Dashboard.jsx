import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Trash2, PlaySquare, X, Plus, Clock, Hash } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
});

// Interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default function Dashboard() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [quizToDelete, setQuizToDelete] = useState(null);
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [newQuiz, setNewQuiz] = useState({
    title: '',
    description: '',
    questions: [
      { text: '', options: ['', ''], correctAnswer: 0, timeLimit: 20, points: 1000 }
    ]
  });

  const addOption = (qIndex) => {
    if (newQuiz.questions[qIndex].options.length >= 6) return alert('Maximum 6 options allowed');
    const updated = [...newQuiz.questions];
    updated[qIndex].options.push('');
    setNewQuiz({ ...newQuiz, questions: updated });
  };

  const removeOption = (qIndex, optIndex) => {
    const q = newQuiz.questions[qIndex];
    if (q.options.length <= 2) return alert('Minimum 2 options required');

    const updated = [...newQuiz.questions];
    updated[qIndex].options.splice(optIndex, 1);

    // Adjust correctAnswer if it was the one removed or is now out of bounds
    if (updated[qIndex].correctAnswer >= updated[qIndex].options.length) {
      updated[qIndex].correctAnswer = 0;
    }

    setNewQuiz({ ...newQuiz, questions: updated });
  };

  const addQuestion = () => {
    setNewQuiz({
      ...newQuiz,
      questions: [
        ...newQuiz.questions,
        { text: '', options: ['', ''], correctAnswer: 0, timeLimit: 20, points: 500 }
      ]
    });
  };

  const removeQuestion = (index) => {
    if (newQuiz.questions.length === 1) return alert('Quiz must have at least one question');
    const updated = newQuiz.questions.filter((_, i) => i !== index);
    setNewQuiz({ ...newQuiz, questions: updated });
  };

  const updateQuestion = (qIndex, field, value) => {
    const updated = [...newQuiz.questions];
    updated[qIndex][field] = value;
    setNewQuiz({ ...newQuiz, questions: updated });
  };

  const updateOption = (qIndex, optIndex, value) => {
    const updated = [...newQuiz.questions];
    updated[qIndex].options[optIndex] = value;
    setNewQuiz({ ...newQuiz, questions: updated });
  };

  const submitNewQuiz = async () => {
    // Basic validation
    if (!newQuiz.title.trim()) return alert('Title is required');
    for (let q of newQuiz.questions) {
      if (!q.text.trim()) return alert('All questions must have text');
      if (q.options.some(opt => !opt.trim())) return alert('All options must be filled');
    }

    // Clean payload for submission
    const payload = {
      title: newQuiz.title,
      description: newQuiz.description,
      questions: newQuiz.questions.map(q => ({
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        timeLimit: q.timeLimit,
        points: q.points
      }))
    };

    try {
      if (newQuiz.id) {
        await api.put(`/quizzes/${newQuiz.id}`, payload);
      } else {
        await api.post('/quizzes', payload);
      }

      setShowQuizForm(false);
      resetQuizForm();
      fetchQuizzes();
    } catch (err) {
      alert('Failed to save quiz');
      console.error(err);
    }
  };

  const resetQuizForm = () => {
    setNewQuiz({
      title: '',
      description: '',
      questions: [{ text: '', options: ['', ''], correctAnswer: 0, timeLimit: 20, points: 500 }]
    });
  };

  const confirmDelete = (quiz) => {
    setQuizToDelete(quiz);
  };

  const deleteQuiz = async () => {
    if (!quizToDelete) return;
    try {
      await api.delete(`/quizzes/${quizToDelete.id}`);
      fetchQuizzes();
      setQuizToDelete(null);
    } catch (err) {
      alert('Failed to delete quiz');
    }
  };

  const editQuiz = async (quizId) => {
    try {
      const { data } = await api.get(`/quizzes/${quizId}`);
      setNewQuiz(data);
      setShowQuizForm(true);
    } catch (err) {
      alert('Failed to load quiz for editing');
    }
  };

  const token = sessionStorage.getItem('token');
  const user = JSON.parse(sessionStorage.getItem('user') || 'null');

  useEffect(() => {
    if (user?.isAdmin) {
      navigate('/admin/dashboard');
      return;
    }

    if (token) {
      fetchQuizzes();
    } else {
      setLoading(false);
    }
  }, [token, navigate, user?.isAdmin]);

  const fetchQuizzes = async () => {
    try {
      const { data } = await api.get('/quizzes');
      setQuizzes(data);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 401) handleLogout();
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setQuizzes([]);
    navigate('/login');
  };

  const createDummyQuiz = async () => {
    try {
      await api.post('/quizzes', {
        title: 'My First Dynamic Quiz',
        description: 'Test your knowledge!',
        questions: [
          {
            text: 'What is the color of the sky?',
            options: ['Red', 'Blue', 'Green', 'Yellow'],
            correctAnswer: 1, // Blue
            timeLimit: 20
          },
          {
            text: 'Which framework is this built with?',
            options: ['Angular', 'Vue', 'React', 'Svelte'],
            correctAnswer: 2, // React
            timeLimit: 20
          }
        ]
      });
      fetchQuizzes();
    } catch (err) {
      alert('Failed to create quiz');
    }
  };

  const launchQuiz = (quizId) => {
    navigate(`/host/${quizId}`);
  };

  if (!token) return null; // Should be handled by ProtectedRoute

  const totalQuestions = quizzes.reduce((acc, quiz) => acc + (quiz._count?.questions || 0), 0);

  return (
    <div className="main-content flex-col items-center min-h-screen slide-up-fade" style={{ paddingTop: '100px', alignItems: 'center', justifyContent: 'flex-start' }}>
      <div className="glass-card" style={{ maxWidth: '1000px', width: '100%', margin: '0 auto', background: 'rgba(255, 255, 255, 0.98)' }}>

        {/* Header Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(0,0,0,0.1)', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="title-xl" style={{ margin: 0, textAlign: 'left', fontWeight: 800 }}>Dashboard</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1.1rem' }}>Manage your quizzes and host live games.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)', padding: '0.5rem 1rem', background: '#f1f5f9', borderRadius: 'var(--radius-full)' }}>
              👋 {user?.username}
            </span>
            <button onClick={handleLogout} className="btn-primary" style={{ padding: '0.5rem 1rem', width: 'auto', background: 'white', color: 'var(--ans-red)', border: '2px solid var(--ans-red)', boxShadow: 'none' }}>
              Logout
            </button>
          </div>
        </div>

        {/* Stats Section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)', padding: '1.5rem', borderRadius: 'var(--radius-md)', color: 'white', boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 500, opacity: 0.9 }}>Total Quizzes</h3>
            <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800 }}>{quizzes.length}</p>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', padding: '1.5rem', borderRadius: 'var(--radius-md)', color: 'white', boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 500, opacity: 0.9 }}>Total Questions</h3>
            <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800 }}>{totalQuestions}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              if (showQuizForm) {
                setShowQuizForm(false);
                resetQuizForm();
              } else {
                resetQuizForm();
                setShowQuizForm(true);
              }
            }}
            className="btn-primary"
            style={{
              width: 'auto',
              background: showQuizForm ? 'white' : 'var(--color-secondary)',
              color: showQuizForm ? 'var(--text-main)' : 'white',
              border: showQuizForm ? '2px solid #e2e8f0' : 'none',
              boxShadow: showQuizForm ? 'none' : '0 4px 10px rgba(14, 165, 233, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {showQuizForm ? (
              <><span style={{ fontSize: '1.2rem' }}>✕</span> Close Editor</>
            ) : (
              <><span style={{ fontSize: '1.2rem' }}>+</span> Create New Quiz</>
            )}
          </button>
        </div>

        {showQuizForm && (
          <div className="slide-up-fade" style={{ background: '#f8fafc', padding: '2.5rem', borderRadius: '16px', marginBottom: '3rem', border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {newQuiz.id ? 'Edit Quiz' : 'Quiz Details'}
              </h3>
              <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)' }}>Configure your quiz settings and add questions below.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Quiz Title (e.g., JavaScript Basics)"
                value={newQuiz.title}
                onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })}
                style={{ background: 'white', fontSize: '1.25rem', fontWeight: 600, padding: '1.25rem' }}
              />
              <textarea
                className="input-field"
                placeholder="Quiz Description (optional)"
                value={newQuiz.description}
                onChange={(e) => setNewQuiz({ ...newQuiz, description: e.target.value })}
                style={{ background: 'white', minHeight: '100px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Questions</h3>
              <span style={{ background: 'var(--color-primary)', color: 'white', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)', fontSize: '0.875rem', fontWeight: 600 }}>
                {newQuiz.questions.length} Total
              </span>
            </div>
            {newQuiz.questions.map((q, qIndex) => (
              <div key={qIndex} style={{ background: 'white', padding: '2rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ background: '#e0e7ff', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '0.9rem' }}>{qIndex + 1}</span>
                    Question
                  </h4>
                  <button onClick={() => removeQuestion(qIndex)} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#fee2e2', border: 'none', color: 'var(--ans-red)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#fecaca'} onMouseLeave={e => e.currentTarget.style.background = '#fee2e2'}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>

                <input
                  type="text"
                  className="input-field"
                  placeholder="Type your question here..."
                  value={q.text}
                  onChange={(e) => updateQuestion(qIndex, 'text', e.target.value)}
                  style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  {q.options.map((opt, optIndex) => (
                    <div key={optIndex} style={{ display: 'flex', position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%', background: q.correctAnswer === optIndex ? '#f0fdf4' : '#f8fafc', border: `2px solid ${q.correctAnswer === optIndex ? 'var(--ans-green)' : '#e2e8f0'}`, borderRadius: 'var(--radius-md)', padding: '0.5rem', transition: 'all 0.2s' }}>
                        <input
                          type="radio"
                          name={`correct-${qIndex}`}
                          checked={q.correctAnswer === optIndex}
                          onChange={() => updateQuestion(qIndex, 'correctAnswer', optIndex)}
                          style={{ margin: '0 1rem 0 0.5rem', width: '1.25rem', height: '1.25rem', cursor: 'pointer', accentColor: 'var(--ans-green)' }}
                          title="Mark as correct answer"
                        />
                        <input
                          type="text"
                          className="input-field"
                          placeholder={`Option ${optIndex + 1}`}
                          value={opt}
                          onChange={(e) => updateOption(qIndex, optIndex, e.target.value)}
                          style={{ marginBottom: 0, border: 'none', background: 'transparent', padding: '0.5rem', flex: 1 }}
                        />
                        {q.options.length > 2 && (
                          <button
                            onClick={() => removeOption(qIndex, optIndex)}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 0.5rem' }}
                            title="Remove option"
                          >
                            <X size={20} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {q.options.length < 6 && (
                    <button
                      onClick={() => addOption(qIndex)}
                      style={{ gridColumn: 'span 2', background: 'white', border: '2px dashed #cbd5e1', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--color-primary)', padding: '1rem', fontSize: '1.1rem', fontWeight: 700, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
                    >
                      <span style={{ fontSize: '1.5rem' }}>+</span> Add Another Option
                    </button>
                  )}
                </div>
                <div className="grid-mobile-stack" style={{ display: 'flex', alignItems: 'center', gap: '2rem', background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Time Limit (sec)</label>
                    <input
                      type="number"
                      value={q.timeLimit}
                      onChange={(e) => updateQuestion(qIndex, 'timeLimit', parseInt(e.target.value) || 20)}
                      min="5" max="120"
                      className="input-field"
                      style={{ width: '100px', marginBottom: 0, padding: '0.5rem', textAlign: 'center' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Points</label>
                    <input
                      type="number"
                      value={q.points}
                      onChange={(e) => updateQuestion(qIndex, 'points', parseInt(e.target.value) || 1000)}
                      step="100" min="0" max="2000"
                      className="input-field"
                      style={{ width: '120px', marginBottom: 0, padding: '0.5rem', textAlign: 'center' }}
                    />
                  </div>
                </div>
              </div>
            ))}

            <button onClick={addQuestion} className="btn-primary" style={{ background: '#f1f5f9', color: 'var(--color-primary)', border: '2px dashed var(--color-primary)', boxShadow: 'none', marginBottom: '2rem', width: '100%', padding: '1.5rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, marginRight: '0.5rem' }}>+</span> Add New Question
            </button>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button onClick={() => { setShowQuizForm(false); resetQuizForm(); }} className="btn-primary" style={{ width: 'auto', background: 'white', color: 'var(--text-main)', border: '1px solid #cbd5e1', boxShadow: 'none' }}>
                Cancel
              </button>
              <button onClick={submitNewQuiz} className="btn-primary" style={{ width: 'auto', background: 'var(--ans-green)', boxShadow: '0 4px 14px rgba(22, 101, 52, 0.4)' }}>
                {newQuiz.id ? 'Save Changes' : 'Publish Quiz'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading your quizzes...</p>
        ) : (
          <div>
            {quizzes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '2px dashed #cbd5e1' }}>
                <h3 style={{ color: 'var(--text-muted)' }}>No quizzes found.</h3>
                <p style={{ color: '#94a3b8' }}>Click the "Create New Quiz" button above to get started!</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {quizzes.map(quiz => (
                  <div key={quiz.id} style={{
                    background: 'white',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.1)',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    transition: 'transform 0.2s',
                    cursor: 'default'
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <div style={{ padding: '1.5rem', flex: 1 }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <PlaySquare size={20} style={{ color: 'var(--color-primary)' }} />
                        {quiz.title}
                      </h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{quiz._count?.questions || 0} Questions</span> • Created {new Date(quiz.createdAt).toLocaleDateString()}
                      </p>
                      {quiz.description && <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.75rem' }}>{quiz.description}</p>}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem', borderTop: '1px solid #f1f5f9', background: 'white', gap: '0.75rem' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); editQuiz(quiz.id); }}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#e0f2fe'; e.currentTarget.style.color = 'var(--ans-blue)'; e.currentTarget.style.borderColor = '#bae6fd'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                        title="Edit Quiz"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDelete(quiz); }}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = 'var(--ans-red)'; e.currentTarget.style.borderColor = '#fecaca'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                        title="Delete Quiz"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); launchQuiz(quiz.id); }}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--ans-green)', border: 'none', color: 'white', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(22,101,52,0.2)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(22,101,52,0.3)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(22,101,52,0.2)'; }}
                        title="Host Game"
                      >
                        <PlaySquare size={18} fill="white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Delete Modal */}
      {quizToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="pop-in" style={{ background: 'white', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ background: '#fee2e2', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1.5rem auto' }}>
              <Trash2 size={32} color="#ef4444" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-main)' }}>Delete Quiz?</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{quizToDelete.title}</strong>? This action cannot be undone and all questions will be lost.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setQuizToDelete(null)}
                className="btn-primary"
                style={{ background: '#f1f5f9', color: 'var(--text-main)', border: '1px solid #e2e8f0', boxShadow: 'none' }}
              >
                Cancel
              </button>
              <button
                onClick={deleteQuiz}
                className="btn-primary"
                style={{ background: '#ef4444', color: 'white', border: 'none', boxShadow: '0 4px 0 #b91c1c' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
