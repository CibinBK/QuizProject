import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const [pin, setPin] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    if (pin.trim()) {
      navigate(`/play/${pin}`);
    }
  };

  const handleMouseMove = (e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <div 
      className="main-content flex-col items-center justify-center min-h-screen text-center" 
      style={{ position: 'relative', width: '100%', overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
      ref={containerRef}
    >
      
      {/* Interactive Mouse Glow */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, rgba(14, 165, 233, 0) 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
          transform: `translate(${mousePosition.x - 200}px, ${mousePosition.y - 200}px)`,
          transition: 'transform 0.1s ease-out',
          zIndex: 1,
        }}
      />

      {/* Animated Background Shapes */}
      <div className="bg-shape shape-1"></div>
      <div className="bg-shape shape-2"></div>
      <div className="bg-shape shape-3"></div>

      {/* Hero Section */}
      <div className="slide-up-fade" style={{ zIndex: 10, marginBottom: '3rem', paddingTop: '60px' }}>
        <h1 
          className="title-xl text-gradient pop-in" 
          style={{ fontSize: '4.5rem', marginBottom: '1rem', letterSpacing: '-2px' }}
        >
          Quizy<span style={{ color: 'var(--color-main)' }}>.</span>
        </h1>
        <p className="subtitle max-w-2xl mx-auto" style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.8)' }}>
          The interactive learning platform where engagement meets competition.
          Join a game below to get started!
        </p>
      </div>

      {/* Join Game Card */}
      <div 
        className="glass-card slide-up-fade" 
        style={{ 
          maxWidth: '450px', 
          zIndex: 10, 
          animationDelay: '0.2s',
          transform: isHovered ? 'translateY(-5px)' : 'translateY(0)',
          transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease',
          boxShadow: isHovered ? '0 20px 40px rgba(0,0,0,0.2), 0 0 40px rgba(14, 165, 233, 0.2)' : 'var(--shadow-md)'
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text-main)' }}>
          Join a Game
        </h2>
        
        <form onSubmit={handleJoin}>
          <input
            type="text"
            className="input-field text-center"
            placeholder="Enter Game PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            maxLength={6}
            style={{ 
              fontSize: '1.75rem', 
              letterSpacing: '4px',
              padding: '1.25rem',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'rgba(255,255,255,0.8)',
              position: 'relative',
              zIndex: 2
            }}
          />
          
          <button 
            type="submit" 
            className="btn-primary hover-gradient-btn" 
            disabled={pin.length < 5}
            style={{ 
              padding: '1.25rem', 
              fontSize: '1.25rem',
              borderRadius: 'var(--radius-lg)',
              position: 'relative',
              zIndex: 2
            }}
          >
            Enter Game
          </button>
        </form>
      </div>
    </div>
  );
}
