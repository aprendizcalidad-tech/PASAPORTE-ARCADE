const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const folder of ['js','google-apps-script'])for(const name of fs.readdirSync(path.join(root,folder))){
 const file=path.join(root,folder,name);
 if(name.endsWith('.gs'))new vm.Script(fs.readFileSync(file,'utf8'),{filename:name});
 else if(name.endsWith('.js')){const result=cp.spawnSync(process.execPath,['--input-type=module','--check'],{input:fs.readFileSync(file),encoding:'utf8'});if(result.status)throw new Error(name+': '+result.stderr);}
}
for(const name of ['package.json','firebase.json','firestore.indexes.json','google-apps-script/appsscript.json'])JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
if(fs.readFileSync(path.join(root,'js/normalizer.js'),'utf8')!==fs.readFileSync(path.join(root,'google-apps-script/Normalizer.gs'),'utf8'))throw new Error('Normalizadores diferentes');
console.log('Sintaxis JS/GAS y JSON: correcta. Normalizador compartido: idéntico.');
