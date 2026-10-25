import {
  ArrowRight,
  Bookmark,
  Code2,
  FileText,
  FileType2,
  Image as ImageIcon,
  Link2,
  Search,
} from "lucide-react";
import Link from "next/link";

const resourceTypes = [
  { label: "Links", icon: Link2, detail: "Articles and references" },
  { label: "Notes", icon: FileText, detail: "Ideas and meeting notes" },
  { label: "Code", icon: Code2, detail: "Snippets and solutions" },
  { label: "Files", icon: FileType2, detail: "Images and documents" },
];

export default function WelcomePage() {
  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <Link className="auth-brand" href="/" aria-label="ContextKeep home">
          <span className="brand-mark">
            <Bookmark size={17} strokeWidth={2.4} />
          </span>
          <span className="brand-name">
            context<span>keep</span>
          </span>
        </Link>
        <nav className="welcome-nav" aria-label="Main navigation">
          <Link href="/login" className="welcome-signin">
            Sign in
          </Link>
          <Link href="/library" className="welcome-nav-cta">
            Open your library
            <ArrowRight size={14} />
          </Link>
        </nav>
      </header>

      <section className="welcome-hero">
        <div className="welcome-copy">
          <p className="eyebrow">
            A PERSONAL LIBRARY FOR YOUR WORKING MEMORY
          </p>
          <h1>
            Keep the useful things.
            <br />
            <span>Find them when it matters.</span>
          </h1>
          <p className="welcome-description">
            Save the articles, snippets, notes, and documents you come across.
            Search in your own words and get back to what you were working on.
          </p>
          <div className="welcome-actions">
            <Link className="add-button welcome-primary" href="/library">
              Open the library
              <ArrowRight size={15} />
            </Link>
            <Link className="welcome-secondary" href="/signup">
              Create an account
            </Link>
          </div>
          <p className="welcome-caption">
            Search is a local UI preview in this phase.
          </p>
        </div>

        <div className="welcome-preview" aria-label="Illustration of a searchable resource library">
          <div className="welcome-preview-top">
            <span className="welcome-preview-mark">
              <Bookmark size={13} />
            </span>
            <span>contextkeep</span>
            <span className="welcome-preview-avatar">AK</span>
          </div>
          <div className="welcome-preview-search">
            <Search size={15} />
            <span>Where did I save that Postgres checklist?</span>
            <kbd>⌘ K</kbd>
          </div>
          <div className="welcome-preview-label">A FEW THINGS YOU SAVED</div>
          <div className="welcome-preview-item">
            <span className="type-icon type-note">
              <FileText size={14} />
            </span>
            <span>
              <strong>Postgres query plan checklist</strong>
              <small>Engineering · postgres, performance</small>
            </span>
            <span className="preview-match">Note match</span>
          </div>
          <div className="welcome-preview-item">
            <span className="type-icon type-link">
              <Link2 size={14} />
            </span>
            <span>
              <strong>Designing data-intensive applications</strong>
              <small>Reading list · databases, architecture</small>
            </span>
          </div>
          <div className="welcome-preview-item">
            <span className="type-icon type-code">
              <Code2 size={14} />
            </span>
            <span>
              <strong>fetchWithRetry.ts</strong>
              <small>Engineering · TypeScript</small>
            </span>
          </div>
        </div>
      </section>

      <section className="welcome-types">
        <div className="welcome-section-heading">
          <p className="eyebrow">ONE PLACE FOR YOUR WORKING CONTEXT</p>
          <h2>Save it now. Find it in the middle of something else.</h2>
        </div>
        <div className="welcome-type-grid">
          {resourceTypes.map(({ label, icon: Icon, detail }) => (
            <div className="welcome-type-item" key={label}>
              <span className="welcome-type-icon">
                {label === "Files" ? (
                  <ImageIcon size={17} />
                ) : (
                  <Icon size={17} />
                )}
              </span>
              <strong>{label}</strong>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="welcome-footer">
        <span>ContextKeep</span>
        <span>Keep your context close.</span>
      </footer>
    </main>
  );
}
