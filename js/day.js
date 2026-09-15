/* Day tab: pick a date, add the foods you ate, see the running totals. */
import * as store from './store.js';
import {
  el, svgIcon, ICONS, openSheet, toast, fmt, fmtQty, parseNum,
  todayStr, shiftDate, friendlyDate, emptyState,
} from './ui.js';
import { openFoodForm, foodSummaryText } from './foodform.js';

let currentDate = todayStr();

export function setDayDate(date) { currentDate = date; }
export function getDayDate() { return currentDate; }

export function dayView({ setActions, rerender }) {
  const nutrients = store.nutrients();
  const entries = store.entriesForDate(currentDate);
  const totals = store.totalsForDate(currentDate);

  setActions(currentDate === todayStr() ? [] : [
    el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: 'Today',
      onclick: () => { currentDate = todayStr(); rerender(); },
    }),
  ]);

  const root = el('div');

  /* ---- date navigation ---- */
  const dateInput = el('input', {
    class: 'input', type: 'date', value: currentDate,
    onchange: (e) => {
      if (e.target.value) { currentDate = e.target.value; rerender(); }
    },
  });
  root.append(
    el('div', { class: 'date-nav' }, [
      el('button', {
        class: 'btn btn-icon', type: 'button', 'aria-label': 'Previous day',
        onclick: () => { currentDate = shiftDate(currentDate, -1); rerender(); },
      }, [svgIcon(ICONS.chevronLeft, 20)]),
      dateInput,
      el('button', {
        class: 'btn btn-icon', type: 'button', 'aria-label': 'Next day',
        onclick: () => { currentDate = shiftDate(currentDate, 1); rerender(); },
      }, [svgIcon(ICONS.chevronRight, 20)]),
    ]),
    el('p', { class: 'date-caption', text: friendlyDate(currentDate) }),
  );

  /* ---- totals ---- */
  const totalsCard = el('div', { class: 'card' });
  for (const n of nutrients) {
    const value = totals[n.id] || 0;
    const pct = n.goal > 0 ? Math.min(100, (value / n.goal) * 100) : null;
    const over = n.goal > 0 && value > n.goal;
    totalsCard.append(el('div', { class: 'total' }, [
      el('div', { class: 'total-top' }, [
        el('span', { class: 'total-name', text: n.name }),
        el('span', { class: 'total-val' }, [
          fmt(value, n.decimals),
          el('span', { class: 'unit', text: n.unit }),
        ]),
      ]),
      pct === null ? null : el('div', { class: `meter${over ? ' over' : ''}` }, [
        el('i', { style: `width:${pct}%` }),
      ]),
      pct === null ? null : el('div', { class: 'total-goal' }, [
        el('span', { text: `Goal ${fmt(n.goal, n.decimals)} ${n.unit}` }),
        over
          ? el('span', { class: 'over', text: `${fmt(value - n.goal, n.decimals)} ${n.unit} over` })
          : el('span', { text: `${fmt(n.goal - value, n.decimals)} ${n.unit} left` }),
      ]),
    ]));
  }
  root.append(totalsCard);

  /* ---- entries ---- */
  root.append(el('div', { class: 'section-label', text: entries.length ? `Eaten (${entries.length})` : 'Eaten' }));

  if (!entries.length) {
    root.append(emptyState({
      text: 'Nothing logged for this day yet.',
      actionLabel: 'Add food',
      onAction: () => openPicker(rerender),
    }));
  } else {
    const card = el('div', { class: 'card' });
    for (const entry of entries) {
      const food = store.getFood(entry.foodId);
      if (!food) continue;
      const primary = nutrients[0];
      const contribution = primary ? (food.values[primary.id] || 0) * entry.qty : 0;
      card.append(el('button', {
        class: 'row', type: 'button',
        onclick: () => openEntrySheet(entry.id, rerender),
      }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title' }, [
            food.name,
            entry.qty !== 1 ? el('span', { class: 'badge', text: `× ${fmtQty(entry.qty)}` }) : null,
          ]),
          el('div', { class: 'row-sub', text: food.serving || foodSummaryText(food, nutrients) }),
        ]),
        primary ? el('div', { class: 'row-side', text: `${fmt(contribution, primary.decimals)} ${primary.unit}` }) : null,
        el('span', { class: 'chev' }, [svgIcon(ICONS.chevronRight, 16)]),
      ]));
    }
    root.append(card);
    root.append(el('button', {
      class: 'btn btn-primary btn-block', type: 'button',
      onclick: () => openPicker(rerender),
    }, [svgIcon(ICONS.plus, 18), 'Add food']));
  }

  return root;
}

/* ---- food picker -------------------------------------------------------- */
function openPicker(rerender) {
  let pickerQuery = '';
  const listHost = el('div');

  const addFood = (food) => {
    store.addEntry(currentDate, food.id, 1);
    toast(`Added ${food.name}`);
    paint();
    rerender();
  };

  const paint = () => {
    listHost.textContent = '';
    const q = pickerQuery.trim().toLowerCase();
    const all = store.foods();
    const matches = q ? all.filter((f) => f.name.toLowerCase().includes(q) || f.serving.toLowerCase().includes(q)) : all;
    const todaysCounts = new Map();
    for (const e of store.entriesForDate(currentDate)) {
      todaysCounts.set(e.foodId, (todaysCounts.get(e.foodId) || 0) + e.qty);
    }

    if (!all.length) {
      listHost.append(emptyState({
        text: 'Your food library is empty. Create a food and it will be added to this day.',
        actionLabel: 'New food',
        onAction: () => newFoodThenAdd(),
      }));
      return;
    }

    /* Recently logged first when you haven't typed a search — that's almost
       always what you're reaching for. */
    if (!q) {
      const recent = store.recentFoodIds(6).map(store.getFood).filter(Boolean);
      if (recent.length) {
        listHost.append(el('div', { class: 'section-label', style: 'margin-top:0', text: 'Recent' }));
        listHost.append(foodList(recent, addFood, todaysCounts));
        listHost.append(el('div', { class: 'section-label', text: 'All foods' }));
      }
    }

    if (!matches.length) {
      listHost.append(el('p', { class: 'empty', text: `No food matches “${pickerQuery}”.` }));
      listHost.append(el('button', {
        class: 'btn btn-block', type: 'button',
        text: `Create “${pickerQuery.trim()}”`,
        onclick: () => newFoodThenAdd(pickerQuery.trim()),
      }));
      return;
    }
    listHost.append(foodList(matches, addFood, todaysCounts));
  };

  const newFoodThenAdd = (prefillName = '') => {
    const form = openFoodForm({
      onSaved: (food) => {
        store.addEntry(currentDate, food.id, 1);
        toast(`Added ${food.name} to ${friendlyDate(currentDate).toLowerCase()}`);
        paint();
        rerender();
      },
    });
    if (prefillName) {
      const input = form.sheet.querySelector('input[type="text"]');
      if (input) input.value = prefillName;
    }
  };

  const searchInput = el('input', {
    class: 'input', type: 'search', placeholder: 'Search foods',
    autocomplete: 'off', autocorrect: 'off', enterkeyhint: 'search',
    oninput: (e) => { pickerQuery = e.target.value; paint(); },
  });

  const body = el('div', {}, [
    el('div', { class: 'search' }, [svgIcon(ICONS.search, 17), searchInput]),
    listHost,
  ]);

  paint();

  const handle = openSheet({
    title: `Add to ${friendlyDate(currentDate).toLowerCase()}`,
    body,
    footer: [
      el('button', { class: 'btn', type: 'button', onclick: () => newFoodThenAdd() }, [svgIcon(ICONS.plus, 17), 'New food']),
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Done', onclick: () => handle.close() }),
    ],
  });
}

function foodList(foods, onPick, todaysCounts) {
  const nutrients = store.nutrients();
  const card = el('div', { class: 'card' });
  for (const food of foods) {
    const already = todaysCounts.get(food.id);
    card.append(el('button', {
      class: 'row', type: 'button',
      onclick: () => onPick(food),
    }, [
      el('div', { class: 'row-main' }, [
        el('div', { class: 'row-title' }, [
          food.name,
          already ? el('span', { class: 'badge', text: `× ${fmtQty(already)} today` }) : null,
        ]),
        el('div', { class: 'row-sub', text: foodSummaryText(food, nutrients) }),
      ]),
      el('span', { class: 'chev', style: 'color:var(--accent)' }, [svgIcon(ICONS.plus, 18)]),
    ]));
  }
  return card;
}

/* ---- one logged entry --------------------------------------------------- */
function openEntrySheet(entryId, rerender) {
  const entry = store.entriesForDate(currentDate).find((e) => e.id === entryId);
  if (!entry) return;
  const food = store.getFood(entry.foodId);
  if (!food) return;
  const nutrients = store.nutrients();

  let qty = entry.qty;
  const qtyInput = el('input', {
    type: 'text', inputmode: 'decimal', value: fmtQty(qty),
    'aria-label': 'Servings',
    onchange: (e) => setQty(parseNum(e.target.value)),
  });
  const breakdown = el('div', { class: 'card' });

  const paintBreakdown = () => {
    breakdown.textContent = '';
    for (const n of nutrients) {
      breakdown.append(el('div', { class: 'row' }, [
        el('div', { class: 'row-main' }, [el('div', { class: 'row-title', text: n.name })]),
        el('div', { class: 'row-side', text: `${fmt((food.values[n.id] || 0) * qty, n.decimals)} ${n.unit}` }),
      ]));
    }
  };

  const setQty = (next) => {
    qty = Math.max(0.25, Math.round(next * 100) / 100);
    qtyInput.value = fmtQty(qty);
    paintBreakdown();
  };

  paintBreakdown();

  const body = el('div', {}, [
    food.serving ? el('p', { class: 'field-hint', style: 'margin:0 0 14px', text: `One serving = ${food.serving}` }) : null,
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: 'Servings' }),
      el('div', { class: 'qty-stepper', style: 'width:max-content' }, [
        el('button', { type: 'button', text: '−', 'aria-label': 'Fewer servings', onclick: () => setQty(qty - (qty <= 1 ? 0.25 : 0.5)) }),
        qtyInput,
        el('button', { type: 'button', text: '+', 'aria-label': 'More servings', onclick: () => setQty(qty + (qty < 1 ? 0.25 : 0.5)) }),
      ]),
    ]),
    el('div', { class: 'section-label', text: 'This entry contributes' }),
    breakdown,
    el('button', {
      class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:16px',
      onclick: () => {
        const snapshot = { ...entry };
        store.deleteEntry(entry.id);
        handle.close();
        rerender();
        toast('Removed', { action: 'Undo', onAction: () => { store.restoreEntry(snapshot); rerender(); } });
      },
    }, [svgIcon(ICONS.trash, 17), 'Remove from day']),
  ]);

  const handle = openSheet({
    title: food.name,
    body,
    footer: [
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => handle.close() }),
      el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Save',
        onclick: () => { store.updateEntry(entry.id, { qty }); handle.close(); rerender(); },
      }),
    ],
  });
}
