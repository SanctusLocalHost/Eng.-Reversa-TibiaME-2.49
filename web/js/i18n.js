// i18n.js — Parser de XLIFF 1.2 (pack4/extremeclienttexts.<lang>.xlf)

import { loadXML } from './loader.js';

export class I18n {
  constructor() { this.strings = new Map(); this.lang = 'pt'; }

  async load(lang = 'pt') {
    this.lang = lang;
    const doc = await loadXML(`pack4/${lang}/extremeclienttexts.${lang}.xlf`);
    for (const tu of doc.querySelectorAll('trans-unit')) {
      const id = tu.getAttribute('id');
      const target = tu.querySelector('target');
      const source = tu.querySelector('source');
      const text = (target ? target.textContent : (source ? source.textContent : '')).trim();
      this.strings.set(id, text);
    }
    return this;
  }

  t(id, ...args) {
    let s = this.strings.get(id);
    if (s === undefined) s = id; // fallback: mostra o próprio id
    // substituições simples: %s, {0}, {1}...
    args.forEach((a, i) => {
      s = s.replace(`{${i}}`, String(a)).replace('%s', String(a));
    });
    return s;
  }

  has(id) { return this.strings.has(id); }
}
