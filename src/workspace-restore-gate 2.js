export function workspaceContextMatches(workspace,current,pending){return workspace===pending&&workspace?.ownerId===current.ownerId&&workspace.projectId===current.projectId&&workspace.fieldId===current.fieldId;}
export function mountWorkspaceRestoreGate({document,isPending,onBlocked=()=>{}}){
 const allowed='.brand,.mobile-brand-tool-trigger,.mobile-editor-tool-trigger,#tool-selector';
 const block=event=>{if(!isPending()||event.target?.closest?.(allowed)||event.type==='keydown'&&event.key==='Tab')return;event.preventDefault();event.stopImmediatePropagation();onBlocked();};
 const events=['click','pointerdown','touchstart','touchmove','wheel','keydown','input','change'];
 for(const type of events)document.addEventListener(type,block,{capture:true,passive:false});
 return {destroy(){for(const type of events)document.removeEventListener(type,block,true);}};
}
