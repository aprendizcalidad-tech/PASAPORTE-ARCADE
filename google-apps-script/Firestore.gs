function fsRoot_(){return 'projects/'+cfg_().project+'/databases/(default)/documents';}
function value_(v){
  if(v===null) return {nullValue:null};
  if(typeof v==='string') return {stringValue:v};
  if(typeof v==='boolean') return {booleanValue:v};
  if(typeof v==='number') return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(Array.isArray(v)) return {arrayValue:{values:v.map(value_)}};
  var fields={};Object.keys(v).forEach(function(k){fields[k]=value_(v[k]);});return {mapValue:{fields:fields}};
}
function plain_(v){
  if('stringValue' in v)return v.stringValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return v.doubleValue;
  if('booleanValue' in v)return v.booleanValue;
  if('nullValue' in v)return null;
  if('arrayValue' in v)return (v.arrayValue.values||[]).map(plain_);
  var o={};Object.keys((v.mapValue||{}).fields||{}).forEach(function(k){o[k]=plain_(v.mapValue.fields[k]);});return o;
}
function fsRequest_(path,method,body,allowMissing){
  var options={method:method,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true};
  if(body){options.contentType='application/json';options.payload=JSON.stringify(body);}
  for(var attempt=0;attempt<4;attempt++){
    var r=UrlFetchApp.fetch('https://firestore.googleapis.com/v1/'+fsRoot_()+path,options), code=r.getResponseCode();
    if(code>=200 && code<300)return JSON.parse(r.getContentText());
    if(code===404 && allowMissing)return null;
    if((code===429 || code>=500) && attempt<3){Utilities.sleep(700*Math.pow(2,attempt));continue;}
    // No incluir tokens ni cuerpos con datos de personas en los errores.
    throw new Error('Firestore HTTP '+code+'. Revisa permisos IAM, API habilitada y cuota.');
  }
}
function fsGet_(path){var d=fsRequest_('/'+path,'get',null,true);return d?plain_({mapValue:{fields:d.fields||{}}}):null;}
function write_(path,data,createOnly){
  var w={update:{name:fsRoot_()+'/'+path,fields:value_(data).mapValue.fields}};
  if(createOnly)w.currentDocument={exists:false};
  return w;
}
function fsCommit_(writes){if(writes.length)fsRequest_(':commit','post',{writes:writes},false);}
