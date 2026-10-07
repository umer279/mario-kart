const $ = (id) => document.getElementById(id);
const SCREENS = ['title', 'pause', 'results'];

export const ui = {
  show(name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    const btn = name && $(name).querySelector('button');
    btn?.focus();
  },

  hideAll() {
    this.show(null);
  },

  showResults(rows) {
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    $('results-table').innerHTML = rows
      .map(
        (r) => `<tr class="${r.human ? 'me' : ''}">
          <td class="rk">${r.rank}</td>
          <td><span class="dot" style="background:${hex(r.color)}"></span>${r.name}</td>
          <td class="tm">${r.time}</td></tr>`,
      )
      .join('');
    this.show('results');
  },

  bind({ start, resume, quit, retry }) {
    $('title').querySelectorAll('[data-players]').forEach((b) =>
      b.addEventListener('click', () => start(Number(b.dataset.players))),
    );
    $('btn-resume').addEventListener('click', resume);
    $('btn-quit').addEventListener('click', quit);
    $('btn-retry').addEventListener('click', retry);
    $('btn-menu').addEventListener('click', quit);
  },
};
