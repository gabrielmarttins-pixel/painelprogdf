const fs = require('fs');
let s = fs.readFileSync('app.js','utf8');
s = s.replace('const STORAGE_KEY = "painel-prog-data";', 'const STORAGE_KEY = "painel-prog-laboratorio-data";\nconst LABORATORY_MODE = true;');
s = s.replace('    blocks: "",','    blocks: "",\n    intervals: "",');
s = s.replace('calls: program?.calls?.length ? program.calls : defaults.program.calls,','calls: Array.isArray(program?.calls) ? program.calls : defaults.program.calls,');
s = s.replace('async function loadData() {','async function loadData() {\n  if (LABORATORY_MODE) return loadLocalData();');
s = s.replace('async function saveData(data) {\n  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));','async function saveData(data) {\n  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));\n  if (LABORATORY_MODE) return;');
s = s.replace('  form.elements.program.addEventListener("change", () => {', `  const importInput = document.getElementById("exhibition-file");
  document.getElementById("import-exhibition").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    if (!file) return;
    const button = document.getElementById("import-exhibition");
    button.disabled = true;
    setText("exhibition-status", "Lendo base de exibição...");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter até 10 MB.");
      const buffer = await file.arrayBuffer();
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { text = new TextDecoder("windows-1252").decode(buffer); }
      const imported = ExhibitionImport.parse(text);
      const drafts = { ...currentData.drafts };
      syncNotesEditor(form, { rewrite: true });
      const current = readProgramForm(form);
      if (current.program) drafts[current.program] = current;
      imported.forEach(entry => {
        drafts[entry.program] = normalizeProgramEntry({ ...drafts[entry.program], ...entry });
      });
      const selected = current.program || imported[0].program;
      const updated = { ...currentData, drafts, updatedAt: formatDateTime(new Date()) };
      await saveData(updated);
      currentData = updated;
      populateProgramFields(form, drafts[selected], selected);
      const missing = ["BOM DIA DF", "DF1", "GLOBO ESPORTE", "DF2"].filter(name => !imported.some(p => p.program === name));
      setText("exhibition-status", file.name + " — " + imported.map(p => p.program + ": " + p.blocks + " blocos, " + p.intervals + " intervalos, " + p.calls.length + " chamadas").join("; ") + ". Rascunhos salvos. Selecione o programa e envie a previsão." + (missing.length ? " Ausentes na base (preservados): " + missing.join(", ") + "." : ""));
      setText("last-update", updated.updatedAt);
    } catch (error) {
      setText("exhibition-status", "Base não importada: " + error.message);
    } finally { button.disabled = false; importInput.value = ""; }
  });

  form.elements.program.addEventListener("change", () => {`);
s = s.replace('value : value || "";', 'value : value ?? "";');
s = s.replace('field === "time" ? normalizeTimeWithSeconds(value) : value || "";', 'field === "time" ? normalizeTimeWithSeconds(value) : value ?? "";');
s = s.replace('  Object.entries(normalizedProgram).forEach', `  const blocksSelect = form.elements.blocks;
  if (normalizedProgram.blocks && ![...blocksSelect.options].some(option => option.value === normalizedProgram.blocks)) {
    blocksSelect.add(new Option(normalizedProgram.blocks, normalizedProgram.blocks));
  }
  Object.entries(normalizedProgram).forEach`);
s = s.replace('  communityBlockFields?.classList.toggle("is-hidden", !showCommunityBlocks);','  communityBlockFields?.classList.toggle("is-hidden", !showCommunityBlocks);\n  document.querySelector(".intervals-count-field")?.classList.toggle("is-hidden", showCommunityBlocks);');
s = s.replace('    blocks: getProgramBlocksFromForm(form),','    intervals: form.elements.intervals.value,\n    blocks: getProgramBlocksFromForm(form),');
s = s.replace("'BLOCOS', artworkBlocks,", "data.intervals !== '' && !isCommunityProgram(data.program) ? 'BLOCOS / INTERVALOS' : 'BLOCOS', data.intervals !== '' && !isCommunityProgram(data.program) ? artworkBlocks + ' / ' + data.intervals : artworkBlocks,");
s = s.replace('<span>BLOCOS: ${escapeHtml(getProgramBlocksDisplay(program))}</span>', '<span>BLOCOS: ${escapeHtml(getProgramBlocksDisplay(program))}</span>\n            ${!isCommunityProgram(program.program) && program.intervals !== "" ? `<span>|</span><span>INTERVALOS: ${escapeHtml(program.intervals)}</span>` : ""}');
fs.writeFileSync('app.js',s);
let h=fs.readFileSync('coordination/index.html','utf8');
h=h.replace('      <form id="coordination-form"', `      <section class="input-panel" aria-label="Importar base de exibição">
        <button type="button" class="primary-button" id="import-exhibition">Enviar base de Exibição</button>
        <input type="file" id="exhibition-file" accept=".csv,text/csv" hidden />
        <p>Importe o CSV da Consulta Analítica para BOM DIA DF, DF1, GLOBO ESPORTE e DF2. GLOBO COMUNIDADE permanece manual.</p>
        <p>Produção: soma dos blocos PD. Horário: início do primeiro PD. Intervalos: sequências PT. Chamadas: modalidade CH, incluindo IP.</p>
        <p id="exhibition-status" role="status" aria-live="polite"></p>
      </section>

      <form id="coordination-form"`);
h=h.replace('          <div class="community-block-fields', `          <label class="intervals-count-field">
            <span>INTERVALOS</span>
            <input name="intervals" type="number" min="0" step="1" />
          </label>

          <div class="community-block-fields`);
h=h.replace('data-call-field="time" type="time"', 'data-call-field="time" type="time" step="1"');
h=h.replace('    <script src="../app.js?v=72"></script>', '    <script src="../exhibition-import.js?v=1"></script>\n    <script src="../app.js?v=73"></script>');
fs.writeFileSync('coordination/index.html',h);
let index=fs.readFileSync('index.html','utf8').replace('app.js?v=72','app.js?v=73'); fs.writeFileSync('index.html',index);
