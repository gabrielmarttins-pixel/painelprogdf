const assert=require('assert/strict'),fs=require('fs'),{parse}=require('../exhibition-import.js');
const csv=fs.readFileSync('C:/Users/gamartin/Downloads/Consulta_Analitica_DF_21_09_2026.csv','utf8');
const header='Id;Programa;Apresenta;Titulo;Segmento;Duracao;HoraInicio;DataExibicao;Modalidade';
const base=['BOM DIA DF','DF1','GLOBO ESPORTE','DF2'].map(n=>`SW;${n};${n};${n};PD1;00:10:00;06:00:00;21/09/2026;`).join('\n');
const cases=[['BDDF amanhã','CH'],['bom dia df hoje','CH'],['DF1 hoje','CH'],['DF2 hoje','CH'],['GE hoje','CH'],['GLOBO ESPORTE hoje','CH'],['VIAGEM','CH'],['DF10','CH'],['DF1 comercial','PT'],['DF1 ELEITORAL','CH'],['GE eleitoral','CH'],['DF2 Eleitoral','CH'],['BDDF ELEITORAL','CH']];
const rows=cases.map(([title,mode],i)=>`${i};OUTRO;;${title};PT1;00:00:30;05:00:00;21/09/2026;${mode}`).join('\n');
assert.deepEqual(parse(header+'\n'+base+'\n'+rows).map(p=>p.calls.length),[2,1,2,1]);
console.log('PASS: aliases, títulos em outros programas, modalidade CH e limites de palavras.');
console.log(parse(csv).map(p=>p.program+': '+p.calls.length+' chamadas').join('\n'));
