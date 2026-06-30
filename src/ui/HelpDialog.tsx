/**
 * ui/HelpDialog — the "?" Help button + a searchable feature guide.
 *
 * Click the button to open a panel; type a feature name (e.g. "transition",
 * "snap") to filter; each result explains what it is and how to use it.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchGuide } from '../help/guide';

const HELP_EVENT = 'open-help';

/** Open the Help panel pre-filtered to a feature (used by inline "?" links). */
export function openHelp(query: string): void {
  window.dispatchEvent(new CustomEvent(HELP_EVENT, { detail: query }));
}

/** A small "?" link that opens the Help guide focused on `topic`. */
export function HelpLink({ topic }: { topic: string }) {
  return (
    <button
      className="help-link"
      onClick={() => openHelp(topic)}
      data-tip={`What is "${topic}"? Open the guide.`}
      aria-label={`Help: ${topic}`}
    >
      ?
    </button>
  );
}

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchGuide(query), [query]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setQuery((e as CustomEvent<string>).detail ?? '');
      setOpen(true);
    };
    window.addEventListener(HELP_EVENT, onOpen);
    return () => window.removeEventListener(HELP_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        className="btn help-btn"
        onClick={() => setOpen(true)}
        data-tip="Help — search any feature for what it is and how to use it"
        aria-label="Help"
        title=""
      >
        ?
      </button>
      {open &&
        createPortal(
          <div className="modal" onClick={() => setOpen(false)}>
            <div
              className="modal__card help-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Help and feature guide"
            >
              <div className="help-card__head">
                <h3>Help &amp; feature guide</h3>
                <button className="btn btn--sm" onClick={() => setOpen(false)} aria-label="Close help">
                  ✕
                </button>
              </div>
              <input
                className="help-search"
                type="search"
                placeholder="Search a feature… (e.g. transition, snap, duck)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <div className="help-list">
                {results.length === 0 && (
                  <p className="help-empty">No feature matches “{query}”.</p>
                )}
                {results.map((e) => (
                  <article className="help-entry" key={e.name}>
                    <header className="help-entry__head">
                      <span className="help-entry__name">{e.name}</span>
                      <span className="help-entry__cat">{e.category}</span>
                    </header>
                    <p className="help-entry__what">{e.what}</p>
                    <p className="help-entry__how">
                      <span className="help-entry__label">How:</span> {e.how}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
