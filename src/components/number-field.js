import { html, useEffect, useState } from '../../vendor/preact-htm.js';

/**
 * Integer input that only reports valid values. While the text is invalid the
 * last valid value stays in effect and an inline error explains why.
 */
export function NumberField({ id, label, value, min, max, suffix, disabled, onChange, help }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const n = Number(text);
  const valid = text.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;

  return html`
    <div class="field">
      <label class="field-label" for=${id}>${label}</label>
      <div class=${`input-suffix ${valid ? '' : 'is-invalid'}`}>
        <input id=${id} type="number" inputmode="numeric" min=${min} max=${max} step="1" value=${text}
          disabled=${disabled} aria-invalid=${!valid} aria-describedby=${`${id}-msg`}
          onInput=${(e) => {
            const next = e.currentTarget.value;
            setText(next);
            const v = Number(next);
            if (next.trim() !== '' && Number.isInteger(v) && v >= min && v <= max) onChange(v);
          }}
          onBlur=${() => setText(String(value))} />
        ${suffix && html`<span aria-hidden="true">${suffix}</span>`}
      </div>
      <p id=${`${id}-msg`} class=${valid ? 'help' : 'field-error'}>
        ${valid ? help : `Enter a whole number from ${min} to ${max}.`}
      </p>
    </div>`;
}
