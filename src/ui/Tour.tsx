/**
 * ui/Tour — the guided tour for new users (steps in help/tour.ts).
 *
 * - First visit in this browser (no localStorage flag): a small prompt offers
 *   the tour. Both finishing and skipping write `tour:done`, so it never nags.
 * - The 🎓 Tour button in the header replays it anytime (via startTour()).
 * - Each step dims the app and cuts a spotlight hole over its target (the
 *   box-shadow trick), with a card: title, note, step counter, Back / Next /
 *   Skip. The spotlight and card ANIMATE between steps (CSS transitions).
 * - While the tour is up, a capture-phase key handler owns the keyboard
 *   (←/→/Enter navigate, Esc exits) so app shortcuts can't fire underneath.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TOUR_STEPS } from '../help/tour';

const DONE_KEY = 'tour:done';
const CARD_W = 340;
const CARD_H = 190; // worst-case estimate for placement

/** Open the tour from anywhere (header button, future triggers). */
export function startTour(): void {
  window.dispatchEvent(new CustomEvent('start-tour'));
}

function markDone(how: 'done' | 'skipped'): void {
  try {
    localStorage.setItem(DONE_KEY, how);
  } catch {
    /* storage may be unavailable — the tour just re-offers next visit */
  }
}

interface Spot {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function Tour() {
  const [step, setStep] = useState<number | null>(null); // null = inactive
  const [showPrompt, setShowPrompt] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);

  // First visit in this browser → offer the tour. Suppressed in test mode
  // (?nopersist) so automated runs aren't covered by a modal.
  useEffect(() => {
    if (new URLSearchParams(location.search).has('nopersist')) return;
    try {
      if (!localStorage.getItem(DONE_KEY)) setShowPrompt(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Retrigger from the header 🎓 button.
  useEffect(() => {
    const onStart = () => {
      setShowPrompt(false);
      setStep(0);
    };
    window.addEventListener('start-tour', onStart);
    return () => window.removeEventListener('start-tour', onStart);
  }, []);

  const current = step != null ? TOUR_STEPS[step] : null;
  const active = current != null;

  const exit = (how: 'done' | 'skipped') => {
    markDone(how);
    setStep(null);
  };
  const next = () => {
    if (step == null) return;
    if (step >= TOUR_STEPS.length - 1) exit('done');
    else setStep(step + 1);
  };
  const back = () => {
    if (step != null && step > 0) setStep(step - 1);
  };

  // Measure the step's target (opening its dock panel first if needed). The
  // panel takes a render to appear, so retry over a few frames.
  useLayoutEffect(() => {
    if (!current) {
      setSpot(null);
      return;
    }
    if (current.panel) {
      window.dispatchEvent(new CustomEvent('dock-panel-open', { detail: current.panel }));
    }
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = current.target ? document.querySelector(current.target) : null;
      if (el) {
        const r = el.getBoundingClientRect();
        setSpot({ left: r.left, top: r.top, width: r.width, height: r.height });
      } else if (current.target && tries < 12) {
        tries += 1;
        raf = requestAnimationFrame(measure);
      } else {
        setSpot(null); // target missing → centered card, no hole
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [current]);

  // Own the keyboard while touring (capture phase beats the app shortcuts).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        exit('skipped');
      } else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  // Card placement: under the spotlight if there's room, else above; clamped
  // to the viewport. Centered when the step has no target.
  const cardPos = (() => {
    if (!spot) return undefined;
    const m = 14;
    let top = spot.top + spot.height + m;
    if (top + CARD_H > window.innerHeight) top = Math.max(m, spot.top - CARD_H - m);
    const left = Math.min(
      Math.max(m, spot.left + spot.width / 2 - CARD_W / 2),
      window.innerWidth - CARD_W - m,
    );
    return { top, left };
  })();

  return (
    <>
      {showPrompt &&
        createPortal(
          <div className="modal tour-prompt">
            <div className="modal__card" role="dialog" aria-modal="true" aria-label="Welcome">
              <h3>👋 First time here?</h3>
              <p className="modal__hint">
                Take a quick guided tour — from importing media all the way to exporting your
                first video. It takes about two minutes.
              </p>
              <div className="modal__actions">
                <button
                  className="btn"
                  onClick={() => {
                    markDone('skipped');
                    setShowPrompt(false);
                  }}
                >
                  Skip for now
                </button>
                <button
                  className="btn btn--primary tour-prompt__start"
                  onClick={() => {
                    setShowPrompt(false);
                    setStep(0);
                  }}
                >
                  Show me around
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {active &&
        current &&
        step != null &&
        createPortal(
          <div className="tour" role="dialog" aria-modal="true" aria-label="Tutorial">
            {spot ? (
              <div
                className="tour__spot"
                style={{
                  left: spot.left - 6,
                  top: spot.top - 6,
                  width: spot.width + 12,
                  height: spot.height + 12,
                }}
              />
            ) : (
              <div className="tour__dim" />
            )}
            <div className={`tour__card${spot ? '' : ' tour__card--center'}`} style={cardPos}>
              <div className="tour__meta">
                {step + 1} / {TOUR_STEPS.length}
              </div>
              <h3 className="tour__title">{current.title}</h3>
              <p className="tour__body">{current.body}</p>
              <div className="tour__actions">
                <button className="btn tour__skip" onClick={() => exit('skipped')}>
                  Skip tour
                </button>
                <div className="tour__nav">
                  <button className="btn" onClick={back} disabled={step === 0}>
                    ‹ Back
                  </button>
                  <button className="btn btn--primary tour__next" onClick={next}>
                    {step === TOUR_STEPS.length - 1 ? 'Finish ✓' : 'Next ›'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
