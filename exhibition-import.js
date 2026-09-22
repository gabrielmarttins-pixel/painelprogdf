(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
  const aliases = { 'BOM DIA DF': 'BOM DIA DF', 'BOM DIA PRACA': 'BOM DIA DF', DF1: 'DF1', 'PRACA TV I': 'DF1', 'GLOBO ESPORTE': 'GLOBO ESPORTE', 'GLOBO ESPORTE DF': 'GLOBO ESPORTE', DF2: 'DF2', 'PRACA TV II': 'DF2' };
  const callTitles = {
    'BOM DIA DF': /\b(?:BDDF|BOM DIA DF)\b/,
    DF1: /\bDF1\b/,
    DF2: /\bDF2\b/,
    'GLOBO ESPORTE': /\b(?:GE|GLOBO ESPORTE)\b/,
  };
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, '');
    const delimiter = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
    const rows = []; let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && char === delimiter) { row.push(value); value = ''; }
      else if (!quoted && (char === '\n' || char === '\r')) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = '';
      } else value += char;
    }
    if (quoted) throw new Error('CSV inválido: aspas não fechadas.');
    row.push(value); if (row.some(cell => cell.trim())) rows.push(row);
    const headers = (rows.shift() || []).map(normalize);
    const required = ['ID', 'PROGRAMA', 'APRESENTA', 'TITULO', 'SEGMENTO', 'DURACAO', 'HORAINICIO', 'DATAEXIBICAO', 'MODALIDADE'];
    if (required.some(key => !headers.includes(key))) throw new Error('Arquivo inválido. Envie o CSV de Consulta Analítica com as colunas de exibição.');
    return rows.map((cells, index) => {
      if (cells.length !== headers.length) throw new Error(`Quantidade de colunas inválida na linha ${index + 2}.`);
      return Object.fromEntries(headers.map((key, i) => [key, cells[i].trim()]));
    });
  }
  function seconds(value) {
    if (!/^\d{2}:[0-5]\d:[0-5]\d$/.test(value) || Number(value.slice(0, 2)) > 23) throw new Error(`Horário ou duração inválida: ${value || '(vazio)'}.`);
    return value.split(':').reduce((total, n) => total * 60 + Number(n), 0);
  }
  function duration(total) { return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':'); }
  function dateISO(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) throw new Error(`Data de exibição inválida: ${value}.`);
    const result = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${result}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result) throw new Error(`Data de exibição inválida: ${value}.`);
    return result;
  }
  function parse(text) {
    const rows = parseCsv(text), groups = {}, dates = new Set();
    const isDf2Bulletin = row => /^PD\d*$/.test(normalize(row.SEGMENTO)) &&
      [row.PROGRAMA, row.APRESENTA, row.TITULO].some(value => /\bBOLETIM DF2\b/.test(normalize(value)));
    let previous = '';
    rows.forEach(row => {
      if (isDf2Bulletin(row)) { previous = ''; return; }
      const name = aliases[normalize(row.APRESENTA)] || aliases[normalize(row.PROGRAMA)];
      if (!name) { previous = ''; return; }
      const date = dateISO(row.DATAEXIBICAO); dates.add(date);
      seconds(row.HORAINICIO); const length = seconds(row.DURACAO);
      const group = groups[name] ||= { program: name, date, time: '', productionSeconds: 0, blocks: 0, intervals: 0, calls: [] };
      const segment = normalize(row.SEGMENTO);
      if (/^PD\d+$/.test(segment)) {
        if (!group.time) group.time = row.HORAINICIO;
        group.productionSeconds += length; group.blocks++;
      }
      const intervalKey = `${name}|${date}|${segment}`;
      if (/^PT\d+$/.test(segment) && previous !== intervalKey) group.intervals++;
      previous = intervalKey;
    });
    // The airing program is not the promoted program: search every CH title.
    rows.forEach(row => {
      if (normalize(row.MODALIDADE) !== 'CH') return;
      const title = normalize(row.TITULO);
      if (title.includes('ELEITORAL')) return;
      Object.entries(callTitles).forEach(([name, pattern]) => {
        if (!groups[name] || !pattern.test(title)) return;
        dates.add(dateISO(row.DATAEXIBICAO));
        seconds(row.HORAINICIO); seconds(row.DURACAO);
        groups[name].calls.push({ id: /^(SW-1|SW-2)$/i.test(row.ID) ? 'AO VIVO' : row.ID, name: row.TITULO, duration: row.DURACAO, time: row.HORAINICIO });
      });
    });
    if (groups.DF2) {
      const bulletins = rows.filter(isDf2Bulletin);
      if (bulletins.length > 1) throw new Error('A base contém mais de um BOLETIM DF2 em PD. Envie uma base com um único boletim para preencher o campo BOLETIM.');
      if (bulletins.length) {
        const row = bulletins[0];
        dates.add(dateISO(row.DATAEXIBICAO));
        seconds(row.HORAINICIO); seconds(row.DURACAO);
        groups.DF2.bulletin = { id: /^(SW-1|SW-2)$/i.test(row.ID) ? 'AO VIVO' : row.ID, name: row.TITULO || row.APRESENTA || row.PROGRAMA, duration: row.DURACAO, time: row.HORAINICIO };
      }
    }
    if (dates.size > 1) throw new Error('A base contém mais de uma data. Envie um arquivo de um único dia.');
    const programs = Object.values(groups);
    if (!programs.length) throw new Error('Nenhum dos quatro programas foi encontrado na base.');
    programs.forEach(program => {
      if (!program.blocks) throw new Error(`Não foram encontrados blocos PD para ${program.program}.`);
      if (program.productionSeconds >= 86400) throw new Error(`Produção maior que 24 horas para ${program.program}.`);
      program.production = duration(program.productionSeconds); delete program.productionSeconds;
      program.blocks = String(program.blocks); program.intervals = String(program.intervals);
    });
    return programs;
  }
  root.ExhibitionImport = { parse };
  if (typeof module !== 'undefined') module.exports = root.ExhibitionImport;
})(typeof window !== 'undefined' ? window : globalThis);
