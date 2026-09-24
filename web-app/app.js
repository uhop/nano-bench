import {parseResults} from '../src/bench/results/parse.js';
import {escapeXml as esc} from '../src/bench/render/svg-distribution.js';
import {renderView} from './view.js';

const main = /** @type {HTMLElement} */ (document.querySelector('main'));

const encodePath = p => p.split('/').map(encodeURIComponent).join('/');

const viewHref = paths => '?' + paths.map(p => 'view=' + encodeURIComponent(p)).join('&');

const showError = message => {
  main.innerHTML = `<section class="error"><p>${esc(message)}</p><p><a href="./">Back to the results list</a></p></section>`;
};

const loadRemote = async paths =>
  Promise.all(
    paths.map(async file => {
      const response = await fetch('/' + encodePath(file));
      if (!response.ok) throw new Error(`${file}: ${response.status} ${response.statusText}`);
      return {file, results: parseResults(await response.text(), file)};
    })
  );

const loadLocal = async fileList =>
  Promise.all(
    Array.from(fileList, async f => ({file: f.name, results: parseResults(await f.text(), f.name)}))
  );

const show = files => {
  document.title = files.map(f => f.file.split('/').pop()).join(', ') + ' · nano-bench';
  renderView(main, files);
};

const formatDate = iso => (iso ? iso.replace(/^([^T]+)T(\d\d:\d\d).*$/, '$1 $2') : '');

const renderPicker = async () => {
  document.title = 'Results · nano-bench';
  main.innerHTML = `<section>
<h2>Results on the server</h2>
<div class="picker-list"><p class="muted">Searching…</p></div>
<div class="actions"><button type="button" class="compare" disabled>Compare selected</button></div>
</section>
<section>
<h2>Results on this computer</h2>
<p><label class="file-input">Open files… <input type="file" accept=".json,application/json" multiple></label></p>
<p class="note">Files opened here are read by the browser and not uploaded; the page URL does not record them.</p>
</section>`;

  const list = /** @type {HTMLElement} */ (main.querySelector('.picker-list')),
    compare = /** @type {HTMLButtonElement} */ (main.querySelector('.compare')),
    input = /** @type {HTMLInputElement} */ (main.querySelector('input[type=file]'));

  input.addEventListener('change', async () => {
    if (!input.files?.length) return;
    try {
      show(await loadLocal(input.files));
    } catch (error) {
      showError(error.message);
    }
  });

  let entries;
  try {
    const response = await fetch('/--nano-bench/results');
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    entries = await response.json();
  } catch (error) {
    list.innerHTML = `<p class="error">Cannot list results: ${esc(error.message)}</p>`;
    return;
  }
  if (!entries.length) {
    list.innerHTML = `<p class="muted">No nano-bench results files were found under the server’s root folder. Write one with <code>nano-bench --json &lt;file&gt;</code>.</p>`;
    return;
  }

  list.innerHTML = `<div class="scroll"><table class="picker">
<thead><tr><th></th><th>File</th><th>Series</th><th>Created</th><th>Runtime</th></tr></thead>
<tbody>${entries
    .map(
      (e, i) => `<tr>
<td><input type="checkbox" data-index="${i}" aria-label="Select ${esc(e.path)}"></td>
<td class="name"><a href="${viewHref([e.path])}">${esc(e.path)}</a>${e.label ? ` <span class="tag">${esc(e.label)}</span>` : ''}</td>
<td>${esc(e.series.join(', '))}</td>
<td class="num">${esc(formatDate(e.createdAt))}</td>
<td>${esc(e.runtime ?? '')}${e.host ? ` · ${esc(e.host)}` : ''}</td>
</tr>`
    )
    .join('')}</tbody></table></div>`;

  const selected = () =>
    Array.from(list.querySelectorAll('input[type=checkbox]:checked'), box =>
      Number(/** @type {HTMLElement} */ (box).dataset.index)
    );
  list.addEventListener('change', () => {
    compare.disabled = selected().length < 1;
    compare.textContent = selected().length > 1 ? 'Compare selected' : 'View selected';
  });
  compare.addEventListener('click', () => {
    location.search = viewHref(selected().map(i => entries[i].path));
  });
};

const paths = new URLSearchParams(location.search).getAll('view');
if (paths.length) {
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    show(await loadRemote(paths));
  } catch (error) {
    showError(error.message);
  }
} else {
  await renderPicker();
}
