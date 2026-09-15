/* Settings tab: nutrient categories, backup, appearance. */
import * as store from './store.js';
import { el, svgIcon, ICONS, openSheet, confirmSheet, toast, fmt, parseNum, todayStr } from './ui.js';

export function settingsView({ setActions, rerender }) {
  setActions([]);
  const root = el('div');
  const all = store.nutrients({ all: true });

  /* ---- nutrient categories ---- */
  root.append(el('div', { class: 'section-label', style: 'margin-top:2px', text: 'Nutrient categories' }));
  const nutrientCard = el('div', { class: 'card' });
  all.forEach((n, i) => {
    nutrientCard.append(el('div', { class: 'row' }, [
      el('div', { class: 'row-main', style: 'cursor:pointer', onclick: () => openNutrientForm({ nutrient: n, onSaved: rerender }) }, [
        el('div', { class: 'row-title' }, [
          n.name,
          n.enabled ? null : el('span', { class: 'badge', text: 'Hidden' }),
        ]),
        el('div', {
          class: 'row-sub',
          text: n.goal > 0 ? `${n.unit} · goal ${fmt(n.goal, n.decimals)} ${n.unit}/day` : `${n.unit} · no daily goal`,
        }),
      ]),
      el('div', { style: 'display:flex;gap:2px;flex-shrink:0' }, [
        el('button', {
          class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Move ${n.name} up`,
          disabled: i === 0, style: 'min-height:36px;width:32px',
          onclick: () => { store.moveNutrient(n.id, -1); rerender(); },
        }, [svgIcon('M12 19V6M6 12l6-6 6 6', 17)]),
        el('button', {
          class: 'btn btn-icon btn-ghost', type: 'button', 'aria-label': `Move ${n.name} down`,
          disabled: i === all.length - 1, style: 'min-height:36px;width:32px',
          onclick: () => { store.moveNutrient(n.id, 1); rerender(); },
        }, [svgIcon('M12 5v13M6 12l6 6 6-6', 17)]),
        el('button', {
          class: 'btn btn-sm btn-ghost', type: 'button', text: 'Edit',
          onclick: () => openNutrientForm({ nutrient: n, onSaved: rerender }),
        }),
      ]),
    ]));
  });
  root.append(nutrientCard);
  root.append(el('button', {
    class: 'btn btn-block', type: 'button', style: 'margin-bottom:6px',
    onclick: () => openNutrientForm({ onSaved: rerender }),
  }, [svgIcon(ICONS.plus, 18), 'Add a category']));
  root.append(el('p', {
    class: 'field-hint', style: 'margin:0 2px 8px',
    text: 'Add anything you want to track later — sodium, fibre, protein, calories. New categories start empty on existing foods; fill them in as you re-check labels.',
  }));

  /* ---- appearance ---- */
  root.append(el('div', { class: 'section-label', text: 'Appearance' }));
  const theme = store.settings().theme || 'auto';
  root.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-body' }, [
      el('label', { class: 'field-label', for: 'theme-select', text: 'Theme' }),
      el('select', {
        class: 'input', id: 'theme-select',
        onchange: (e) => { store.updateSettings({ theme: e.target.value }); applyTheme(); rerender(); },
      }, [
        el('option', { value: 'auto', text: 'Match system', selected: theme === 'auto' }),
        el('option', { value: 'light', text: 'Light', selected: theme === 'light' }),
        el('option', { value: 'dark', text: 'Dark', selected: theme === 'dark' }),
      ]),
    ]),
  ]));

  /* ---- backup ---- */
  const db = store.getDb();
  root.append(el('div', { class: 'section-label', text: 'Backup' }));
  root.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-body' }, [
      el('p', { class: 'field-hint', style: 'margin:0 0 12px' },
        [`Everything is stored on this device only — ${db.foods.length} food${db.foods.length === 1 ? '' : 's'} and ${db.entries.length} logged entr${db.entries.length === 1 ? 'y' : 'ies'}. Export a backup before clearing your browser data or moving to a new phone.`]),
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
        el('button', { class: 'btn', type: 'button', style: 'flex:1', onclick: exportBackup }, [svgIcon(ICONS.download, 17), 'Export']),
        el('button', { class: 'btn', type: 'button', style: 'flex:1', onclick: () => openImport(rerender) }, [svgIcon(ICONS.upload, 17), 'Import']),
      ]),
    ]),
  ]));

  /* ---- danger ---- */
  root.append(el('div', { class: 'section-label', text: 'Danger zone' }));
  root.append(el('div', { class: 'card' }, [
    el('div', { class: 'card-body' }, [
      el('button', {
        class: 'btn btn-danger btn-block', type: 'button',
        onclick: () => confirmSheet({
          title: 'Erase everything?',
          message: 'Every food and every logged day will be deleted from this device. Export a backup first if you might want this data back.',
          confirmLabel: 'Erase all data',
          onConfirm: () => { store.clearAll(); toast('All data erased'); rerender(); },
        }),
      }, [svgIcon(ICONS.trash, 17), 'Erase all data']),
    ]),
  ]));

  root.append(el('p', {
    class: 'field-hint', style: 'text-align:center;margin-top:20px',
    text: 'Nutrition Tracker — runs entirely on this device.',
  }));

  return root;
}

/* ---- nutrient add/edit -------------------------------------------------- */
function openNutrientForm({ nutrient = null, onSaved } = {}) {
  const editing = !!nutrient;
  const nameInput = el('input', { class: 'input', type: 'text', value: nutrient?.name || '', placeholder: 'e.g. Sodium', autocapitalize: 'words' });
  const unitInput = el('input', { class: 'input', type: 'text', value: nutrient?.unit || 'g', placeholder: 'g', autocapitalize: 'none' });
  const decimalsInput = el('select', { class: 'input' }, [0, 1, 2, 3].map((d) => el('option', {
    value: String(d), text: d === 0 ? '0 (whole numbers)' : `${d}`,
    selected: (nutrient?.decimals ?? 1) === d,
  })));
  const goalInput = el('input', {
    class: 'input input-num', type: 'text', inputmode: 'decimal',
    value: nutrient?.goal > 0 ? String(nutrient.goal) : '', placeholder: 'None',
  });
  const enabledInput = el('input', { type: 'checkbox', checked: nutrient ? nutrient.enabled : true });
  const errorLine = el('p', { class: 'field-hint', style: 'color:var(--danger);display:none' });

  const body = el('div', {}, [
    el('div', { class: 'field' }, [el('label', { class: 'field-label', text: 'Name' }), nameInput]),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', { class: 'field-label', text: 'Unit' }), unitInput]),
      el('div', { class: 'field' }, [el('label', { class: 'field-label', text: 'Decimal places' }), decimalsInput]),
    ]),
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: 'Daily goal (optional)' }),
      goalInput,
      el('p', { class: 'field-hint', text: 'Shows a progress bar on the Day tab and a reference line on the graph.' }),
    ]),
    el('label', { class: 'switch' }, [enabledInput, el('span', { text: 'Show this category when logging' })]),
    errorLine,
    editing ? el('button', {
      class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:18px',
      onclick: () => {
        handle.close();
        confirmSheet({
          title: `Delete ${nutrient.name}?`,
          message: 'The amounts recorded for this category are removed from every food. Your foods and logged days are otherwise untouched. Hiding it instead keeps the numbers.',
          confirmLabel: 'Delete category',
          onConfirm: () => { store.deleteNutrient(nutrient.id); toast('Category deleted'); onSaved?.(); },
        });
      },
    }, [svgIcon(ICONS.trash, 17), 'Delete category']) : null,
  ]);

  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorLine.textContent = 'Give the category a name.';
      errorLine.style.display = 'block';
      return;
    }
    const goalRaw = goalInput.value.trim();
    const patch = {
      name,
      unit: unitInput.value.trim() || 'g',
      decimals: Number(decimalsInput.value),
      goal: goalRaw ? Math.max(0, parseNum(goalRaw)) || null : null,
      enabled: enabledInput.checked,
    };
    if (editing) store.updateNutrient(nutrient.id, patch);
    else store.addNutrient(patch);
    handle.close();
    toast(editing ? 'Category updated' : `Added ${name}`);
    onSaved?.();
  };

  const handle = openSheet({
    title: editing ? 'Edit category' : 'New category',
    body,
    footer: [
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => handle.close() }),
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Save', onclick: submit }),
    ],
  });
}

/* ---- backup ------------------------------------------------------------- */
function exportBackup() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `nutrition-backup-${todayStr()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup downloaded');
}

function openImport(rerender) {
  let mode = 'merge';
  const fileInput = el('input', { class: 'input', type: 'file', accept: 'application/json,.json' });
  const status = el('p', { class: 'field-hint', style: 'margin-top:10px' });

  const modeButton = (value, label, hint) => el('label', {
    class: 'switch', style: 'align-items:flex-start;gap:10px',
  }, [
    el('input', { type: 'radio', name: 'import-mode', value, checked: mode === value, onchange: () => { mode = value; } }),
    el('span', {}, [el('div', { text: label, style: 'font-weight:580' }), el('div', { class: 'field-hint', text: hint })]),
  ]);

  const body = el('div', {}, [
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label', text: 'Backup file' }),
      fileInput,
    ]),
    modeButton('merge', 'Merge', 'Keeps what is here and adds anything missing. Foods with the same name are matched, not duplicated.'),
    modeButton('replace', 'Replace', 'Wipes this device and restores the backup exactly.'),
    status,
  ]);

  const submit = async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      status.textContent = 'Choose a backup file first.';
      status.style.color = 'var(--danger)';
      return;
    }
    try {
      const text = await file.text();
      const result = store.importJson(text, { merge: mode === 'merge' });
      handle.close();
      toast(mode === 'merge'
        ? `Merged ${result.foods} food${result.foods === 1 ? '' : 's'}, ${result.entries} entr${result.entries === 1 ? 'y' : 'ies'}`
        : `Restored ${result.foods} foods and ${result.entries} entries`);
      rerender();
    } catch (err) {
      status.textContent = err.message || 'That file could not be read.';
      status.style.color = 'var(--danger)';
    }
  };

  const handle = openSheet({
    title: 'Import backup',
    body,
    footer: [
      el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => handle.close() }),
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Import', onclick: submit }),
    ],
  });
}

export function applyTheme() {
  const theme = store.settings().theme || 'auto';
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
