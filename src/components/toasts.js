import { html, useCallback, useRef, useState } from '../../vendor/preact-htm.js';
import { Icon } from '../icons.js';

const DURATION_MS = { success: 4000, info: 5000, error: 8000 };

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((kind, message) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { id, kind, message }]);
    setTimeout(() => dismiss(id), DURATION_MS[kind] ?? 5000);
  }, [dismiss]);

  return { toasts, push, dismiss };
}

const ICONS = { success: 'check', info: 'info', error: 'alert' };

export function Toasts({ toasts, onDismiss }) {
  return html`
    <div class="toasts" aria-live="polite">
      ${toasts.map((t) => html`
        <div key=${t.id} class=${`toast toast-${t.kind}`} role=${t.kind === 'error' ? 'alert' : 'status'}>
          <${Icon} name=${ICONS[t.kind]} />
          <p>${t.message}</p>
          <button type="button" class="icon-btn" aria-label="Dismiss" onClick=${() => onDismiss(t.id)}>
            <${Icon} name="x" size=${14} />
          </button>
        </div>`)}
    </div>`;
}
