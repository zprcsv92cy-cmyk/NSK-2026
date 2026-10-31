export function patchSweHockeyRemovalWorker(source,oldSwe,newSwe,oldVisibility,newVisibility,stateModule){
 const classic=s=>s.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').trim();
 const once=(before,after)=>{if(source.split(before).length!==2)throw Error('Unexpected live Worker source: '+before.slice(0,70));source=source.replace(before,after);};
 if(source.includes('function sweHockeyPoolKey('))throw Error('SweHockey removal already installed');
 once(classic(oldSwe),classic(newSwe));once(classic(oldVisibility),classic(newVisibility));
 return source+'\n'+classic(stateModule)+'\n';
}
