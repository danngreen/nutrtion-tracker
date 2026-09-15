/* Foods tab: the library of foods you've entered from labels. */
import * as store from './store.js';
import { el, svgIcon, ICONS, openSheet, confirmSheet, toast, fmt, emptyState } from './ui.js';
import { openFoodForm, foodSummaryText } from './foodform.js';

let query = '';
let showArchived = false;

export function foodsView({ setActions, rerender }) {
  const nutrients = store.nutrients();
  const all = store.foods({ includeArchived: showArchived });

  setActions([
    el('button', {
      class: 'btn btn-primary btn-sm', type: 'button',
      onclick: () => openFoodForm({ onSaved: rerender }),
    }, [svgIcon(ICONS.plus, 17), 'New']),
  ]);

  const root = el('div');

  if (!all.length && !showArchived) {
    root.append(emptyState({
      icon: ICONS.search,
      text: 'No foods yet. Add the things you eat once, with the numbers from the label, then log them any day.',
      actionLabel: 'Add your first food',
      onAction: () => openFoodForm({ onSaved: rerender }),
    }));
    return root;
  }

  /* The list repaints in place as you type, so the input keeps focus and the
     caret stays put — a full rerender would fight the keyboard on a phone. */
  const listHost = el('div');

  const paintList = () => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? all.filter((f) => f.name.toLowerCase().includes(needle)
          || f.note.toLowerCase().includes(needle)
          || f.serving.toLowerCase().includes(needle))
      : all;
    listHost.textContent = '';
    if (!matches.length) {
      listHost.append(el('p', { class: 'empty', text: `No foods match “${query.trim()}”.` }));
      return;
    }
    const card = el('div', { class: 'card' });
    for (const food of matches) {
      card.append(el('button', {
        class: 'row', type: 'button',
        onclick: () => openFoodDetail(food.id, rerender),
      }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title' }, [
            food.name,
            food.archived ? el('span', { class: 'badge', text: 'Archived' }) : null,
          ]),
          el('div', { class: 'row-sub', text: foodSummaryText(food, nutrients) }),
        ]),
        el('span', { class: 'chev' }, [svgIcon(ICONS.chevronRight, 16)]),
      ]));
    }
    listHost.append(card);
  };

  root.append(el('div', { class: 'search' }, [
    svgIcon(ICONS.search, 17),
    el('input', {
      class: 'input', type: 'search', placeholder: 'Search foods', value: query,
      autocomplete: 'off', autocorrect: 'off', enterkeyhint: 'search',
      oninput: (e) => { query = e.target.value; paintList(); },
    }),
  ]));
  paintList();
  root.append(listHost);

  const archivedCount = store.foods({ includeArchived: true }).filter((f) => f.archived).length;
  if (archivedCount) {
    root.append(el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      text: showArchived ? 'Hide archived' : `Show ${archivedCount} archived`,
      style: 'margin: 4px auto; display:flex;',
      onclick: () => { showArchived = !showArchived; rerender(); },
    }));
  }

  root.append(el('p', {
    class: 'field-hint', style: 'text-align:center;margin-top:16px',
    text: `${all.filter((f) => !f.archived).length} food${all.filter((f) => !f.archived).length === 1 ? '' : 's'} in your library`,
  }));

  return root;
}

export function openFoodDetail(foodId, onChange) {
  const food = store.getFood(foodId);
  if (!food) return;
  const nutrients = store.nutrients();
  const used = store.countEntriesForFood(food.id);

  const rows = nutrients.map((n) => el('div', { class: 'row' }, [
    el('div', { class: 'row-main' }, [el('div', { class: 'row-title', text: n.name })]),
    el('div', { class: 'row-side', text: `${fmt(food.values[n.id] || 0, n.decimals)} ${n.unit}` }),
  ]));

  const body = el('div', {}, [
    food.serving ? el('p', { class: 'field-hint', style: 'margin:0 0 12px', text: `Per ${food.serving}` }) : null,
    el('div', { class: 'card' }, rows),
    food.note ? el('p', { class: 'field-hint', style: 'margin-top:12px', text: food.note }) : null,
    el('p', {
      class: 'field-hint', style: 'margin-top:12px',
      text: used ? `Logged ${used} time${used === 1 ? '' : 's'}.` : 'Not logged yet.',
    }),
    el('div', { style: 'display:flex;gap:10px;margin-top:16px' }, [
      el('button', {
        class: 'btn btn-sm', type: 'button',
        text: food.archived ? 'Unarchive' : 'Archive',
        onclick: () => {
          store.setFoodArchived(food.id, !food.archived);
          handle.close();
          toast(food.archived ? 'Unarchived' : 'Archived — hidden from the picker, history kept');
          onChange?.();
        },
      }),
      el('button', {
        class: 'btn btn-sm btn-danger', type: 'button',
        onclick: () => {
          handle.close();
          confirmSheet({
            title: `Delete ${food.name}?`,
            message: used
              ? `This food is used in ${used} logged entr${used === 1 ? 'y' : 'ies'}. Deleting removes those entries from your history too. Archive instead if you just want it out of the picker.`
              : 'This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: () => { store.deleteFood(food.id); toast('Food deleted'); onChange?.(); },
          });
        },
      }, [svgIcon(ICONS.trash, 16), 'Delete']),
    ]),
  ]);

  const handle = openSheet({
    title: food.name,
    body,
    footer: [
      el('button', { class: 'btn', type: 'button', text: 'Close', onclick: () => handle.close() }),
      el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Edit',
        onclick: () => { handle.close(); openFoodForm({ food, onSaved: onChange }); },
      }),
    ],
  });
}
