export default function About() {
  return (
    <div className="main-content flex-col items-center justify-center min-h-screen text-center pop-in" style={{ paddingTop: '100px' }}>
      <h1 className="title-xl text-gradient">About Quizy</h1>
      <p className="subtitle max-w-2xl mx-auto mt-4" style={{ color: 'rgba(255,255,255,0.8)' }}>
        We believe learning should be energetic, competitive, and fun.
        Built with cutting-edge web technologies to deliver a truly premium experience.
      </p>

       <div className="glass-card mt-12" style={{ maxWidth: '500px', margin: '3rem auto' }}>
          <p style={{ color: 'var(--text-main)', lineHeight: 1.6, fontStyle: 'italic', fontWeight: 500 }}>
            "Quizy transforms any classroom or meeting into an interactive game show."
          </p>
      </div>
    </div>
  );
}
