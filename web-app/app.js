import {parseResults} from '../src/bench/results/parse.js';
import {escapeXml as esc} from '../src/bench/render/svg-distribution.js';
import {renderView} from './view.js';
import {crossSiteOrigin, report, runBench} from './run.js';
import './components/nano-bench-progress.js';

const main = /** @type {HTMLElement} */ (document.querySelector('main'));

const encodePath = p => p.split('/').map(encodeURIComponent).join('/');

const viewHref = paths =>
  '?' + paths.map(p => 'view=' + encodeURIComponent(p).replaceAll('%2F', '/')).join('&');

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

const query = new URLSearchParams(location.search),
  numberParam = (name, fallback) => {
    const value = Number(query.get(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

const saveAndShow = async (results, name) => {
  try {
    const response = await fetch('/--nano-bench/save?name=' + encodeURIComponent(name), {
      method: 'POST',
      body: JSON.stringify(results)
    });
    if (!response.ok) throw new Error(await response.text());
    const {path} = await response.json();
    await report({type: 'saved', path});
    location.search = viewHref([path]);
  } catch (error) {
    report({type: 'error', message: `not saved on the server: ${error.message}`});
    show([{file: name + '.json', results}]);
    const blob = new Blob([JSON.stringify(results, null, 2) + '\n'], {type: 'application/json'}),
      note = document.createElement('p');
    note.className = 'note';
    note.innerHTML = `Not saved on the server (${esc(error.message)}). <a download="${esc(name)}.json" href="${URL.createObjectURL(blob)}">Download the results</a>.`;
    main.prepend(note);
  }
};

const run = (file, url, {source = null, crossSite = query.get('frames') === 'cross'} = {}) =>
  runBench(main, {
    file,
    url,
    source,
    crossSite,
    exportName: query.get('export') || 'default',
    ms: numberParam('ms', 50),
    samples: numberParam('samples', 100),
    onDone: saveAndShow
  });

const formatDate = iso => (iso ? iso.replace(/^([^T]+)T(\d\d:\d\d).*$/, '$1 $2') : '');

const renderPicker = async () => {
  document.title = 'Results · nano-bench';
  main.innerHTML = `<section>
<h2>Run a benchmark</h2>
<p><label><input type="checkbox" class="cross-site"> Run each function in a cross-site frame</label> <span class="muted cross-site-note"></span></p>
<div class="bench-list"><p class="muted">Searching…</p></div>
<div class="drop-zone"><p><label class="file-input">Open a bench file… <input type="file" class="bench-input" accept=".js,.mjs,text/javascript"></label> or drop one here.</p></div>
<details class="paste"><summary>Paste bench code</summary>
<p><textarea class="paste-code" rows="10" spellcheck="false" placeholder="export default {&#10;  a: n => { for (let i = 0; i < n; ++i) { /* … */ } },&#10;  b: n => { for (let i = 0; i < n; ++i) { /* … */ } }&#10;};"></textarea></p>
<p><button type="button" class="paste-run">Run the pasted code</button></p>
</details>
<p class="note">Each function runs in its own iframe, in interleaved rounds. A cross-site frame is served from the other loopback name (<code>localhost</code> or <code>127.0.0.1</code>), so browsers that isolate sites (Chromium with site isolation, desktop Firefox) give each function its own process; WebKit does not. A local or pasted file must be self-contained: its own imports can't be resolved. Results are saved under <code>nano-bench-results/</code> on the server.</p>
</section>
<section>
<h2>Results on the server</h2>
<div class="picker-list"><p class="muted">Searching…</p></div>
<div class="actions"><button type="button" class="compare" disabled>Compare selected</button> <button type="button" class="clear" disabled>Clear selection</button></div>
</section>
<section>
<h2>Results on this computer</h2>
<p><label class="file-input">Open files… <input type="file" accept=".json,application/json" multiple></label></p>
<p class="note">Files opened here are read by the browser and not uploaded; the page URL does not record them.</p>
</section>`;

  const list = /** @type {HTMLElement} */ (main.querySelector('.picker-list')),
    compare = /** @type {HTMLButtonElement} */ (main.querySelector('.compare')),
    clear = /** @type {HTMLButtonElement} */ (main.querySelector('.clear')),
    input = /** @type {HTMLInputElement} */ (main.querySelector('input[accept^=".json"]')),
    benchList = /** @type {HTMLElement} */ (main.querySelector('.bench-list')),
    benchInput = /** @type {HTMLInputElement} */ (main.querySelector('.bench-input'));

  const crossBox = /** @type {HTMLInputElement} */ (main.querySelector('.cross-site')),
    crossNote = /** @type {HTMLElement} */ (main.querySelector('.cross-site-note')),
    dropZone = /** @type {HTMLElement} */ (main.querySelector('.drop-zone')),
    pasteCode = /** @type {HTMLTextAreaElement} */ (main.querySelector('.paste-code')),
    pasteRun = /** @type {HTMLButtonElement} */ (main.querySelector('.paste-run'));
  if (!crossSiteOrigin()) {
    crossBox.disabled = true;
    crossNote.textContent = '(needs the page on localhost or 127.0.0.1)';
  }
  crossBox.checked = !crossBox.disabled && query.get('frames') === 'cross';

  const runLocal = async (name, text) => {
    const url = URL.createObjectURL(new Blob([text], {type: 'text/javascript'}));
    await run(name, url, {source: text, crossSite: crossBox.checked});
  };

  benchInput.addEventListener('change', async () => {
    const file = benchInput.files?.[0];
    if (file) await runLocal(file.name, await file.text());
  });

  dropZone.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dropZone.classList.add('over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', async event => {
    event.preventDefault();
    dropZone.classList.remove('over');
    const file = event.dataTransfer?.files?.[0];
    if (file) await runLocal(file.name, await file.text());
  });

  pasteRun.addEventListener('click', async () => {
    if (pasteCode.value.trim()) await runLocal('snippet.js', pasteCode.value);
  });

  const benchHref = path =>
    `?run=${encodeURIComponent(path).replaceAll('%2F', '/')}${crossBox.checked ? '&frames=cross' : ''}`;
  crossBox.addEventListener('change', () => {
    for (const link of /** @type {NodeListOf<HTMLAnchorElement>} */ (
      benchList.querySelectorAll('a[data-path]')
    ))
      link.href = benchHref(/** @type {string} */ (link.dataset.path));
  });

  fetch('/--nano-bench/benches')
    .then(r => r.json())
    .then(benches => {
      benchList.innerHTML = benches.length
        ? `<ul class="benches">${benches
            .map(
              b =>
                `<li><a data-path="${esc(b.path)}" href="${esc(benchHref(b.path))}">${esc(b.path)}</a></li>`
            )
            .join('')}</ul>`
        : '<p class="muted">No bench files (<code>bench-*.js</code> or <code>*.bench.js</code>) were found under the server’s root folder.</p>';
    })
    .catch(
      error =>
        (benchList.innerHTML = `<p class="error">Cannot list bench files: ${esc(error.message)}</p>`)
    );

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

  const checked = () =>
      /** @type {HTMLInputElement[]} */ (
        Array.from(list.querySelectorAll('input[type=checkbox]:checked'))
      ),
    selected = () => checked().map(box => Number(box.dataset.index)),
    update = () => {
      const count = checked().length;
      compare.disabled = clear.disabled = count < 1;
      compare.textContent =
        count > 1
          ? `Compare selected (${count})`
          : count === 1
            ? 'View selected'
            : 'Compare selected';
    };
  list.addEventListener('change', update);
  clear.addEventListener('click', () => {
    for (const box of checked()) box.checked = false;
    update();
  });
  compare.addEventListener('click', () => {
    location.search = viewHref(selected().map(i => entries[i].path));
  });
};

const paths = query.getAll('view'),
  runPath = query.get('run');
if (runPath) {
  document.title = runPath.split('/').pop() + ' · running · nano-bench';
  await run(runPath, '/' + encodePath(runPath));
} else if (paths.length) {
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    show(await loadRemote(paths));
  } catch (error) {
    showError(error.message);
  }
} else {
  await renderPicker();
}
