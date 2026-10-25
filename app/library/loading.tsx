export default function LibraryLoading() {
  return (
    <main className="library-loading" aria-label="Loading your library">
      <aside className="loading-sidebar">
        <div className="loading-line loading-brand" />
        <div className="loading-line" />
        <div className="loading-line" />
        <div className="loading-line" />
      </aside>
      <section className="loading-content">
        <div className="loading-line loading-heading" />
        <div className="loading-line loading-search" />
        <div className="loading-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="loading-card" key={index}>
              <div className="loading-preview" />
              <div className="loading-line" />
              <div className="loading-line loading-short" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
