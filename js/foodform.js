/* The add/edit-food sheet. Shared by the Foods tab and the Day tab's "New",
   so a food created mid-logging is identical to one created up front. */
import * as store from './store.js';
import { el, openSheet, toast, parseNum, fmt } from './ui.js';

export function openFoodForm({ food = null, onSaved, saveLabel } = {}) {
  const editing = !!food;
  const nutrients = store.nutrients();

  const nameInput = el('input', {
    class: 'input', type: 'text', value: food?.name || '',
    placeholder: "e.g. Annie's Bean Burrito",
    autocapitalize: 'words', autocomplete: 'off', enterkeyhint: 'next',
    'data-autofocus': editing ? null : true,
  });

  const servingInput = el('input', {
    class: 'input', type: 'text', value: food?.serving || '',
    placeholder: 'e.g. 1 burrito (142g)', autocapitalize: 'none', autocomplete: 'off',
  });

  const valueInputs = new Map();
  const nutrientFields = nutrients.map((n) => {
    const input = el('input', {
      class: 'input input-num',
      type: 'text', inputmode: 'decimal', enterkeyhint: 'next',
      value: food && Number.isFinite(food.values[n.id]) ? String(food.values[n.id]) : '',
      placeholder: '0',
      id: `nv_${n.id}`,
      onfocus: (e) => e.target.select(),
    });
    valueInputs.set(n.id, input);
    return el('div', { class: 'nutrient-input' }, [
      el('label', { class: 'field-label', for: `nv_${n.id}`, text: n.name }),
      input,
      el('span', { class: 'unit', text: n.unit }),
    ]);
  });

  const noteInput = el('input', {
    class: 'input', type: 'text', value: food?.note || '',
    placeholder: 'Optional', autocapitalize: 'sentences', autocomplete: 'off',
  });

  const errorLine = el('p', { class: 'field-hint', style: 'color:var(--danger);display:none' });

  const body = el('div', {}, [
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: 'Food name' }),
      nameInput,
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: 'Serving' }),
      servingInput,
      el('p', { class: 'field-hint', text: 'What one serving is — the amounts below are per serving.' }),
    ]),
    el('div', { class: 'section-label', text: 'Per serving', style: 'margin-top:20px' }),
    el('div', { class: 'card' }, [el('div', { class: 'card-body' }, nutrientFields)]),
    el('div', { class: 'field', style: 'margin-top:16px' }, [
      el('label', { class: 'field-label', text: 'Note' }),
      noteInput,
    ]),
    errorLine,
  ]);

  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorLine.textContent = 'Give the food a name.';
      errorLine.style.display = 'block';
      nameInput.focus();
      return;
    }
    const values = {};
    for (const [id, input] of valueInputs) {
      const raw = input.value.trim();
      if (raw === '') continue;
      values[id] = Math.max(0, parseNum(raw));
    }
    const saved = store.saveFood({ id: food?.id, name, serving: servingInput.value, note: noteInput.value, values });
    handle.close();
    toast(editing ? 'Food updated' : `Saved “${saved.name}”`);
    onSaved?.(saved);
  };

  /* Enter anywhere in the form saves, which is how a phone keyboard expects
     a short form to behave. */
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  const handle = openSheet({
    title: editing ? 'Edit food' : 'New food',
    body,
    footer: [
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => handle.close() }),
      el('button', { class: 'btn btn-primary', type: 'button', text: saveLabel || (editing ? 'Save' : 'Save food'), onclick: submit }),
    ],
  });

  if (!editing) setTimeout(() => nameInput.focus(), 80);
  return handle;
}

/* One-line "12 g fat · 4.5 g sat · 30 mg chol" summary used in food lists. */
export function foodSummaryText(food, nutrients = store.nutrients()) {
  const parts = nutrients
    .filter((n) => Number.isFinite(food.values[n.id]) && food.values[n.id] !== 0)
    .map((n) => `${fmt(food.values[n.id], n.decimals)} ${n.unit} ${n.name.toLowerCase()}`);
  if (!parts.length) return 'No amounts recorded';
  return parts.join(' · ');
}
