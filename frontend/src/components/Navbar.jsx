import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './Navbar.css';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const userStr = sessionStorage.getItem('user');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isAdmin = currentUser?.isAdmin;

  // Handle scroll effect for glassmorphism
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Hide Navbar completely on game screens
  if (location.pathname.startsWith('/play') || location.pathname.startsWith('/host')) {
    return null;
  }

  return (
    <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
      <div className="navbar-container">
        {/* Logo */}
        <Link to="/" className="navbar-logo">
          Quizy<span className="logo-dot">.</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="nav-links">
          <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>Home</Link>
          <Link to="/features" className={`nav-link ${location.pathname === '/features' ? 'active' : ''}`}>Features</Link>
          <Link to="/about" className={`nav-link ${location.pathname === '/about' ? 'active' : ''}`}>About</Link>
        </div>

        {/* Desktop CTA */}
        <div className="nav-cta">
          {isAdmin ? (
            <Link to="/admin/dashboard" className="btn-nav">Admin Portal</Link>
          ) : (
            <Link to="/dashboard" className="btn-nav">Host Game</Link>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className={`hamburger ${isMobileMenuOpen ? 'active' : ''}`}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className="bar"></span>
          <span className="bar"></span>
          <span className="bar"></span>
        </button>
      </div>

      {/* Mobile Menu overlay */}
      <div className={`mobile-menu ${isMobileMenuOpen ? 'active' : ''}`}>
        <Link to="/" className={`mobile-link ${location.pathname === '/' ? 'active' : ''}`}>Home</Link>
        <Link to="/features" className={`mobile-link ${location.pathname === '/features' ? 'active' : ''}`}>Features</Link>
        <Link to="/about" className={`mobile-link ${location.pathname === '/about' ? 'active' : ''}`}>About</Link>
        {isAdmin ? (
          <Link to="/admin/dashboard" className="mobile-btn">Admin Portal</Link>
        ) : (
          <Link to="/dashboard" className="mobile-btn">Host Game</Link>
        )}
      </div>
    </nav>
  );
}
