import {parseResults} from '../src/bench/results/parse.js';
import {escapeXml as esc} from '../src/bench/render/svg-distribution.js';
import {renderView} from './view.js';
import {runBench} from './run.js';
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
    location.search = viewHref([path]);
  } catch (error) {
    show([{file: name + '.json', results}]);
    const blob = new Blob([JSON.stringify(results, null, 2) + '\n'], {type: 'application/json'}),
      note = document.createElement('p');
    note.className = 'note';
    note.innerHTML = `Not saved on the server (${esc(error.message)}). <a download="${esc(name)}.json" href="${URL.createObjectURL(blob)}">Download the results</a>.`;
    main.prepend(note);
  }
};

const run = (file, url) =>
  runBench(main, {
    file,
    url,
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
<div class="bench-list"><p class="muted">Searching…</p></div>
<p><label class="file-input">Open a bench file… <input type="file" class="bench-input" accept=".js,.mjs,text/javascript"></label></p>
<p class="note">Each function runs in its own iframe, in interleaved rounds. A local file must be self-contained: its own imports can't be resolved. Results are saved under <code>nano-bench-results/</code> on the server.</p>
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

  benchInput.addEventListener('change', () => {
    const file = benchInput.files?.[0];
    if (file) run(file.name, URL.createObjectURL(file));
  });

  fetch('/--nano-bench/benches')
    .then(r => r.json())
    .then(benches => {
      benchList.innerHTML = benches.length
        ? `<ul class="benches">${benches
            .map(
              b =>
                `<li><a href="?run=${encodeURIComponent(b.path).replaceAll('%2F', '/')}">${esc(b.path)}</a></li>`
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
