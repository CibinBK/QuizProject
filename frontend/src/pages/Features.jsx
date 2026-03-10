export default function Features() {
  return (
    <div className="main-content flex-col items-center justify-center min-h-screen text-center slide-up-fade" style={{ paddingTop: '100px' }}>
      <h1 className="title-xl text-gradient">Features</h1>
      <p className="subtitle max-w-2xl mx-auto mt-4" style={{ color: 'rgba(255,255,255,0.8)' }}>
        Discover what makes Quizy the ultimate interactive learning platform.
        Engaging quizzes, real-time leaderboards, and powerful moderation tools.
      </p>
      
      <div className="glass-card mt-12" style={{ maxWidth: '600px', margin: '3rem auto' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)' }}>Real-time multiplayer</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>Join thousands of players in real-time quiz battles. With robust WebSockets, lag is a thing of the past.</p>
      </div>
    </div>
  );
}
